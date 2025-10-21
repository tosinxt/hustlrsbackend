const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabase, supabaseAdmin } = require('./supabase');
const { sendVerificationCode } = require('./smsService');

const JWT_SECRET = process.env.JWT_SECRET;
const VERIFICATION_CODE_EXPIRY_MINUTES = 30;
const INACTIVITY_THRESHOLD_DAYS = 30;

class AuthService {
  // Generate JWT token
  static generateToken(userId) {
    return jwt.sign(
      { userId },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
  }

  // Generate 6-digit verification code
  static generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Hash password
  static async hashPassword(password) {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
  }

  // Compare password with hash
  static async comparePasswords(password, hash) {
    return await bcrypt.compare(password, hash);
  }

  // Check if user needs OTP verification
  static needsOTPVerification(user) {
    if (!user.last_activity_at) return true;
    const daysSinceActivity = (Date.now() - new Date(user.last_activity_at).getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceActivity > INACTIVITY_THRESHOLD_DAYS;
  }

  // Store unverified user in database
  static async storeUnverifiedUser(userData) {
    const { email, phone_number, verificationCode, ...rest } = userData;
    
    // Delete any existing unverified user with the same email or phone
    await supabaseAdmin
      .from('unverified_users')
      .delete()
      .or(`email.eq.${email},phone_number.eq.${phone_number}`);
    
    // Insert new unverified user
    const { data, error } = await supabaseAdmin
      .from('unverified_users')
      .insert([{
        email: email || null,
        phone_number: phone_number || null,
        verification_code: verificationCode,
        user_data: rest,
        expires_at: new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000).toISOString()
      }])
      .select()
      .single();
      
    if (error) throw error;
    return data;
  }

  // Get unverified user by identifier (email or phone)
  static async getUnverifiedUser(identifier) {
    const { data, error } = await supabaseAdmin
      .from('unverified_users')
      .select('*')
      .or(`email.eq.${identifier},phone_number.eq.${identifier}`)
      .single();

    if (error || !data) return null;
    return data;
  }

  // Verify user code and create account
  static async verifyAndCreateUser(identifier, code) {
    const unverifiedUser = await this.getUnverifiedUser(identifier);
    if (!unverifiedUser) {
      throw new Error('Invalid or expired verification request');
    }

    if (unverifiedUser.verification_code !== code) {
      throw new Error('Invalid verification code');
    }

    // Create the user
    const { user_data } = unverifiedUser;
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .insert([{
        ...user_data,
        is_verified: true,
        last_activity_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    // Clean up
    await supabaseAdmin
      .from('unverified_users')
      .delete()
      .eq('id', unverifiedUser.id);

    return user;
  }

  // Authenticate user
  static async authenticate(identifier, password) {
    // First try to find by email
    let { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .or(`email.eq.${identifier},phone_number.eq.${identifier}`)
      .single();

    if (error || !user) {
      throw new Error('Invalid credentials');
    }

    // Verify password
    const isMatch = await this.comparePasswords(password, user.password_hash);
    if (!isMatch) {
      throw new Error('Invalid credentials');
    }

    // Check if OTP is needed
    const needsOTP = this.needsOTPVerification(user);
    if (needsOTP) {
      const verificationCode = this.generateVerificationCode();
      await this.storeUnverifiedUser({
        ...user,
        verificationCode
      });
      
      // Send OTP via SMS or email
      if (user.phone_number) {
        await sendVerificationCode(user.phone_number, verificationCode);
      }
      
      return { requiresOTP: true };
    }

    // Update last login
    await supabaseAdmin
      .from('users')
      .update({ 
        last_login_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString()
      })
      .eq('id', user.id);

    // Generate token
    const token = this.generateToken(user.id);
    return { user, token };
  }

  // Verify OTP for login
  static async verifyLoginOTP(identifier, code) {
    const unverifiedUser = await this.getUnverifiedUser(identifier);
    if (!unverifiedUser || unverifiedUser.verification_code !== code) {
      throw new Error('Invalid or expired verification code');
    }

    // Get the user
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .or(`email.eq.${identifier},phone_number.eq.${identifier}`)
      .single();

    if (error) throw error;

    // Update last login and activity
    await supabaseAdmin
      .from('users')
      .update({ 
        last_login_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString()
      })
      .eq('id', user.id);

    // Clean up
    await supabaseAdmin
      .from('unverified_users')
      .delete()
      .eq('id', unverifiedUser.id);

    // Generate token
    const token = this.generateToken(user.id);
    return { user, token };
  }
}

module.exports = AuthService;
