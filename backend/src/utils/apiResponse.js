/**
 * Standard API Response envelope helper
 * Structure: { success, data, message, pagination? }
 */

const success = (res, { statusCode = 200, message = 'Success', data = null, pagination = null }) => {
  const responseBody = {
    success: true,
    message,
    data
  };

  if (pagination) {
    responseBody.pagination = pagination;
  }

  return res.status(statusCode).json(responseBody);
};

const created = (res, { message = 'Resource created successfully', data = null }) => {
  return success(res, { statusCode: 201, message, data });
};

const paginated = (res, { data = [], pagination, message = 'Records retrieved successfully' }) => {
  return success(res, {
    statusCode: 200,
    message,
    data,
    pagination
  });
};

const error = (res, { statusCode = 500, message = 'An error occurred', errors = null }) => {
  const responseBody = {
    success: false,
    message
  };

  if (errors && (Array.isArray(errors) ? errors.length > 0 : Object.keys(errors).length > 0)) {
    responseBody.errors = errors;
  }

  return res.status(statusCode).json(responseBody);
};

module.exports = {
  success,
  created,
  paginated,
  error
};
