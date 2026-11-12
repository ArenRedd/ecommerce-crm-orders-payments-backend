const mongoose = require('mongoose');

const refundSchema = new mongoose.Schema(
  {
    refundNumber: {
      type: String,
      unique: true,
      trim: true,
      uppercase: true,
      index: true
    },
    return: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Return',
      required: false,
      index: true
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true
    },
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      required: false,
      index: true
    },
    amount: {
      type: Number,
      required: true,
      min: [0, 'Refund amount cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Refund amount must be an integer in paise'
      }
    },
    currency: {
      type: String,
      default: 'INR',
      uppercase: true,
      enum: ['INR']
    },
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSED', 'FAILED'],
      default: 'PENDING',
      index: true
    },
    razorpayRefundId: {
      type: String,
      trim: true,
      sparse: true,
      index: true
    },
    approvedBy: {
      userId: { type: String },
      name: { type: String },
      role: { type: String }
    },
    processedAt: {
      type: Date
    },
    failureReason: {
      type: String,
      trim: true
    },
    notes: {
      type: String,
      trim: true
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

refundSchema.index({ order: 1, createdAt: -1 });

module.exports = mongoose.model('Refund', refundSchema);
