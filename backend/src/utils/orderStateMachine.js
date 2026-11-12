const AppError = require('./AppError');

const ORDER_STATUSES = Object.freeze({
  PLACED: 'PLACED',
  CONFIRMED: 'CONFIRMED',
  PROCESSING: 'PROCESSING',
  PACKED: 'PACKED',
  SHIPPED: 'SHIPPED',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED'
});

const ALLOWED_TRANSITIONS = Object.freeze({
  [ORDER_STATUSES.PLACED]: [ORDER_STATUSES.CONFIRMED, ORDER_STATUSES.CANCELLED],
  [ORDER_STATUSES.CONFIRMED]: [ORDER_STATUSES.PROCESSING, ORDER_STATUSES.CANCELLED],
  [ORDER_STATUSES.PROCESSING]: [ORDER_STATUSES.PACKED, ORDER_STATUSES.CANCELLED],
  [ORDER_STATUSES.PACKED]: [ORDER_STATUSES.SHIPPED, ORDER_STATUSES.CANCELLED],
  [ORDER_STATUSES.SHIPPED]: [ORDER_STATUSES.OUT_FOR_DELIVERY],
  [ORDER_STATUSES.OUT_FOR_DELIVERY]: [ORDER_STATUSES.DELIVERED],
  [ORDER_STATUSES.DELIVERED]: [],
  [ORDER_STATUSES.CANCELLED]: []
});

/**
 * States from which an order can still be cancelled.
 * Must be strictly before SHIPPED.
 */
const CANCELLABLE_STATUSES = Object.freeze([
  ORDER_STATUSES.PLACED,
  ORDER_STATUSES.CONFIRMED,
  ORDER_STATUSES.PROCESSING,
  ORDER_STATUSES.PACKED
]);

/**
 * Checks if a transition between two statuses is permitted
 * @param {string} fromStatus
 * @param {string} toStatus
 * @returns {boolean}
 */
const canTransition = (fromStatus, toStatus) => {
  if (!fromStatus || !toStatus) return false;
  if (fromStatus === toStatus) return false;
  const allowed = ALLOWED_TRANSITIONS[fromStatus];
  return Array.isArray(allowed) && allowed.includes(toStatus);
};

/**
 * Validates a transition and throws AppError(400) if invalid
 * @param {string} fromStatus
 * @param {string} toStatus
 * @throws {AppError}
 */
const validateTransition = (fromStatus, toStatus) => {
  if (!Object.values(ORDER_STATUSES).includes(fromStatus)) {
    throw new AppError(`Current status '${fromStatus}' is not a valid order status`, 400);
  }
  if (!Object.values(ORDER_STATUSES).includes(toStatus)) {
    throw new AppError(`Target status '${toStatus}' is not a valid order status`, 400);
  }
  if (fromStatus === toStatus) {
    throw new AppError(`Order is already in '${fromStatus}' status`, 400);
  }

  const allowed = ALLOWED_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    if (toStatus === ORDER_STATUSES.CANCELLED) {
      throw new AppError(
        `Order cannot be cancelled once it reaches '${fromStatus}'. Cancellation is only allowed before SHIPPED.`,
        400
      );
    }
    const allowedMsg = allowed.length > 0 ? allowed.join(', ') : 'none (terminal state)';
    throw new AppError(
      `Invalid order status transition from '${fromStatus}' to '${toStatus}'. Allowed transitions from '${fromStatus}': [${allowedMsg}]`,
      400
    );
  }
};

/**
 * Checks if an order in the given status is cancellable
 * @param {string} status
 * @returns {boolean}
 */
const isCancellable = (status) => {
  return CANCELLABLE_STATUSES.includes(status);
};

/**
 * Asserts order is cancellable or throws 400
 * @param {string} status
 * @throws {AppError}
 */
const assertCancellable = (status) => {
  if (!isCancellable(status)) {
    throw new AppError(
      `Cannot cancel order with status '${status}'. Orders can only be cancelled before SHIPPED (allowed: ${CANCELLABLE_STATUSES.join(', ')})`,
      400
    );
  }
};

/**
 * Returns allowed next states for a status
 * @param {string} status
 * @returns {string[]}
 */
const getAllowedNextStates = (status) => {
  return ALLOWED_TRANSITIONS[status] || [];
};

module.exports = {
  ORDER_STATUSES,
  ALLOWED_TRANSITIONS,
  CANCELLABLE_STATUSES,
  canTransition,
  validateTransition,
  isCancellable,
  assertCancellable,
  getAllowedNextStates
};
