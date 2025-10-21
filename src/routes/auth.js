import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { supabase, supabaseAdmin } from '../services/supabase.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const router = Router();

// JWT Secret from environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
const SALT_ROUNDS = 10;

// Helper functions
const hashPassword = async (password) => {
  return await bcrypt.hash(password, SALT_ROUNDS);
};

const comparePasswords = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
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

      // Generate token
      const token = generateToken(newUser.id);

      // Return success response
      return res.status(201).json({
        success: true,
        message: 'User registered successfully',
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
        message: 'An error occurred during registration',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// User login
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { email, password } = req.body;

      // Find user by email
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();

      if (userError || !user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      // Verify password
      const isPasswordValid = await comparePasswords(password, user.password_hash);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      // Check if user is active
      if (!user.is_active) {
        return res.status(403).json({
          success: false,
          message: 'Account is deactivated. Please contact support.'
        });
      }

      // Update last login time
      await supabase
        .from('users')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', user.id);

      // Generate token
      const token = generateToken(user.id);

      // Remove sensitive data
      const { password_hash, ...userWithoutPassword } = user;

      return res.json({
        success: true,
        message: 'Login successful',
        data: {
          user: userWithoutPassword,
          token
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      return res.status(500).json({
        success: false,
        message: 'An error occurred during login',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// Get current user profile
export const getCurrentUser = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated'
      });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error || !user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Remove sensitive data
    const { password_hash, ...userWithoutPassword } = user;

    return res.json({
      success: true,
      data: userWithoutPassword
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch user profile'
    });
  }
};

// Add the route for getting current user
router.get('/me', getCurrentUser);

// Alias /signup to /register
router.post('/signup', (req, res) => {
  req.url = '/register';
  router.handle(req, res);
});

export default router;
