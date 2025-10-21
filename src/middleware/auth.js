import jwt from 'jsonwebtoken';
import { supabase } from '../services/supabase.js';

export const authMiddleware = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
    
    // Get user from database
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, user_type')
      .eq('id', decoded.userId)
      .single();

    if (error || !user) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    // Add user to request object
    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({ message: 'Not authorized' });
  }
};

// Middleware to check if user is a hustler
export const isHustler = (req, res, next) => {
  if (req.user && req.user.user_type === 'hustler') {
    return next();
  }
  return res.status(403).json({ message: 'Access denied. Hustler role required.' });
};

// Middleware to check if user is a customer
export const isCustomer = (req, res, next) => {
  if (req.user && req.user.user_type === 'customer') {
    return next();
  }
  return res.status(403).json({ message: 'Access denied. Customer role required.' });
};
