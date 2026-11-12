const express = require('express');
const router = express.Router();
const refundsController = require('./refunds.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/permission.middleware');
const validate = require('../../middleware/validate.middleware');
const PAYMENT_PERMISSIONS = require('../payments/payments.permissions');
const {
  createRefundSchema,
  processRefundSchema,
  getRefundsQuerySchema,
  refundIdParamSchema
} = require('./refunds.validation');

router.use(authenticate);

/**
 * @openapi
 * /api/v1/refunds:
 *   post:
 *     summary: Create a pending refund record
 *     description: Creates a PENDING refund record for an inspected return or cancelled paid order. Validates amount against refundable balance.
 *     tags:
 *       - Refunds
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               orderId: { type: string, example: ORD-20261112-9A4F32 }
 *               returnId: { type: string, example: 6733a41b8a59cb84a92d4f20 }
 *               amount: { type: integer, description: Amount in paise, example: 79900 }
 *               notes: { type: string, example: Approved customer refund after inspection }
 *     responses:
 *       201:
 *         description: Pending refund created
 *       400:
 *         description: Amount exceeds refundable balance
 *       403:
 *         description: Forbidden - requires 'refunds.approve'
 */
router.post(
  '/',
  requirePermission(PAYMENT_PERMISSIONS.REFUND_APPROVE),
  validate(createRefundSchema),
  refundsController.createRefund
);

/**
 * @openapi
 * /api/v1/refunds/{id}/process:
 *   patch:
 *     summary: Execute refund payout through Razorpay (Separate execution step)
 *     description: Validates refundable balance, executes refund via Razorpay gateway, records razorpayRefundId, and updates Order paymentStatus to PARTIALLY_REFUNDED or REFUNDED.
 *     tags:
 *       - Refunds
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes: { type: string, example: Processed via dashboard }
 *     responses:
 *       200:
 *         description: Refund successfully processed via gateway
 *       400:
 *         description: Amount exceeds refundable balance
 *       403:
 *         description: Forbidden - requires 'refunds.approve'
 *       404:
 *         description: Refund record not found
 */
router.patch(
  '/:id/process',
  requirePermission(PAYMENT_PERMISSIONS.REFUND_APPROVE),
  validate(processRefundSchema),
  refundsController.processRefund
);

/**
 * @openapi
 * /api/v1/refunds:
 *   get:
 *     summary: List all refund records
 *     description: Retrieve paginated refund transactions with status, order, and date filters.
 *     tags:
 *       - Refunds
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
 *         schema: { type: string, enum: [PENDING, PROCESSED, FAILED] }
 *       - in: query
 *         name: orderId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of refund records
 *       403:
 *         description: Forbidden - requires 'payments.read'
 */
router.get(
  '/',
  requirePermission(PAYMENT_PERMISSIONS.READ),
  validate(getRefundsQuerySchema),
  refundsController.getRefunds
);

/**
 * @openapi
 * /api/v1/refunds/{id}:
 *   get:
 *     summary: Get single refund record details
 *     tags:
 *       - Refunds
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Refund details
 *       404:
 *         description: Refund not found
 */
router.get(
  '/:id',
  requirePermission(PAYMENT_PERMISSIONS.READ),
  validate(refundIdParamSchema),
  refundsController.getRefundById
);

module.exports = router;
