const express = require('express');
const { body, validationResult } = require('express-validator');
const AuthService = require('../services/authService');
const router = express.Router();

// Input validation middleware
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
    body('email').optional().isEmail().normalizeEmail(),
    body('phone_number').optional().isMobilePhone(),
    body('password').isLength({ min: 6 }),
    body('first_name').notEmpty().trim(),
    body('last_name').notEmpty().trim(),
    body('user_type').isIn(['CUSTOMER', 'HUSTLER', 'BOTH'])
  ],
  validateRequest,
  async (req, res) => {
    try {
      const user = await AuthService.registerUser(req.body);
      
      res.status(200).json({
        success: true,
        message: 'Verification code sent',
        identifier: user.email || user.phone_number
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Registration failed'
      });
    }
  }
);

// Verify signup
router.post(
  '/verify',
  [
    body('identifier').notEmpty(),
    body('code').isLength({ min: 6, max: 6 })
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { identifier, code } = req.body;
      const { user, token } = await AuthService.verifyUser(identifier, code);

      res.status(200).json({
        success: true,
        message: 'Account verified successfully',
        user,
        token
      });
    } catch (error) {
      console.error('Verification error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Verification failed'
      });
    }
  }
);

// Login
router.post(
  '/login',
  [
    body('identifier').notEmpty(),
    body('password').notEmpty()
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { identifier, password } = req.body;
      const { user, token } = await AuthService.authenticate(identifier, password);
      
      res.status(200).json({
        success: true,
        message: 'Login successful',
        user,
        token
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(401).json({
        success: false,
        message: error.message || 'Authentication failed'
      });
    }
  }
);

// Resend verification code
router.post(
  '/resend-code',
  [
    body('identifier').notEmpty()
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { identifier } = req.body;
      await AuthService.resendVerificationCode(identifier);
      
      res.status(200).json({
        success: true,
        message: 'Verification code resent successfully'
      });
    } catch (error) {
      console.error('Resend code error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to resend verification code'
      });
    }
  }
);

// Resend verification code
router.post(
  '/resend-code',
  [body('identifier').notEmpty()],
  validateRequest,
  async (req, res) => {
    try {
      const { identifier } = req.body;
      
      // Check if user exists
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('*')
        .or(`email.eq.${identifier},phone_number.eq.${identifier}`)
        .single();

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Generate new verification code
      const verificationCode = AuthService.generateVerificationCode();
      
      // Store unverified user
      await AuthService.storeUnverifiedUser({
        ...user,
        verificationCode
      });

      // Send verification code
      if (user.phone_number) {
        await sendVerificationCode(user.phone_number, verificationCode);
      }
      // TODO: Add email verification

      res.status(200).json({
        success: true,
        message: 'Verification code resent',
        identifier
      });
    } catch (error) {
      console.error('Resend code error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to resend verification code'
      });
    }
  }
);

// Get current user
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', decoded.userId)
      .single();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update last activity
    await supabaseAdmin
      .from('users')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('id', user.id);

    res.status(200).json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
});

module.exports = router;
