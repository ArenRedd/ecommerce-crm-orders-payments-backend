const { z } = require('zod');
const { RETURN_STATUSES } = require('../../utils/returnStateMachine');

const returnItemInputSchema = z.object({
  orderItemId: z.string().trim().optional(),
  product: z.string().trim().min(1, 'Product identifier is required'),
  qty: z.coerce.number().int('Quantity must be an integer').min(1, 'Quantity must be at least 1'),
  reason: z.string().trim().min(2, 'Return reason for item is required')
});

const createReturnSchema = {
  body: z.object({
    orderId: z.string().trim().min(1, 'Order identifier (ID or orderNumber) is required'),
    items: z.preprocess((val) => {
      if (typeof val === 'string') {
        try {
          return JSON.parse(val);
        } catch {
          return val;
        }
      }
      return val;
    }, z.array(returnItemInputSchema).min(1, 'At least one item must be specified for return')),
    reason: z.string().trim().min(3, 'Overall return reason must be at least 3 characters'),
    evidence: z.preprocess((val) => {
      if (!val) return [];
      if (typeof val === 'string') {
        try {
          const parsed = JSON.parse(val);
          return Array.isArray(parsed) ? parsed : [val];
        } catch {
          return [val];
        }
      }
      return Array.isArray(val) ? val : [val];
    }, z.array(z.string()).optional().default([]))
  })
};

const updateReturnStatusSchema = {
  params: z.object({
    id: z.string().trim().min(1, 'Return ID is required')
  }),
  body: z.object({
    status: z.nativeEnum(RETURN_STATUSES, {
      errorMap: () => ({ message: 'Invalid return status specified' })
    }),
    note: z.string().trim().max(500).optional()
  })
};

const approveReturnSchema = {
  params: z.object({
    id: z.string().trim().min(1, 'Return ID is required')
  }),
  body: z.object({
    decisionNote: z.string().trim().max(500).optional().default('Return request approved')
  })
};

const rejectReturnSchema = {
  params: z.object({
    id: z.string().trim().min(1, 'Return ID is required')
  }),
  body: z.object({
    decisionNote: z.string().trim().min(3, 'A clear reason is required for rejecting a return request')
  })
};

const getReturnsQuerySchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    status: z.nativeEnum(RETURN_STATUSES).optional(),
    orderId: z.string().trim().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    sort: z.string().optional().default('createdAt:desc')
  })
};

const returnIdParamSchema = {
  params: z.object({
    id: z.string().trim().min(1, 'Return ID is required')
  })
};

module.exports = {
  createReturnSchema,
  updateReturnStatusSchema,
  approveReturnSchema,
  rejectReturnSchema,
  getReturnsQuerySchema,
  returnIdParamSchema
};
