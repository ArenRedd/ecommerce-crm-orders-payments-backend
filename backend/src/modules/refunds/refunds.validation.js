const { z } = require('zod');

const createRefundSchema = {
  body: z.object({
    orderId: z.string().trim().optional(),
    returnId: z.string().trim().optional(),
    paymentId: z.string().trim().optional(),
    amount: z.coerce.number().int('Amount must be an integer in paise').min(1, 'Amount must be positive').optional(),
    notes: z.string().trim().max(1000).optional()
  }).refine(data => data.orderId || data.returnId, {
    message: 'Either returnId or orderId must be provided to create a refund record'
  })
};

const processRefundSchema = {
  params: z.object({
    id: z.string().trim().min(1, 'Refund ID is required')
  }),
  body: z.object({
    notes: z.string().trim().max(500).optional()
  }).optional()
};

const getRefundsQuerySchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    status: z.enum(['PENDING', 'PROCESSED', 'FAILED']).optional(),
    orderId: z.string().trim().optional(),
    returnId: z.string().trim().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional()
  })
};

const refundIdParamSchema = {
  params: z.object({
    id: z.string().trim().min(1, 'Refund ID is required')
  })
};

module.exports = {
  createRefundSchema,
  processRefundSchema,
  getRefundsQuerySchema,
  refundIdParamSchema
};
