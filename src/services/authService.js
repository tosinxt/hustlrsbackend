const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabase, supabaseAdmin } = require('./supabase');
const { sendVerificationCode } = require('./smsService');

const JWT_SECRET = process.env.JWT_SECRET;
const VERIFICATION_CODE_EXPIRY_MINUTES = 30;

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

  // Register a new user
  static async registerUser(userData) {
    const { email, phone_number, password, first_name, last_name, user_type } = userData;
    
    // Check if user already exists
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .or(`email.eq.${email || ''},phone_number.eq.${phone_number || ''}`)
      .single();

    if (existingUser) {
      throw new Error('User with this email or phone already exists');
    }

    // Generate verification code
    const verificationCode = this.generateVerificationCode();
    
    // Hash password
    const passwordHash = await this.hashPassword(password);

    // Create user with verification code
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .insert([{
        email: email || null,
        phone_number: phone_number || null,
        password_hash: passwordHash,
        first_name,
        last_name,
        user_type,
        verification_code: verificationCode,
        verification_expires: new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000).toISOString(),
        is_verified: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    // Send verification code via SMS or email
    if (phone_number) {
      await sendVerificationCode(phone_number, verificationCode);
    }

    return user;
  }

  // Verify user with code
  static async verifyUser(identifier, code) {
    // Find user by email or phone
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .or(`email.eq.${identifier},phone_number.eq.${identifier}`)
      .single();

    if (error || !user) {
      throw new Error('User not found');
    }

    // Check if already verified
    if (user.is_verified) {
      throw new Error('User is already verified');
    }

    // Check verification code and expiration
    if (user.verification_code !== code) {
      throw new Error('Invalid verification code');
    }

    if (new Date(user.verification_expires) < new Date()) {
      throw new Error('Verification code has expired');
    }

    // Mark user as verified
    const { data: updatedUser, error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        is_verified: true,
        verification_code: null,
        verification_expires: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Generate token
    const token = this.generateToken(updatedUser.id);
    return { user: updatedUser, token };
  }

  // Authenticate user
  static async authenticate(identifier, password) {
    // First try to find by email or phone
    const { data: user, error } = await supabaseAdmin
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

    // Check if user is verified
    if (!user.is_verified) {
      throw new Error('Please verify your account first');
    }

    // Update last login
    await supabaseAdmin
      .from('users')
      .update({ 
        last_login_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    // Generate token
    const token = this.generateToken(user.id);
    return { user, token };
  }

  // Resend verification code
  static async resendVerificationCode(identifier) {
    // Find user by email or phone
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .or(`email.eq.${identifier},phone_number.eq.${identifier}`)
      .single();

    if (error || !user) {
      throw new Error('User not found');
    }

    if (user.is_verified) {
      throw new Error('User is already verified');
    }

    // Generate new verification code
    const verificationCode = this.generateVerificationCode();

    // Update user with new verification code
    await supabaseAdmin
      .from('users')
      .update({
        verification_code: verificationCode,
        verification_expires: new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    // Send new verification code
    if (user.phone_number) {
      await sendVerificationCode(user.phone_number, verificationCode);
    }

    return { success: true };
  }
}

module.exports = AuthService;
