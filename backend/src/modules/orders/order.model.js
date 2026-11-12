const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema(
  {
    street: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    postalCode: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true, default: 'India' }
  },
  { _id: false }
);

const orderItemSnapshotSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    sku: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    qty: {
      type: Number,
      required: true,
      min: [1, 'Quantity must be at least 1'],
      validate: {
        validator: Number.isInteger,
        message: 'Quantity must be an integer'
      }
    },
    unitPrice: {
      type: Number,
      required: true,
      min: [0, 'Unit price cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Unit price must be an integer in paise'
      }
    },
    discount: {
      type: Number,
      default: 0,
      min: [0, 'Discount cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Discount must be an integer in paise'
      }
    },
    tax: {
      type: Number,
      default: 0,
      min: [0, 'Tax cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Tax must be an integer in paise'
      }
    }
  },
  { _id: true }
);

const statusHistoryEntrySchema = new mongoose.Schema(
  {
    from: {
      type: String,
      required: true
    },
    to: {
      type: String,
      required: true
    },
    by: {
      userId: { type: String, required: true },
      name: { type: String, required: true },
      role: { type: String, required: true }
    },
    at: {
      type: Date,
      default: Date.now,
      required: true
    },
    note: {
      type: String,
      trim: true
    }
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true
    },
    customer: {
      customerId: {
        type: String,
        required: true,
        trim: true,
        index: true
      },
      name: { type: String, required: true, trim: true },
      email: { type: String, required: true, trim: true, lowercase: true },
      phone: { type: String, trim: true }
    },
    items: {
      type: [orderItemSnapshotSchema],
      required: true,
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: 'Order must contain at least one item'
      }
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'Subtotal must be an integer in paise'
      }
    },
    discountTotal: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'Discount total must be an integer in paise'
      }
    },
    taxTotal: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'Tax total must be an integer in paise'
      }
    },
    shippingFee: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'Shipping fee must be an integer in paise'
      }
    },
    grandTotal: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'Grand total must be an integer in paise'
      }
    },
    currency: {
      type: String,
      default: 'INR',
      uppercase: true,
      enum: ['INR']
    },
    shippingAddress: {
      type: addressSchema,
      required: true
    },
    billingAddress: {
      type: addressSchema,
      required: true
    },
    status: {
      type: String,
      enum: [
        'PLACED',
        'CONFIRMED',
        'PROCESSING',
        'PACKED',
        'SHIPPED',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
        'CANCELLED'
      ],
      default: 'PLACED',
      index: true
    },
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'PAID', 'FAILED', 'REFUND_PENDING', 'REFUNDED', 'PARTIALLY_REFUNDED'],
      default: 'PENDING',
      index: true
    },
    paymentMethod: {
      type: String,
      enum: ['RAZORPAY', 'COD', 'BANK_TRANSFER'],
      default: 'RAZORPAY'
    },
    notes: {
      type: String,
      trim: true
    },
    cancellationReason: {
      type: String,
      trim: true
    },
    statusHistory: {
      type: [statusHistoryEntrySchema],
      default: []
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true
    },
    createdBy: {
      userId: { type: String, required: true },
      name: { type: String, required: true },
      role: { type: String, required: true }
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// Compound and auxiliary query indexes
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1, createdAt: -1 });
orderSchema.index({ 'customer.customerId': 1, createdAt: -1 });
orderSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
