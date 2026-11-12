const mongoose = require('mongoose');

const returnItemSchema = new mongoose.Schema(
  {
    orderItemId: {
      type: mongoose.Schema.Types.ObjectId,
      required: false
    },
    product: {
      type: String,
      required: true
    },
    qty: {
      type: Number,
      required: true,
      min: [1, 'Return quantity must be at least 1'],
      validate: {
        validator: Number.isInteger,
        message: 'Quantity must be an integer'
      }
    },
    reason: {
      type: String,
      required: true,
      trim: true
    }
  },
  { _id: true }
);

const returnHistorySchema = new mongoose.Schema(
  {
    from: { type: String, required: true },
    to: { type: String, required: true },
    by: {
      userId: { type: String, required: true },
      name: { type: String, required: true },
      role: { type: String, required: true }
    },
    at: { type: Date, default: Date.now },
    note: { type: String, trim: true }
  },
  { _id: false }
);

const returnSchema = new mongoose.Schema(
  {
    returnNumber: {
      type: String,
      unique: true,
      trim: true,
      uppercase: true,
      index: true
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true
    },
    items: {
      type: [returnItemSchema],
      required: true,
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: 'Return must specify at least one item'
      }
    },
    reason: {
      type: String,
      required: true,
      trim: true
    },
    evidence: {
      type: [String],
      default: []
    },
    status: {
      type: String,
      enum: [
        'REQUESTED',
        'APPROVED',
        'PICKUP_SCHEDULED',
        'RECEIVED',
        'INSPECTED',
        'REFUNDED',
        'REJECTED'
      ],
      default: 'REQUESTED',
      index: true
    },
    refundAmount: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'Refund amount must be an integer in paise'
      }
    },
    restocked: {
      type: Boolean,
      default: false,
      index: true
    },
    decisionBy: {
      userId: { type: String },
      name: { type: String },
      role: { type: String }
    },
    decisionNote: {
      type: String,
      trim: true
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true
    },
    createdBy: {
      userId: { type: String },
      name: { type: String },
      role: { type: String }
    },
    history: {
      type: [returnHistorySchema],
      default: []
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

returnSchema.index({ order: 1, createdAt: -1 });
returnSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Return', returnSchema);
