const AppError = require('./AppError');

const RETURN_STATUSES = Object.freeze({
  REQUESTED: 'REQUESTED',
  APPROVED: 'APPROVED',
  PICKUP_SCHEDULED: 'PICKUP_SCHEDULED',
  RECEIVED: 'RECEIVED',
  INSPECTED: 'INSPECTED',
  REFUNDED: 'REFUNDED',
  REJECTED: 'REJECTED'
});

const ALLOWED_RETURN_TRANSITIONS = Object.freeze({
  [RETURN_STATUSES.REQUESTED]: [RETURN_STATUSES.APPROVED, RETURN_STATUSES.REJECTED],
  [RETURN_STATUSES.APPROVED]: [RETURN_STATUSES.PICKUP_SCHEDULED],
  [RETURN_STATUSES.PICKUP_SCHEDULED]: [RETURN_STATUSES.RECEIVED],
  [RETURN_STATUSES.RECEIVED]: [RETURN_STATUSES.INSPECTED],
  [RETURN_STATUSES.INSPECTED]: [RETURN_STATUSES.REFUNDED, RETURN_STATUSES.REJECTED],
  [RETURN_STATUSES.REFUNDED]: [],
  [RETURN_STATUSES.REJECTED]: []
});

const canTransitionReturn = (fromStatus, toStatus) => {
  if (!fromStatus || !toStatus) return false;
  if (fromStatus === toStatus) return false;
  const allowed = ALLOWED_RETURN_TRANSITIONS[fromStatus];
  return Array.isArray(allowed) && allowed.includes(toStatus);
};

const validateReturnTransition = (fromStatus, toStatus) => {
  if (!Object.values(RETURN_STATUSES).includes(fromStatus)) {
    throw new AppError(`Current status '${fromStatus}' is not a valid return status`, 400);
  }
  if (!Object.values(RETURN_STATUSES).includes(toStatus)) {
    throw new AppError(`Target status '${toStatus}' is not a valid return status`, 400);
  }
  if (fromStatus === toStatus) {
    throw new AppError(`Return is already in '${fromStatus}' status`, 400);
  }

  const allowed = ALLOWED_RETURN_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    const allowedMsg = allowed.length > 0 ? allowed.join(', ') : 'none (terminal state)';
    throw new AppError(
      `Invalid return status transition from '${fromStatus}' to '${toStatus}'. Allowed transitions from '${fromStatus}': [${allowedMsg}]`,
      400
    );
  }
};

const isTerminalReturnStatus = (status) => {
  return status === RETURN_STATUSES.REFUNDED || status === RETURN_STATUSES.REJECTED;
};

module.exports = {
  RETURN_STATUSES,
  ALLOWED_RETURN_TRANSITIONS,
  canTransitionReturn,
  validateReturnTransition,
  isTerminalReturnStatus
};
