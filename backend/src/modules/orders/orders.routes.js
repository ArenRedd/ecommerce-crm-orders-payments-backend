const express = require('express');
const router = express.Router();
const ordersController = require('./orders.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/permission.middleware');
const validate = require('../../middleware/validate.middleware');
const ORDER_PERMISSIONS = require('./orders.permissions');
const {
  createOrderSchema,
  getOrdersQuerySchema,
  orderIdParamSchema,
  updateOrderStatusSchema,
  cancelOrderSchema
} = require('./orders.validation');

// All order routes require authentication
router.use(authenticate);

/**
 * @openapi
 * /api/v1/orders:
 *   post:
 *     summary: Create a manual order
 *     description: Creates an order, runs server-side total calculations in integer paise, enriches product snapshots, reserves stock via inventory stub, and initializes a PENDING payment record.
 *     tags:
 *       - Orders
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customerId
 *               - items
 *               - shippingAddress
 *             properties:
 *               customerId:
 *                 type: string
 *                 example: cust_101
 *               customerName:
 *                 type: string
 *                 example: Aarav Sharma
 *               customerEmail:
 *                 type: string
 *                 example: aarav.sharma@example.com
 *               customerPhone:
 *                 type: string
 *                 example: "+919876543210"
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - product
 *                     - qty
 *                   properties:
 *                     product:
 *                       type: string
 *                       example: prod_101
 *                     qty:
 *                       type: integer
 *                       example: 2
 *                     unitPrice:
 *                       type: integer
 *                       description: Unit price in paise (e.g. 79900 = ₹799.00)
 *                       example: 79900
 *                     discount:
 *                       type: integer
 *                       description: Discount in paise
 *                       example: 0
 *                     tax:
 *                       type: integer
 *                       description: Tax in paise
 *                       example: 14382
 *               shippingFee:
 *                 type: integer
 *                 description: Shipping fee in paise
 *                 example: 5000
 *               shippingAddress:
 *                 type: object
 *                 required:
 *                   - street
 *                   - city
 *                   - state
 *                   - postalCode
 *                 properties:
 *                   street:
 *                     type: string
 *                     example: 42 MG Road, Indiranagar
 *                   city:
 *                     type: string
 *                     example: Bengaluru
 *                   state:
 *                     type: string
 *                     example: Karnataka
 *                   postalCode:
 *                     type: string
 *                     example: "560038"
 *                   country:
 *                     type: string
 *                     example: India
 *               paymentMethod:
 *                 type: string
 *                 enum: [RAZORPAY, COD, BANK_TRANSFER]
 *                 default: RAZORPAY
 *               notes:
 *                 type: string
 *                 example: Leave package at front door
 *     responses:
 *       201:
 *         description: Order created successfully
 *       400:
 *         description: Validation error or insufficient stock
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - requires 'orders.create' permission
 */
router.post(
  '/',
  requirePermission(ORDER_PERMISSIONS.CREATE),
  validate(createOrderSchema),
  ordersController.createOrder
);

/**
 * @openapi
 * /api/v1/orders:
 *   get:
 *     summary: List orders with filters and pagination
 *     description: Retrieve paginated list of orders with status, date, paymentStatus filters, and text search.
 *     tags:
 *       - Orders
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PLACED, CONFIRMED, PROCESSING, PACKED, SHIPPED, OUT_FOR_DELIVERY, DELIVERED, CANCELLED]
 *       - in: query
 *         name: paymentStatus
 *         schema:
 *           type: string
 *           enum: [PENDING, PAID, FAILED, REFUND_PENDING, REFUNDED]
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           default: createdAt:desc
 *     responses:
 *       200:
 *         description: Paginated orders list
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - requires 'orders.read' permission
 */
router.get(
  '/',
  requirePermission(ORDER_PERMISSIONS.READ),
  validate(getOrdersQuerySchema),
  ordersController.getOrders
);

/**
 * @openapi
 * /api/v1/orders/{id}:
 *   get:
 *     summary: Get single order details
 *     description: Fetch complete order by MongoDB ID or unique orderNumber.
 *     tags:
 *       - Orders
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Order MongoDB ID or orderNumber (e.g. ORD-20261112-9A4F)
 *     responses:
 *       200:
 *         description: Order details
 *       404:
 *         description: Order not found
 *       403:
 *         description: Forbidden - requires 'orders.read' permission
 */
router.get(
  '/:id',
  requirePermission(ORDER_PERMISSIONS.READ),
  validate(orderIdParamSchema),
  ordersController.getOrderById
);

/**
 * @openapi
 * /api/v1/orders/{id}/status:
 *   patch:
 *     summary: Update order status via state machine
 *     description: Transitions order through valid states (PLACED -> CONFIRMED -> PROCESSING -> PACKED -> SHIPPED -> OUT_FOR_DELIVERY -> DELIVERED).
 *     tags:
 *       - Orders
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
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
 *                 enum: [CONFIRMED, PROCESSING, PACKED, SHIPPED, OUT_FOR_DELIVERY, DELIVERED, CANCELLED]
 *               note:
 *                 type: string
 *                 example: Package ready for courier pickup
 *     responses:
 *       200:
 *         description: Status updated successfully
 *       400:
 *         description: Invalid state transition
 *       403:
 *         description: Forbidden - requires 'orders.update_status' permission
 *       404:
 *         description: Order not found
 */
router.patch(
  '/:id/status',
  requirePermission(ORDER_PERMISSIONS.UPDATE_STATUS),
  validate(updateOrderStatusSchema),
  ordersController.updateOrderStatus
);

/**
 * @openapi
 * /api/v1/orders/{id}/cancel:
 *   post:
 *     summary: Cancel an order
 *     description: Cancels order before shipment, releases reserved inventory stock, and flags for refund if already paid.
 *     tags:
 *       - Orders
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 example: Customer requested cancellation before dispatch
 *               note:
 *                 type: string
 *     responses:
 *       200:
 *         description: Order cancelled successfully
 *       400:
 *         description: Cannot cancel order after SHIPPED status
 *       403:
 *         description: Forbidden - requires 'orders.cancel' permission
 *       404:
 *         description: Order not found
 */
router.post(
  '/:id/cancel',
  requirePermission(ORDER_PERMISSIONS.CANCEL),
  validate(cancelOrderSchema),
  ordersController.cancelOrder
);

/**
 * @openapi
 * /api/v1/orders/{id}/payment:
 *   get:
 *     summary: Get order payment history
 *     description: Retrieve all payment transactions, gateways events, and refund records tied to this order.
 *     tags:
 *       - Orders
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
 *         description: Payment records
 *       403:
 *         description: Forbidden - requires 'payments.read' permission
 *       404:
 *         description: Order not found
 */
router.get(
  '/:id/payment',
  requirePermission('payments.read'),
  validate(orderIdParamSchema),
  ordersController.getOrderPayment
);

/**
 * @openapi
 * /api/v1/orders/{id}/tracking:
 *   get:
 *     summary: Get order shipment tracking
 *     description: Returns courier tracking status, live tracking URL, and status milestones.
 *     tags:
 *       - Orders
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
 *         description: Tracking details
 *       403:
 *         description: Forbidden - requires 'orders.read' permission
 *       404:
 *         description: Order not found
 */
router.get(
  '/:id/tracking',
  requirePermission(ORDER_PERMISSIONS.READ),
  validate(orderIdParamSchema),
  ordersController.getOrderTracking
);

/**
 * @openapi
 * /api/v1/orders/{id}/invoice:
 *   get:
 *     summary: Get order invoice data
 *     description: Provides structured tax invoice payload including GST breakdowns in integer paise and formatted rupees.
 *     tags:
 *       - Orders
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
 *         description: Invoice data
 *       403:
 *         description: Forbidden - requires 'orders.read' permission
 *       404:
 *         description: Order not found
 */
router.get(
  '/:id/invoice',
  requirePermission(ORDER_PERMISSIONS.READ),
  validate(orderIdParamSchema),
  ordersController.getOrderInvoice
);

module.exports = router;
