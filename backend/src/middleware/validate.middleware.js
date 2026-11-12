const AppError = require('../utils/AppError');

/**
 * Zod Schema Validation Middleware
 * Validates request body, query params, and URL path params against Zod schemas.
 *
 * @param {Object} schemas
 * @param {import('zod').ZodType} [schemas.body]
 * @param {import('zod').ZodType} [schemas.query]
 * @param {import('zod').ZodType} [schemas.params]
 */
const validate = (schemas = {}) => {
  return async (req, res, next) => {
    try {
      const errors = [];

      if (schemas.params) {
        const result = schemas.params.safeParse(req.params);
        if (!result.success) {
          result.error.issues.forEach(issue => {
            errors.push({
              location: 'params',
              field: issue.path.join('.'),
              message: issue.message
            });
          });
        } else {
          req.params = result.data;
        }
      }

      if (schemas.query) {
        const result = schemas.query.safeParse(req.query);
        if (!result.success) {
          result.error.issues.forEach(issue => {
            errors.push({
              location: 'query',
              field: issue.path.join('.'),
              message: issue.message
            });
          });
        } else {
          req.query = result.data;
        }
      }

      if (schemas.body) {
        const result = schemas.body.safeParse(req.body);
        if (!result.success) {
          result.error.issues.forEach(issue => {
            errors.push({
              location: 'body',
              field: issue.path.join('.'),
              message: issue.message
            });
          });
        } else {
          req.body = result.data;
        }
      }

      if (errors.length > 0) {
        return next(new AppError('Request validation failed', 400, errors));
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};

module.exports = validate;
