const jwt = require('jsonwebtoken');
const env = require('../config/env');
const AppError = require('../utils/AppError');

/**
 * All Phase 1 RBAC Permissions
 */
const ALL_PERMISSIONS = [
  'orders.read',
  'orders.create',
  'orders.update_status',
  'orders.cancel',
  'payments.read',
  'payments.create',
  'returns.read',
  'returns.create',
  'returns.approve',
  'refunds.approve'
];

/**
 * Role to default permissions mapping for stubs & mock users
 */
const ROLE_PERMISSIONS_MAP = {
  admin: ALL_PERMISSIONS,
  manager: [
    'orders.read',
    'orders.create',
    'orders.update_status',
    'orders.cancel',
    'payments.read',
    'payments.create',
    'returns.read',
    'returns.create',
    'returns.approve',
    'refunds.approve'
  ],
  support_agent: [
    'orders.read',
    'orders.create',
    'orders.update_status',
    'orders.cancel',
    'payments.read',
    'returns.read',
    'returns.create'
  ],
  viewer: [
    'orders.read',
    'payments.read',
    'returns.read'
  ],
  customer: [
    'orders.read',
    'orders.create',
    'orders.cancel',
    'payments.create',
    'returns.read',
    'returns.create'
  ]
};

/**
 * Helper to generate a valid signed JWT for testing or service-to-service calls
 */
const generateToken = (userData) => {
  const role = userData.role || 'admin';
  const payload = {
    id: userData.id || userData.userId || 'usr_dev_001',
    name: userData.name || 'CRM Dev Admin',
    email: userData.email || 'admin@examplecrm.com',
    role,
    permissions: userData.permissions || ROLE_PERMISSIONS_MAP[role] || ALL_PERMISSIONS
  };

  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
};

/**
 * Authentication Middleware
 * Validates incoming JWT or handles stubbed mock header if teammate's Auth module is offline.
 */
const authenticate = (req, res, next) => {
  try {
    let token = null;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    // 1. If JWT is provided, verify it
    if (token) {
      try {
        const decoded = jwt.verify(token, env.JWT_SECRET);
        req.user = {
          id: decoded.id || decoded.userId || decoded.sub,
          name: decoded.name || 'Authenticated User',
          email: decoded.email,
          role: decoded.role || 'viewer',
          permissions: Array.isArray(decoded.permissions)
            ? decoded.permissions
            : (ROLE_PERMISSIONS_MAP[decoded.role] || [])
        };
        return next();
      } catch (jwtErr) {
        throw new AppError(`Invalid or expired authentication token: ${jwtErr.message}`, 401);
      }
    }

    // 2. Mock auth header support for development / teammate stubbing
    if (req.headers['x-mock-user']) {
      try {
        const mockUser = JSON.parse(req.headers['x-mock-user']);
        const role = mockUser.role || 'admin';
        req.user = {
          id: mockUser.id || 'usr_mock_001',
          name: mockUser.name || 'Mock User',
          email: mockUser.email || 'mock@example.com',
          role,
          permissions: mockUser.permissions || ROLE_PERMISSIONS_MAP[role] || []
        };
        return next();
      } catch {
        throw new AppError('Malformed x-mock-user header JSON', 400);
      }
    }

    // 3. Fallback header for role selection (e.g. x-user-role: admin / support_agent / viewer)
    if (req.headers['x-user-role']) {
      const role = req.headers['x-user-role'];
      req.user = {
        id: `usr_${role}_001`,
        name: `${role.charAt(0).toUpperCase() + role.slice(1)} User`,
        email: `${role}@example.com`,
        role,
        permissions: ROLE_PERMISSIONS_MAP[role] || []
      };
      return next();
    }

    // 4. In development mode ONLY: provide default admin if neither token nor header is sent
    if (env.NODE_ENV === 'development') {
      req.user = {
        id: 'usr_dev_admin',
        name: 'Default Dev Admin',
        email: 'devadmin@examplecrm.com',
        role: 'admin',
        permissions: ALL_PERMISSIONS
      };
      return next();
    }

    // Otherwise unauthenticated
    throw new AppError('Authentication required. Missing Bearer token in Authorization header.', 401);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  authenticate,
  generateToken,
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS_MAP
};
