const AppError = require('../utils/AppError');
const apiResponse = require('../utils/apiResponse');
const env = require('../config/env');

/**
 * Global Error Handler Middleware
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let errors = err.errors || null;

  // Handle Mongoose Bad ObjectId (CastError)
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid format for field '${err.path}': '${err.value}'`;
    errors = [{ field: err.path, message }];
  }

  // Handle Mongoose Duplicate Key Error (E11000)
  if (err.code === 11000) {
    statusCode = 409;
    const duplicatedKeys = Object.keys(err.keyValue || {});
    message = `Duplicate field value entered: ${duplicatedKeys.join(', ')}. Must be unique.`;
    errors = duplicatedKeys.map(key => ({
      field: key,
      message: `${key} '${err.keyValue[key]}' already exists`
    }));
  }

  // Handle Mongoose Validation Error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Database validation error';
    errors = Object.values(err.errors).map(e => ({
      field: e.path,
      message: e.message
    }));
  }

  // Handle Malformed JSON payload
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    statusCode = 400;
    message = 'Malformed JSON payload in request body';
    errors = [{ message: err.message }];
  }

  // Log 500 internal errors for debugging
  if (statusCode >= 500) {
    console.error(`[Unhandled Error 500] ${req.method} ${req.originalUrl}:`, err);
  }

  return apiResponse.error(res, {
    statusCode,
    message,
    errors
  });
};

/**
 * 404 Not Found Catch-All Middleware
 */
const notFoundHandler = (req, res, next) => {
  next(new AppError(`Endpoint '${req.method} ${req.originalUrl}' not found on this server`, 404));
};

module.exports = {
  errorHandler,
  notFoundHandler
};
