import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult, ValidationChain } from 'express-validator';
import { supabase } from '../services/supabase';
import jwt from 'jsonwebtoken';

type UserType = 'CUSTOMER' | 'HUSTLER' | 'BOTH';

interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  user_type: UserType;
  last_login_at?: string;
  last_activity_at?: string;
}

interface AuthRequest extends Request {
  body: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    userType?: UserType;
    token?: string;
    newPassword?: string;
  };
  headers: {
    authorization?: string;
  };
  user?: any; // You might want to type this more specifically
}

export const router = Router();

// Generate JWT token for session management
const generateToken = (userId: string) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET || 'your_jwt_secret',
    { expiresIn: '30d' }
  );
};

// Register a new user
router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('firstName').notEmpty().trim(),
    body('lastName').notEmpty().trim(),
    body('phoneNumber').notEmpty().trim(),
    body('userType').optional().isIn(['CUSTOMER', 'HUSTLER', 'BOTH']),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password, firstName, lastName, phoneNumber, userType = 'CUSTOMER' } = req.body;

      // Check if user already exists
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .or(`email.eq.${email},phone_number.eq.${phoneNumber}`)
        .single();

      if (existingUser) {
        return res.status(400).json({ message: 'User with this email or phone number already exists' });
      }

      // Sign up with Supabase Auth
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
            phone_number: phoneNumber,
            user_type: userType,
          },
        },
      });

      if (signUpError) {
        throw signUpError;
      }

      // Create user profile in the database
      const { data: user, error: profileError } = await supabase
        .from('users')
        .insert({
          id: authData.user?.id,
          email,
          first_name: firstName,
          last_name: lastName,
          phone_number: phoneNumber,
          user_type: userType,
        })
        .select()
        .single();

      if (profileError) {
        // Clean up auth user if profile creation fails
        await supabase.auth.admin.deleteUser(authData.user?.id || '');
        throw profileError;
      }

      // Generate JWT token
      const token = generateToken(user.id);

      res.status(201).json({
        user,
        token,
      });
    } catch (error: any) {
      console.error('Registration error:', error);
      res.status(500).json({
        message: error.message || 'An error occurred during registration',
      });
    }
  }
);

// Login user
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').exists(),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;

      // Sign in with Supabase Auth
      const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      // Get user profile
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authData.user?.id)
        .single();

      if (userError) {
        throw userError;
      }

      // Update last login time
      await supabase
        .from('users')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', user.id);

      // Generate JWT token
      const token = generateToken(user.id);

      res.json({
        user,
        token,
      });
    } catch (error: any) {
      console.error('Login error:', error);
      res.status(500).json({
        message: error.message || 'An error occurred during login',
      });
    }
  }
);

// Get current user
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret') as { userId: string };
    
    // Get user from database
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', decoded.userId)
      .single();

    if (error) {
      throw error;
    }

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update last activity time
    await supabase
      .from('users')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('id', user.id);

    res.json({ user });
  } catch (error: any) {
    console.error('Get user error:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    res.status(500).json({
      message: error.message || 'An error occurred while fetching user',
    });
  }
});

// Logout
router.post('/logout', async (req, res) => {
  try {
    await supabase.auth.signOut();
    res.json({ message: 'Logged out successfully' });
  } catch (error: any) {
    console.error('Logout error:', error);
    res.status(500).json({
      message: error.message || 'An error occurred during logout',
    });
  }
});

// Forgot password
router.post(
  '/forgot-password',
  [body('email').isEmail().normalizeEmail()],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email } = req.body;

      // Send password reset email
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.APP_URL}/reset-password`,
      });

      if (error) {
        throw error;
      }

      res.json({ message: 'Password reset email sent' });
    } catch (error: any) {
      console.error('Forgot password error:', error);
      res.status(500).json({
        message: error.message || 'An error occurred while processing your request',
      });
    }
  }
);

// Reset password
router.post(
  '/reset-password',
  [
    body('token').notEmpty(),
    body('newPassword').isLength({ min: 6 }),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { token, newPassword } = req.body;

      // Update password
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        throw error;
      }

      res.json({ message: 'Password reset successful' });
    } catch (error: any) {
      console.error('Reset password error:', error);
      res.status(500).json({
        message: error.message || 'An error occurred while resetting your password',
      });
    }
  }
);

export default router;
