const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const twilio = require('twilio');

const router = express.Router();
const prisma = new PrismaClient();

// Initialize Twilio (for SMS verification)
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Temporary storage for verification codes (use Redis in production)
const verificationCodes = new Map();

// Inactivity threshold (30 days)
const INACTIVITY_THRESHOLD = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

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

/**
 * @route   POST /api/auth/signup
 * @desc    Register new user and send OTP
 * @access  Public
 */
router.post('/signup', [
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('phoneNumber').optional().isMobilePhone().withMessage('Please provide a valid phone number'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required'),
  body('userType').isIn(['CUSTOMER', 'HUSTLER', 'BOTH']).withMessage('Invalid user type')
], async (req, res) => {
  try {
    console.log('\n📝 SIGNUP REQUEST');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation Errors:', JSON.stringify(errors.array(), null, 2));
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg,
        errors: errors.array()
      });
    }

    const { email, phoneNumber, password, firstName, lastName, userType } = req.body;
    console.log('✅ Validation passed');
    console.log('User details:', { email, phoneNumber, firstName, lastName, userType });

    // Check if user already exists
    console.log('🔍 Checking for existing user...');
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { phoneNumber }
        ]
      }
    });

    if (existingUser) {
      console.log('⚠️  User already exists');
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email or phone number'
      });
    }
    console.log('✅ No existing user found');

    // Hash password
    console.log('🔐 Hashing password...');
    const hashedPassword = await hashPassword(password);

    // Generate OTP
    const code = generateVerificationCode();
    const identifier = email || phoneNumber;
    console.log('🔢 Generated OTP:', code, 'for identifier:', identifier);
    
    // Store code temporarily (expires in 10 minutes)
    verificationCodes.set(identifier, {
      code,
      email,
      phoneNumber,
      password: hashedPassword,
      firstName,
      lastName,
      userType,
      expiresAt: Date.now() + 10 * 60 * 1000
    });
    console.log('💾 Verification code stored');

    // Send OTP via SMS or Email
    let otpSent = false;
    try {
      if (phoneNumber && process.env.TWILIO_ACCOUNT_SID) {
        await twilioClient.messages.create({
          body: `Your Hustlrs verification code is: ${code}`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: phoneNumber
        });
        otpSent = true;
      }
    } catch (error) {
      console.log('OTP send failed, logging code:', code);
    }

    console.log('✅ SIGNUP SUCCESS');
    console.log('📧 OTP:', code, 'for', identifier);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    res.json({
      success: true,
      message: otpSent ? 'Verification code sent' : 'Verification code generated (check server logs)',
      identifier
    });

  } catch (error) {
    console.error('\n❌ SIGNUP ERROR');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    res.status(500).json({
      success: false,
      message: 'Registration failed'
    });
  }
});

/**
 * @route   POST /api/auth/verify-signup
 * @desc    Verify OTP and complete signup
 * @access  Public
 */
router.post('/verify-signup', [
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
    
    if (!storedData) {
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

    // Create user
    const user = await prisma.user.create({
      data: {
        email: storedData.email,
        phoneNumber: storedData.phoneNumber,
        password: storedData.password,
        firstName: storedData.firstName,
        lastName: storedData.lastName,
        userType: storedData.userType,
        isVerified: true,
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
      message: 'Account created successfully',
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
          tasksCompleted: user.tasksCompleted
        }
      }
    });

  } catch (error) {
    console.error('Verify signup error:', error);
    res.status(500).json({
      success: false,
      message: 'Verification failed'
    });
  }
});

/**
 * @route   POST /api/auth/login
 * @desc    Login with email/phone + password
 * @access  Public
 */
router.post('/login', [
  body('identifier').notEmpty().withMessage('Email or phone number is required'),
  body('password').notEmpty().withMessage('Password is required')
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

    const { identifier, password } = req.body;

    // Find user by email or phone
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { phoneNumber: identifier }
        ]
      }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
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
        if (user.phoneNumber && process.env.TWILIO_ACCOUNT_SID) {
          await twilioClient.messages.create({
            body: `Your Hustlrs verification code is: ${code}`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: user.phoneNumber
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

    // Update last login and activity
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        lastActivityAt: new Date()
      }
    });

    // Generate JWT token
    const token = generateToken(user.id);

    res.json({
      success: true,
      message: 'Login successful',
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
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed'
    });
  }
});

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

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user (client-side token removal)
 * @access  Private
 */
router.post('/logout', (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

module.exports = router;
