const express = require('express');
const router = express.Router();
const returnsController = require('./returns.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/permission.middleware');
const RETURN_PERMISSIONS = require('./returns.permissions');

router.use(authenticate);

/**
 * @openapi
 * /api/v1/returns:
 *   get:
 *     summary: List return requests
 *     description: Retrieve list of return/replacement claims across orders (Phase 1 scaffold).
 *     tags:
 *       - Returns
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of returns
 *       403:
 *         description: Forbidden - requires 'returns.read'
 */
router.get('/', requirePermission(RETURN_PERMISSIONS.READ), returnsController.getReturns);

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
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Return record details
 *       404:
 *         description: Return not found
 */
router.get('/:id', requirePermission(RETURN_PERMISSIONS.READ), returnsController.getReturnById);

module.exports = router;
