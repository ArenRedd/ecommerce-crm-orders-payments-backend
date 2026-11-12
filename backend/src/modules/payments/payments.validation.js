const { z } = require('zod');

const createRazorpayOrderSchema = {
  body: z.object({
    orderId: z.string().trim().min(1, 'Order identifier (ID or orderNumber) is required')
  })
};

const verifyPaymentSchema = {
  body: z.object({
    razorpay_order_id: z.string().trim().min(1, 'razorpay_order_id is required'),
    razorpay_payment_id: z.string().trim().min(1, 'razorpay_payment_id is required'),
    razorpay_signature: z.string().trim().min(1, 'razorpay_signature is required')
  })
};

const createManualPaymentSchema = {
  body: z.object({
    orderId: z.string().trim().min(1, 'Order identifier (ID or orderNumber) is required'),
    amount: z.coerce.number().int('Amount must be an integer in paise').min(1, 'Amount must be greater than zero'),
    method: z.enum(['COD', 'BANK_TRANSFER', 'RAZORPAY']).default('COD'),
    status: z.enum(['PENDING', 'PAID']).default('PENDING'),
    notes: z.string().trim().max(1000).optional(),
    transactionRef: z.string().trim().optional()
  })
};

const updatePaymentStatusSchema = {
  params: z.object({
    id: z.string().trim().min(1, 'Payment ID is required')
  }),
  body: z.object({
    status: z.enum(['PENDING', 'PAID', 'FAILED'], {
      errorMap: () => ({ message: 'Status must be one of: PENDING, PAID, FAILED' })
    }),
    notes: z.string().trim().max(500).optional(),
    failureReason: z.string().trim().optional()
  })
};

const getPaymentsQuerySchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    status: z.enum(['PENDING', 'PAID', 'FAILED']).optional(),
    method: z.enum(['RAZORPAY', 'COD', 'BANK_TRANSFER']).optional(),
    orderId: z.string().trim().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional()
  })
};

const reconcilePaymentsSchema = {
  body: z.object({
    olderThanMinutes: z.coerce.number().int().min(1).default(30),
    limit: z.coerce.number().int().min(1).max(100).default(50)
  }).optional()
};

const paymentIdParamSchema = {
  params: z.object({
    id: z.string().trim().min(1, 'Payment ID is required')
  })
};

module.exports = {
  createRazorpayOrderSchema,
  verifyPaymentSchema,
  createManualPaymentSchema,
  updatePaymentStatusSchema,
  getPaymentsQuerySchema,
  reconcilePaymentsSchema,
  paymentIdParamSchema
};
