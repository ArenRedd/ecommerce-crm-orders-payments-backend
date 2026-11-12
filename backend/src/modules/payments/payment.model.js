const mongoose = require('mongoose');

const paymentEventSchema = new mongoose.Schema(
  {
    event: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed },
    receivedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const paymentSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true
    },
    amount: {
      type: Number,
      required: true,
      min: [0, 'Amount cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Payment amount must be an integer in paise'
      }
    },
    currency: {
      type: String,
      default: 'INR',
      uppercase: true,
      enum: ['INR']
    },
    method: {
      type: String,
      enum: ['RAZORPAY', 'COD', 'BANK_TRANSFER'],
      default: 'RAZORPAY'
    },
    status: {
      type: String,
      enum: ['PENDING', 'PAID', 'FAILED'],
      default: 'PENDING',
      index: true
    },
    razorpayOrderId: {
      type: String,
      trim: true,
      index: true
    },
    razorpayPaymentId: {
      type: String,
      trim: true,
      index: true
    },
    gatewayEventId: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
      index: true
    },
    paidAt: {
      type: Date
    },
    failureReason: {
      type: String,
      trim: true
    },
    events: {
      type: [paymentEventSchema],
      default: []
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

paymentSchema.index({ order: 1, createdAt: -1 });

module.exports = mongoose.model('Payment', paymentSchema);
