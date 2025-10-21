import { Request, Response, NextFunction } from 'express';

interface AppError extends Error {
  statusCode?: number;
  code?: string | number;
  errors?: any[];
  details?: any;
  detail?: string;
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
    if (err.details && Array.isArray(err.details)) {
      errors = (err.details as any[]).map((detail: any) => ({
        field: Array.isArray(detail.path) ? detail.path.join('.') : detail.path,
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
    const fieldMatch = typeof err.detail === 'string' ? err.detail.match(/\(([^)]+)\)=/)?.[1] : undefined;
    errors = [{
      message: 'A record with this value already exists',
      field: fieldMatch,
    }];
  } else if (err.code === '23503') {
    // Foreign key violation
    statusCode = 400;
    message = 'Reference error';
    errors = [{
      message: 'Invalid reference',
      detail: typeof err.detail === 'string' ? err.detail : 'Reference error occurred',
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
