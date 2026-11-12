const { z } = require('zod');
const { ORDER_STATUSES } = require('../../utils/orderStateMachine');

const addressSchema = z.object({
  street: z.string().trim().min(2, 'Street address is required'),
  city: z.string().trim().min(2, 'City is required'),
  state: z.string().trim().min(2, 'State is required'),
  postalCode: z.string().trim().min(4, 'Valid postal code is required'),
  country: z.string().trim().min(2).default('India')
});

const orderItemInputSchema = z.object({
  product: z.string().trim().min(1, 'Product identifier is required'),
  qty: z.coerce.number().int('Quantity must be an integer').min(1, 'Quantity must be at least 1'),
  name: z.string().trim().optional(),
  sku: z.string().trim().optional(),
  unitPrice: z.coerce.number().int('Unit price must be integer paise').min(0, 'Unit price cannot be negative').optional(),
  discount: z.coerce.number().int('Discount must be integer paise').min(0, 'Discount cannot be negative').optional(),
  tax: z.coerce.number().int('Tax must be integer paise').min(0, 'Tax cannot be negative').optional()
});

const createOrderSchema = {
  body: z.object({
    customerId: z.string().trim().min(1, 'Customer ID is required'),
    customerName: z.string().trim().optional(),
    customerEmail: z.string().trim().email('Valid customer email is required').optional(),
    customerPhone: z.string().trim().optional(),
    items: z.array(orderItemInputSchema).min(1, 'Order must contain at least one item'),
    shippingFee: z.coerce.number().int('Shipping fee must be integer paise').min(0, 'Shipping fee cannot be negative').default(0),
    shippingAddress: addressSchema,
    billingAddress: addressSchema.optional(),
    paymentMethod: z.enum(['RAZORPAY', 'COD', 'BANK_TRANSFER']).default('RAZORPAY'),
    notes: z.string().trim().max(1000).optional()
  })
};

const getOrdersQuerySchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    search: z.string().trim().optional(),
    status: z.nativeEnum(ORDER_STATUSES).optional(),
    paymentStatus: z.enum(['PENDING', 'PAID', 'FAILED', 'REFUND_PENDING', 'REFUNDED']).optional(),
    startDate: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
    endDate: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
    sort: z.string().optional().default('createdAt:desc'),
    includeArchived: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(false)
  })
};

const orderIdParamSchema = {
  params: z.object({
    id: z.string().trim().min(1, 'Order ID or Order Number is required')
  })
};

const updateOrderStatusSchema = {
  params: z.object({
    id: z.string().trim().min(1, 'Order ID is required')
  }),
  body: z.object({
    status: z.nativeEnum(ORDER_STATUSES, {
      errorMap: () => ({ message: 'Invalid order status specified' })
    }),
    note: z.string().trim().max(500, 'Status transition note too long').optional()
  })
};

const cancelOrderSchema = {
  params: z.object({
    id: z.string().trim().min(1, 'Order ID is required')
  }),
  body: z.object({
    reason: z.string().trim().min(3, 'Cancellation reason must be at least 3 characters'),
    note: z.string().trim().max(500).optional()
  })
};

module.exports = {
  createOrderSchema,
  getOrdersQuerySchema,
  orderIdParamSchema,
  updateOrderStatusSchema,
  cancelOrderSchema
};
