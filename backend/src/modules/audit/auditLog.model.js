const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    entity: {
      type: String,
      required: true,
      enum: ['Order', 'Payment', 'Return', 'Refund'],
      index: true
    },
    entityId: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      index: true
    },
    action: {
      type: String,
      required: true,
      index: true
    },
    performedBy: {
      userId: { type: String, default: 'system' },
      name: { type: String, default: 'System' },
      role: { type: String, default: 'system' }
    },
    previousState: {
      type: mongoose.Schema.Types.Mixed
    },
    newState: {
      type: mongoose.Schema.Types.Mixed
    },
    changes: {
      type: mongoose.Schema.Types.Mixed
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: false,
    versionKey: false
  }
);

auditLogSchema.index({ entity: 1, entityId: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
