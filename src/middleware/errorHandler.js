export const errorHandler = (err, req, res, next) => {
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
      errors = err.details.map((detail) => ({
        field: Array.isArray(detail.path) ? detail.path.join('.') : detail.path,
        message: detail.message,
      }));
    }
    // Format express-validator errors
    else if (Array.isArray(err)) {
      errors = err.map((e) => ({
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
  } else if (err.code === '23505') { // PostgreSQL unique violation
    statusCode = 409;
    message = 'Duplicate entry';
    errors = [{
      field: err.detail ? err.detail.match(/Key \(([^)]+)\)=/)[1] : '',
      message: 'This value already exists',
    }];
  } else if (err.code === '23503') { // PostgreSQL foreign key violation
    statusCode = 400;
    message = 'Invalid reference';
    errors = [{
      field: err.detail ? err.detail.match(/Key \(([^)]+)\)=/)[1] : '',
      message: 'Referenced record does not exist',
    }];
  } else if (err.code === '22P02') { // PostgreSQL invalid text representation
    statusCode = 400;
    message = 'Invalid input syntax';
  }

  // Handle Prisma errors
  if (err.code && err.code.startsWith('P2')) {
    statusCode = 400;
    message = 'Database error';
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
export const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};
