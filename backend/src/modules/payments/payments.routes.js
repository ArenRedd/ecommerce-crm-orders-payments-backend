const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const paymentsController = require('./payments.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/permission.middleware');
const validate = require('../../middleware/validate.middleware');
const PAYMENT_PERMISSIONS = require('./payments.permissions');
const {
  createRazorpayOrderSchema,
  verifyPaymentSchema,
  createManualPaymentSchema,
  updatePaymentStatusSchema,
  getPaymentsQuerySchema,
  reconcilePaymentsSchema,
  paymentIdParamSchema
} = require('./payments.validation');

// Specific Rate Limiter for payment checkout & verification endpoints
const paymentActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many payment requests from this IP. Please try again after 15 minutes.'
  }
});

// All subsequent routes require authentication and permission checks
router.use(authenticate);

/**
 * @openapi
 * /api/v1/payments/create-order:
 *   post:
 *     summary: Initialize a Razorpay payment order
 *     description: Creates a Razorpay Order in test mode using the SERVER-side order grandTotal. Guards against duplicate payments on already PAID orders.
 *     tags:
 *       - Payments
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderId
 *             properties:
 *               orderId:
 *                 type: string
 *                 description: Order MongoDB ID or unique orderNumber
 *                 example: ORD-20261112-9A4F32
 *     responses:
 *       201:
 *         description: Razorpay order generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     keyId: { type: string, example: rzp_test_stub_key_id }
 *                     razorpayOrderId: { type: string, example: order_RPQ1234567 }
 *                     amount: { type: integer, example: 193564 }
 *                     currency: { type: string, example: INR }
 *                     orderNumber: { type: string, example: ORD-20261112-9A4F32 }
 *       400:
 *         description: Order already paid, cancelled, or invalid
 *       403:
 *         description: Forbidden - requires 'payments.create'
 *       404:
 *         description: Order not found
 */
router.post(
  '/create-order',
  paymentActionLimiter,
  requirePermission(PAYMENT_PERMISSIONS.CREATE),
  validate(createRazorpayOrderSchema),
  paymentsController.createRazorpayOrder
);

/**
 * @openapi
 * /api/v1/payments/verify:
 *   post:
 *     summary: Verify Razorpay payment signature
 *     description: Verifies the HMAC-SHA256 signature returned by Razorpay Checkout. On success, transitions Payment and Order to PAID, and moves order status from PLACED to CONFIRMED.
 *     tags:
 *       - Payments
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - razorpay_order_id
 *               - razorpay_payment_id
 *               - razorpay_signature
 *             properties:
 *               razorpay_order_id:
 *                 type: string
 *                 example: order_RPQ1234567
 *               razorpay_payment_id:
 *                 type: string
 *                 example: pay_RPQ9876543
 *               razorpay_signature:
 *                 type: string
 *                 example: 9a4f32e67b8123456789abcdef0123456789abcdef0123456789abcdef012345
 *     responses:
 *       200:
 *         description: Payment successfully verified and order confirmed
 *       400:
 *         description: Invalid signature or amount mismatch
 *       403:
 *         description: Forbidden - requires 'payments.create'
 *       404:
 *         description: Payment record not found
 */
router.post(
  '/verify',
  paymentActionLimiter,
  requirePermission(PAYMENT_PERMISSIONS.CREATE),
  validate(verifyPaymentSchema),
  paymentsController.verifyPayment
);

/**
 * @openapi
 * /api/v1/payments/reconcile:
 *   post:
 *     summary: Reconcile pending payments with Razorpay
 *     description: Identifies PENDING Razorpay payments older than specified minutes and resolves their true status via Razorpay API.
 *     tags:
 *       - Payments
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               olderThanMinutes:
 *                 type: integer
 *                 default: 30
 *               limit:
 *                 type: integer
 *                 default: 50
 *     responses:
 *       200:
 *         description: Reconciliation summary
 *       403:
 *         description: Forbidden - requires 'payments.create' or admin
 */
router.post(
  '/reconcile',
  requirePermission(PAYMENT_PERMISSIONS.CREATE),
  validate(reconcilePaymentsSchema),
  paymentsController.reconcilePayments
);

/**
 * @openapi
 * /api/v1/payments:
 *   post:
 *     summary: Record a manual/offline payment (e.g. COD or Bank Transfer)
 *     description: Records an offline payment transaction and updates order paymentStatus accordingly.
 *     tags:
 *       - Payments
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderId
 *               - amount
 *               - method
 *             properties:
 *               orderId:
 *                 type: string
 *                 example: ORD-20261112-9A4F32
 *               amount:
 *                 type: integer
 *                 description: Amount in integer paise
 *                 example: 193564
 *               method:
 *                 type: string
 *                 enum: [COD, BANK_TRANSFER, RAZORPAY]
 *                 example: COD
 *               status:
 *                 type: string
 *                 enum: [PENDING, PAID]
 *                 default: PENDING
 *               notes:
 *                 type: string
 *                 example: Cash collected upon delivery by courier
 *               transactionRef:
 *                 type: string
 *                 example: NEFT-UTR-9876543210
 *     responses:
 *       201:
 *         description: Manual payment recorded
 *       400:
 *         description: Validation error or duplicate payment
 *       403:
 *         description: Forbidden - requires 'payments.create'
 */
router.post(
  '/',
  requirePermission(PAYMENT_PERMISSIONS.CREATE),
  validate(createManualPaymentSchema),
  paymentsController.createManualPayment
);

/**
 * @openapi
 * /api/v1/payments:
 *   get:
 *     summary: List all payment records
 *     description: Retrieve paginated list of payment transactions across orders with filters.
 *     tags:
 *       - Payments
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [PENDING, PAID, FAILED] }
 *       - in: query
 *         name: method
 *         schema: { type: string, enum: [RAZORPAY, COD, BANK_TRANSFER] }
 *       - in: query
 *         name: orderId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of payment records
 *       403:
 *         description: Forbidden - requires 'payments.read'
 */
router.get(
  '/',
  requirePermission(PAYMENT_PERMISSIONS.READ),
  validate(getPaymentsQuerySchema),
  paymentsController.getPayments
);

/**
 * @openapi
 * /api/v1/payments/refunds:
 *   get:
 *     summary: List all refund records
 *     description: Retrieve list of pending or processed refunds.
 *     tags:
 *       - Payments
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of refund records
 *       403:
 *         description: Forbidden - requires 'payments.read'
 */
router.get(
  '/refunds',
  requirePermission(PAYMENT_PERMISSIONS.READ),
  paymentsController.getRefunds
);

/**
 * @openapi
 * /api/v1/payments/{id}:
 *   get:
 *     summary: Get single payment record
 *     tags:
 *       - Payments
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Payment record details
 *       404:
 *         description: Payment not found
 */
router.get(
  '/:id',
  requirePermission(PAYMENT_PERMISSIONS.READ),
  validate(paymentIdParamSchema),
  paymentsController.getPaymentById
);

/**
 * @openapi
 * /api/v1/payments/{id}/status:
 *   patch:
 *     summary: Manually update a payment status
 *     description: Updates status of a payment (e.g. marking COD as PAID once collected), updates order status, and logs audit record.
 *     tags:
 *       - Payments
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [PENDING, PAID, FAILED]
 *               notes:
 *                 type: string
 *                 example: Cash remitted by courier partner
 *               failureReason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payment status updated
 *       403:
 *         description: Forbidden - requires 'payments.create'
 *       404:
 *         description: Payment not found
 */
router.patch(
  '/:id/status',
  requirePermission(PAYMENT_PERMISSIONS.CREATE),
  validate(updatePaymentStatusSchema),
  paymentsController.updatePaymentStatus
);

module.exports = router;
