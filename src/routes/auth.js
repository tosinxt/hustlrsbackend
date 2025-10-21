import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { supabase, supabaseAdmin } from '../services/supabase.js';
import { sendVerificationCode, verifyCode } from '../services/smsService.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const router = Router();

// Inactivity threshold (30 days)
const INACTIVITY_THRESHOLD = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

// Generate JWT token
// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
};

// Generate 6-digit verification code
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Hash password
const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
};

// Check if user needs OTP (inactive for 30+ days)
const needsOTPVerification = (user) => {
  if (!user.lastActivityAt) return false;
  const daysSinceActivity = Date.now() - new Date(user.lastActivityAt).getTime();
  return daysSinceActivity > INACTIVITY_THRESHOLD;
};

const comparePasswords = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

// Validation middleware
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Register new user
router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('firstName').notEmpty().trim(),
    body('lastName').notEmpty().trim(),
    body('phoneNumber').notEmpty().trim(),
    body('userType').optional().isIn(['CUSTOMER', 'HUSTLER', 'BOTH'])
  ],
  validateRequest,
  async (req, res) => {
    try {
      // Handle both camelCase and snake_case request bodies
      const { 
        email, 
        password, 
        firstName, 
        lastName, 
        phoneNumber,
        // Handle both camelCase and snake_case
        first_name = firstName,
        last_name = lastName,
        phone_number = phoneNumber,
        user_type = 'CUSTOMER',
        userType = user_type
      } = req.body;

      // Validate required fields
      if (!email || !password || !first_name || !last_name || !phone_number) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields',
          errors: [
            !email && 'Email is required',
            !password && 'Password is required',
            !first_name && 'First name is required',
            !last_name && 'Last name is required',
            !phone_number && 'Phone number is required'
          ].filter(Boolean)
        });
      }

      // Check if user already exists
      const { data: existingUser, error: userError } = await supabase
        .from('users')
        .select('*')
        .or(`email.eq.${email},phone_number.eq.${phone_number}`)
        .maybeSingle();

      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'User with this email or phone number already exists'
        });
      }

      // Hash password
      const hashedPassword = await hashPassword(password);

      // Create user using admin client to bypass RLS
      const { data: newUser, error: createError } = await supabaseAdmin
        .from('users')
        .insert([
          {
            email: email.toLowerCase().trim(),
            password_hash: hashedPassword,
            first_name: first_name.trim(),
            last_name: last_name.trim(),
            phone_number: phone_number.trim(),
            user_type: userType.toUpperCase(),
            is_verified: false,
            is_active: true
          }
        ])
        .select()
        .single();

      if (createError) throw createError;
      if (!newUser) throw new Error('Failed to create user');

      // Send verification code
      const smsResult = await sendVerificationCode(phone_number);
      if (!smsResult.success) {
        console.error('Failed to send verification code:', smsResult.message);
        // Don't fail the registration, just log the error
      }

      // Generate token
      const token = generateToken(newUser.id);

      // Return success response
      return res.status(201).json({
        success: true,
        message: 'User registered successfully. ' + (smsResult.success ? 'Verification code sent.' : 'Failed to send verification code.'),
        requiresVerification: true,
        data: {
          user: {
            id: newUser.id,
            email: newUser.email,
            firstName: newUser.first_name,
            lastName: newUser.last_name,
            phoneNumber: newUser.phone_number,
            userType: newUser.user_type,
            isVerified: newUser.is_verified
          },
          token
        }
      });
    } catch (error) {
      console.error('Registration error:', error);
      return res.status(500).json({
        success: false,
        message: 'Registration failed',
        error: error.message
      });
    }
  }
);

// User login
router.post(
  '/login',
  [
    body('identifier').notEmpty().withMessage('Email or phone number is required'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { identifier, password } = req.body;

      // Find user by email or phone
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('*')
        .or(`email.eq.${identifier},phone_number.eq.${identifier}`)
        .single();

      if (userError || !user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      // Check password
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      // Check if user needs OTP due to inactivity
      if (needsOTPVerification(user)) {
        // Generate and send OTP
        const code = generateVerificationCode();
        verificationCodes.set(identifier, {
          code,
          userId: user.id,
          expiresAt: Date.now() + 10 * 60 * 1000
        });

        // Try to send OTP
        try {
          if (user.phone_number && process.env.TWILIO_ACCOUNT_SID) {
            await twilioClient.messages.create({
              body: `Your Hustlrs verification code is: ${code}`,
              from: process.env.TWILIO_PHONE_NUMBER,
              to: user.phone_number
            });
          }
        } catch (error) {
          console.log('OTP send failed, logging code:', code);
        }

        console.log('🔍 INACTIVITY OTP:', code, 'for', identifier);

        return res.json({
          success: false,
          requiresOTP: true,
          message: 'Account inactive. Please verify with OTP.',
          identifier
        });
      }

      // Update last login time
      await supabase
        .from('users')
        .update({ 
          last_login_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      // Generate JWT token
      const token = generateToken(user.id);

      // Prepare user data without sensitive information
      const userData = {
        id: user.id,
        email: user.email,
        phoneNumber: user.phone_number,
        firstName: user.first_name,
        lastName: user.last_name,
        userType: user.user_type,
        isVerified: user.is_verified,
        rating: user.rating || 0,
        tasksCompleted: user.tasks_completed || 0,
        avatar: user.avatar_url
      };

      // Return success response
      return res.json({
        success: true,
        message: 'Login successful',
        data: {
          token,
          user: userData
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        message: 'Login failed',
        error: error.message
      });
    }
  }
);

/**
 * @route   POST /api/auth/verify-inactivity
 * @desc    Verify OTP for inactive account
 * @access  Public
 */
router.post('/verify-inactivity', [
  body('identifier').notEmpty().withMessage('Identifier is required'),
  body('code').isLength({ min: 6, max: 6 }).withMessage('Verification code must be 6 digits')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { identifier, code } = req.body;
    
    // Check verification code
    const storedData = verificationCodes.get(identifier);
    
    if (!storedData || !storedData.userId) {
      return res.status(400).json({
        success: false,
        message: 'Verification code not found or expired'
      });
    }

    if (storedData.code !== code) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code'
      });
    }

    if (Date.now() > storedData.expiresAt) {
      verificationCodes.delete(identifier);
      return res.status(400).json({
        success: false,
        message: 'Verification code expired'
      });
    }

    // Get user and update activity
    const user = await prisma.user.update({
      where: { id: storedData.userId },
      data: {
        lastLoginAt: new Date(),
        lastActivityAt: new Date()
      }
    });

    // Remove used code
    verificationCodes.delete(identifier);

    // Generate JWT token
    const token = generateToken(user.id);

    res.json({
      success: true,
      message: 'Verification successful',
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          phoneNumber: user.phoneNumber,
          firstName: user.firstName,
          lastName: user.lastName,
          userType: user.userType,
          isVerified: user.isVerified,
          rating: user.rating,
          tasksCompleted: user.tasksCompleted,
          avatar: user.avatar
        }
      }
    });

  } catch (error) {
    console.error('Verify inactivity error:', error);
    res.status(500).json({
      success: false,
      message: 'Verification failed'
    });
  }
});

/**
 * @route   POST /api/auth/refresh-token
 * @desc    Refresh JWT token
 * @access  Private
 */
router.post('/refresh-token', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    // Verify current token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Generate new token
    const newToken = generateToken(decoded.userId);

    res.json({
      success: true,
      data: { token: newToken }
    });

  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
});

// Get current user
const getCurrentUser = async (req, res) => {
  try {
    // Get token from header
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', decoded.userId)
      .single();

    if (error || !user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Remove sensitive data
    const { password, ...userWithoutPassword } = user;

    res.status(200).json({
      success: true,
      user: userWithoutPassword
    });
  } catch (error) {
    console.error('Error getting current user:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};

// Add the route for getting current user
router.get('/me', getCurrentUser);

// Verify phone number
router.post(
  '/verify-phone',
  [
    body('phoneNumber').notEmpty().trim(),
    body('code').notEmpty().isLength({ min: 6, max: 6 })
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { phoneNumber, code } = req.body;
      
      const result = verifyCode(phoneNumber, code);
      
      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      // Update user as verified
      const { data: user, error } = await supabaseAdmin
        .from('users')
        .update({ is_verified: true })
        .eq('phone_number', phoneNumber)
        .select()
        .single();

      if (error) throw error;

      return res.json({
        success: true,
        message: 'Phone number verified successfully',
        data: {
          isVerified: true
        }
      });
    } catch (error) {
      console.error('Error verifying phone:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to verify phone number',
        error: error.message
      });
    }
  }
);

// Resend verification code
router.post(
  '/resend-verification',
  [
    body('phoneNumber').notEmpty().trim()
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { phoneNumber } = req.body;
      
      const result = await sendVerificationCode(phoneNumber);
      
      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.json({
        success: true,
        message: 'Verification code resent successfully'
      });
    } catch (error) {
      console.error('Error resending verification code:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to resend verification code',
        error: error.message
      });
    }
  }
);

// Alias /signup to /register
router.post('/signup', (req, res, next) => {
  req.url = '/register';
  next();
}, router);

export default router;
