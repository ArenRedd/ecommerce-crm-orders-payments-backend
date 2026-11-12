const express = require('express');
const router = express.Router();
const returnsController = require('./returns.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/permission.middleware');
const validate = require('../../middleware/validate.middleware');
const { uploadEvidenceMiddleware } = require('../../middleware/upload.middleware');
const RETURN_PERMISSIONS = require('./returns.permissions');
const {
  createReturnSchema,
  updateReturnStatusSchema,
  approveReturnSchema,
  rejectReturnSchema,
  getReturnsQuerySchema,
  returnIdParamSchema
} = require('./returns.validation');

router.use(authenticate);

/**
 * @openapi
 * /api/v1/returns:
 *   post:
 *     summary: Submit a return request
 *     description: Creates a return request for a delivered order. Validates return window (7 days), checks quantities against delivered items, uploads evidence to Cloudinary, and checks for duplicate open returns.
 *     tags:
 *       - Returns
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - orderId
 *               - items
 *               - reason
 *             properties:
 *               orderId:
 *                 type: string
 *                 example: ORD-20261112-9A4F32
 *               items:
 *                 type: string
 *                 description: JSON stringified array of items to return [{ product, qty, reason }]
 *                 example: '[{"product":"prod_101","qty":1,"reason":"Size too small"}]'
 *               reason:
 *                 type: string
 *                 example: Incorrect fit and defective stitching
 *               evidence:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Up to 5 image/pdf evidence files (max 5MB each)
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderId
 *               - items
 *               - reason
 *             properties:
 *               orderId:
 *                 type: string
 *                 example: ORD-20261112-9A4F32
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - product
 *                     - qty
 *                     - reason
 *                   properties:
 *                     product: { type: string, example: prod_101 }
 *                     qty: { type: integer, example: 1 }
 *                     reason: { type: string, example: Defective stitching }
 *               reason:
 *                 type: string
 *                 example: Item arrived damaged
 *               evidence:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["https://res.cloudinary.com/demo/image/upload/sample.jpg"]
 *     responses:
 *       201:
 *         description: Return request initiated successfully
 *       400:
 *         description: Order not delivered, return window expired, or quantity exceeded
 *       403:
 *         description: Forbidden - requires 'returns.create'
 */
router.post(
  '/',
  requirePermission(RETURN_PERMISSIONS.CREATE),
  uploadEvidenceMiddleware,
  validate(createReturnSchema),
  returnsController.createReturn
);

/**
 * @openapi
 * /api/v1/returns:
 *   get:
 *     summary: List return requests
 *     description: Retrieve paginated list of return requests with status and date filters.
 *     tags:
 *       - Returns
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
 *         schema: { type: string, enum: [REQUESTED, APPROVED, PICKUP_SCHEDULED, RECEIVED, INSPECTED, REFUNDED, REJECTED] }
 *       - in: query
 *         name: orderId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of returns
 *       403:
 *         description: Forbidden - requires 'returns.read'
 */
router.get(
  '/',
  requirePermission(RETURN_PERMISSIONS.READ),
  validate(getReturnsQuerySchema),
  returnsController.getReturns
);

/**
 * @openapi
 * /api/v1/returns/{id}:
 *   get:
 *     summary: Get single return request
 *     tags:
 *       - Returns
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Return record details
 *       404:
 *         description: Return not found
 */
router.get(
  '/:id',
  requirePermission(RETURN_PERMISSIONS.READ),
  validate(returnIdParamSchema),
  returnsController.getReturnById
);

/**
 * @openapi
 * /api/v1/returns/{id}/approve:
 *   patch:
 *     summary: Approve a return request (Authorization step)
 *     description: Separately authorizes a return request prior to pickup and refund execution.
 *     tags:
 *       - Returns
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
 *               decisionNote:
 *                 type: string
 *                 example: Approved for reverse pickup
 *     responses:
 *       200:
 *         description: Return approved
 *       400:
 *         description: Return not in REQUESTED status
 *       403:
 *         description: Forbidden - requires 'returns.approve'
 */
router.patch(
  '/:id/approve',
  requirePermission(RETURN_PERMISSIONS.APPROVE),
  validate(approveReturnSchema),
  returnsController.approveReturn
);

/**
 * @openapi
 * /api/v1/returns/{id}/reject:
 *   patch:
 *     summary: Reject a return request
 *     description: Rejects a return request with a mandatory rejection reason note.
 *     tags:
 *       - Returns
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
 *               - decisionNote
 *             properties:
 *               decisionNote:
 *                 type: string
 *                 example: Item damaged by customer misuse, ineligible for return
 *     responses:
 *       200:
 *         description: Return rejected
 *       400:
 *         description: Return cannot be rejected from current state
 *       403:
 *         description: Forbidden - requires 'returns.approve'
 */
router.patch(
  '/:id/reject',
  requirePermission(RETURN_PERMISSIONS.APPROVE),
  validate(rejectReturnSchema),
  returnsController.rejectReturn
);

/**
 * @openapi
 * /api/v1/returns/{id}/status:
 *   patch:
 *     summary: Advance return status along state machine
 *     description: Moves return along REQUESTED -> APPROVED -> PICKUP_SCHEDULED -> RECEIVED -> INSPECTED -> REFUNDED. Restocks inventory upon RECEIVED or INSPECTED.
 *     tags:
 *       - Returns
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
 *                 enum: [APPROVED, PICKUP_SCHEDULED, RECEIVED, INSPECTED, REFUNDED, REJECTED]
 *               note:
 *                 type: string
 *     responses:
 *       200:
 *         description: Return status updated
 *       400:
 *         description: Invalid status transition
 *       403:
 *         description: Forbidden - requires 'returns.approve'
 */
router.patch(
  '/:id/status',
  requirePermission(RETURN_PERMISSIONS.APPROVE),
  validate(updateReturnStatusSchema),
  returnsController.updateReturnStatus
);

module.exports = router;
