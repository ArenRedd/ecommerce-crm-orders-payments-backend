const AppError = require('../utils/AppError');

/**
 * RBAC Permission Guard Middleware
 * Verifies that the authenticated user possesses the required permission key.
 * Administrators have blanket bypass permissions.
 *
 * @param {string} permissionKey - e.g. 'orders.read', 'orders.create', 'orders.cancel'
 * @returns {Function} Express middleware
 */
const requirePermission = (permissionKey) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('User context missing. Authentication required before authorization.', 401));
    }

    // Admin role override
    if (req.user.role === 'admin' || req.user.role === 'superadmin') {
      return next();
    }

    const permissions = Array.isArray(req.user.permissions) ? req.user.permissions : [];

    if (!permissions.includes(permissionKey)) {
      return next(
        new AppError(
          `Forbidden: You lack the required permission '${permissionKey}' to perform this action.`,
          403,
          { requiredPermission: permissionKey, userPermissions: permissions }
        )
      );
    }

    next();
  };
};

/**
 * Requires at least one of the supplied permissions
 * @param {string[]} permissionKeys
 * @returns {Function} Express middleware
 */
const requireAnyPermission = (permissionKeys = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('User context missing. Authentication required before authorization.', 401));
    }

    if (req.user.role === 'admin' || req.user.role === 'superadmin') {
      return next();
    }

    const permissions = Array.isArray(req.user.permissions) ? req.user.permissions : [];
    const hasAny = permissionKeys.some(p => permissions.includes(p));

    if (!hasAny) {
      return next(
        new AppError(
          `Forbidden: Requires at least one of permissions: [${permissionKeys.join(', ')}]`,
          403,
          { requiredPermissions: permissionKeys, userPermissions: permissions }
        )
      );
    }

    next();
  };
};

module.exports = {
  requirePermission,
  requireAnyPermission
};
