import { Request, Response, NextFunction } from 'express';

interface AppError extends Error {
  statusCode?: number;
  code?: number;
  errors?: any[];
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('Error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : {},
    path: req.path,
    method: req.method,
    body: req.body,
    params: req.params,
    query: req.query,
  });

  // Default status code
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let errors = err.errors;

  // Handle common error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
    errors = [];
    
    // Format Joi validation errors
    if (err.details) {
      errors = err.details.map((detail: any) => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));
    }
    // Format express-validator errors
    else if (Array.isArray(err)) {
      errors = err.map((e: any) => ({
        field: e.param,
        message: e.msg,
      }));
    }
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  } else if (err.code === '23505') {
    // PostgreSQL unique violation
    statusCode = 409;
    message = 'Duplicate key error';
    errors = [{
      message: 'A record with this value already exists',
      field: err.detail?.match(/Key \(([^)]+)\)/)?.[1],
    }];
  } else if (err.code === '23503') {
    // Foreign key violation
    statusCode = 400;
    message = 'Reference error';
    errors = [{
      message: 'Invalid reference',
      detail: err.detail,
    }];
  }

  // Send error response
  res.status(statusCode).json({
    success: false,
    message,
    errors,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

// 404 Not Found handler
export const notFound = (req: Request, res: Response, next: NextFunction) => {
  const error = new Error(`Not Found - ${req.originalUrl}`) as AppError;
  error.statusCode = 404;
  next(error);
};
