const AuditLog = require('./auditLog.model');

/**
 * Log an audit trail entry for domain mutations
 *
 * @param {Object} params
 * @param {string} params.entity - 'Order' | 'Payment' | 'Return' | 'Refund'
 * @param {string|mongoose.Types.ObjectId} params.entityId
 * @param {string} params.action - e.g. 'ORDER_CREATED', 'ORDER_STATUS_UPDATED', 'ORDER_CANCELLED'
 * @param {Object} [params.performedBy] - { userId, name, role }
 * @param {Object} [params.previousState]
 * @param {Object} [params.newState]
 * @param {Object} [params.changes]
 * @param {Object} [params.metadata]
 * @param {ClientSession} [session=null] - Optional MongoDB session
 * @returns {Promise<AuditLog>}
 */
const recordAuditLog = async (
  {
    entity,
    entityId,
    action,
    performedBy = { userId: 'system', name: 'System', role: 'system' },
    previousState = null,
    newState = null,
    changes = null,
    metadata = null
  },
  session = null
) => {
  try {
    const docData = {
      entity,
      entityId,
      action,
      performedBy,
      previousState,
      newState,
      changes,
      metadata,
      timestamp: new Date()
    };

    if (session) {
      const [logEntry] = await AuditLog.create([docData], { session });
      return logEntry;
    }

    return await AuditLog.create(docData);
  } catch (error) {
    // Non-blocking fallback: do not crash core transaction on audit failure, but log warning
    console.error(`[AuditLog Error] Failed to write audit entry for ${entity} ${entityId}:`, error.message);
    return null;
  }
};

const getAuditLogsForEntity = async (entity, entityId, limit = 50) => {
  return await AuditLog.find({ entity, entityId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();
};

module.exports = {
  recordAuditLog,
  getAuditLogsForEntity
};
