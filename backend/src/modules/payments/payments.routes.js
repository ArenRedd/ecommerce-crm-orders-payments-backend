const express = require('express');
const router = express.Router();
const paymentsController = require('./payments.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/permission.middleware');
const PAYMENT_PERMISSIONS = require('./payments.permissions');

router.use(authenticate);

/**
 * @openapi
 * /api/v1/payments:
 *   get:
 *     summary: List all payment records
 *     description: Retrieve list of payment transactions across orders (Phase 1 scaffold).
 *     tags:
 *       - Payments
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of payment records
 *       403:
 *         description: Forbidden - requires 'payments.read'
 */
router.get('/', requirePermission(PAYMENT_PERMISSIONS.READ), paymentsController.getPayments);

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
 */
router.get('/refunds', requirePermission(PAYMENT_PERMISSIONS.READ), paymentsController.getRefunds);

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
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Payment record details
 *       404:
 *         description: Payment not found
 */
router.get('/:id', requirePermission(PAYMENT_PERMISSIONS.READ), paymentsController.getPaymentById);

module.exports = router;
