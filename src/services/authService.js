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
    
    // Check if user already exists in either table
    const { data: existingVerifiedUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .or(`email.eq.${email || ''},phone_number.eq.${phone_number || ''}`)
      .single();

    if (existingVerifiedUser) {
      throw new Error('User with this email or phone already exists');
    }

    // Also check in unverified_users to prevent duplicate signups
    const { data: existingUnverifiedUser } = await supabaseAdmin
      .from('unverified_users')
      .select('id')
      .or(`email.eq.${email || ''},phone_number.eq.${phone_number || ''}`)
      .single();

    if (existingUnverifiedUser) {
      // Delete existing unverified user to replace with new one
      await supabaseAdmin
        .from('unverified_users')
        .delete()
        .eq('id', existingUnverifiedUser.id);
    }

    // Generate verification code
    const verificationCode = this.generateVerificationCode();
    console.log(`🔑 Generated verification code: ${verificationCode}`);
    
    // Hash password
    const passwordHash = await this.hashPassword(password);

    // Store in unverified_users table first
    const userDataToStore = {
      first_name,
      last_name,
      user_type,
      password_hash: passwordHash
    };

    const { data: unverifiedUser, error } = await supabaseAdmin
      .from('unverified_users')
      .insert([{
        email: email || null,
        phone_number: phone_number || null,
        verification_code: verificationCode,
        user_data: userDataToStore,
        verification_attempts: 0,
        expires_at: new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating unverified user:', error);
      throw new Error('Failed to create user account');
    }

    console.log(`✅ Stored unverified user with ID: ${unverifiedUser.id}`);

    // Send verification code via SMS or email
    if (phone_number) {
      console.log(`📤 Sending verification code to: ${phone_number}`);
      await sendVerificationCode(phone_number, verificationCode);
    } else if (email) {
      // TODO: Implement email verification
      console.log(`📧 Verification code for ${email}: ${verificationCode}`);
    }

    return unverifiedUser;
  }

  // Verify user with code
  static async verifyUser(identifier, code) {
    console.log(`🔍 [VERIFY] Looking for unverified user with identifier: ${identifier}`);
    
    // First, try to find the unverified user
    const { data: unverifiedUser, error: unverifiedError } = await supabaseAdmin
      .from('unverified_users')
      .select('*')
      .or(`email.eq.${identifier},phone_number.eq.${identifier}`)
      .single();

    if (unverifiedError || !unverifiedUser) {
      console.log('❌ [VERIFY] No unverified user found');
      throw new Error('Invalid or expired verification request');
    }

    console.log('✅ [VERIFY] Found unverified user:', unverifiedUser.id);
    console.log(`🔢 [VERIFY] Stored verification code: ${unverifiedUser.verification_code}`);
    console.log(`🔢 [VERIFY] Provided verification code: ${code}`);

    // Check verification code
    if (unverifiedUser.verification_code !== code) {
      console.log('❌ [VERIFY] Code mismatch. Incrementing attempts...');
      
      // Increment verification attempts
      await supabaseAdmin
        .from('unverified_users')
        .update({ verification_attempts: (unverifiedUser.verification_attempts || 0) + 1 })
        .eq('id', unverifiedUser.id);
      
      throw new Error('Invalid verification code');
    }

    // Check if verification code has expired
    if (new Date(unverifiedUser.expires_at) < new Date()) {
      console.log('❌ [VERIFY] Verification code has expired');
      throw new Error('Verification code has expired');
    }

    console.log('✅ [VERIFY] Code verified successfully');

    // Create the user in the main users table
    const { data: newUser, error: createError } = await supabaseAdmin
      .from('users')
      .insert([{
        email: unverifiedUser.email,
        phone_number: unverifiedUser.phone_number,
        first_name: unverifiedUser.user_data?.first_name,
        last_name: unverifiedUser.user_data?.last_name,
        user_type: unverifiedUser.user_data?.user_type,
        password_hash: unverifiedUser.user_data?.password_hash,
        is_verified: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (createError) {
      console.error('❌ [VERIFY] Error creating user:', createError);
      throw new Error('Failed to create user account');
    }

    console.log('✅ [VERIFY] User created successfully:', newUser.id);

    // Delete the unverified user record
    await supabaseAdmin
      .from('unverified_users')
      .delete()
      .eq('id', unverifiedUser.id);

    // Generate token
    const token = this.generateToken(newUser.id);
    return { user: newUser, token };
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
