const mongoose = require('mongoose');
const Return = require('./return.model');
const Order = require('../orders/order.model');
const { runInTransaction } = require('../../config/db');
const {
  RETURN_STATUSES,
  validateReturnTransition,
  canTransitionReturn
} = require('../../utils/returnStateMachine');
const cloudinaryAdapter = require('../../integrations/upload/cloudinary.adapter');
const inventoryStub = require('../../integrations/stubs/inventoryStub');
const notificationStub = require('../../integrations/stubs/notificationStub');
const eventBus = require('../../integrations/stubs/eventBus');
const { recordAuditLog } = require('../audit/auditLog.service');
const AppError = require('../../utils/AppError');
const env = require('../../config/env');
const crypto = require('crypto');

const generateReturnNumber = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `RET-${year}${month}${day}-${random}`;
};

/**
 * 1. Create a Return Request with Eligibility Verification
 */
const createReturn = async (data, uploadedFiles = [], user) => {
  let orderQuery;
  if (mongoose.Types.ObjectId.isValid(data.orderId) && String(new mongoose.Types.ObjectId(data.orderId)) === data.orderId) {
    orderQuery = Order.findOne({ _id: data.orderId, isArchived: false });
  } else {
    orderQuery = Order.findOne({ orderNumber: String(data.orderId).toUpperCase(), isArchived: false });
  }

  const order = await orderQuery;
  if (!order) {
    throw new AppError(`Order '${data.orderId}' not found`, 404);
  }

  // Eligibility Rule 1: Order must be DELIVERED
  if (order.status !== 'DELIVERED') {
    throw new AppError(
      `Return request denied: Returns are only permitted for 'DELIVERED' orders. Current order status: '${order.status}'`,
      400
    );
  }

  // Eligibility Rule 2: Inside configurable return window (default 7 days)
  let deliveredDate = null;
  if (Array.isArray(order.statusHistory)) {
    const deliveredEntry = order.statusHistory.find(h => h.to === 'DELIVERED');
    if (deliveredEntry && deliveredEntry.at) {
      deliveredDate = new Date(deliveredEntry.at);
    }
  }
  if (!deliveredDate) {
    deliveredDate = new Date(order.updatedAt || order.createdAt);
  }

  const windowDays = env.RETURN_WINDOW_DAYS || 7;
  const returnWindowMs = windowDays * 24 * 60 * 60 * 1000;
  const returnCutoff = new Date(deliveredDate.getTime() + returnWindowMs);

  if (Date.now() > returnCutoff.getTime()) {
    throw new AppError(
      `Return request denied: Return window of ${windowDays} days has expired. Order was delivered on ${deliveredDate.toISOString()}`,
      400
    );
  }

  // Load previous non-rejected returns for this order to check quantities & active duplicates
  const existingReturns = await Return.find({
    order: order._id,
    status: { $ne: 'REJECTED' }
  });

  // Upload evidence files to Cloudinary (or mock adapter)
  const evidenceUrls = Array.isArray(data.evidence) ? [...data.evidence] : [];
  if (uploadedFiles && uploadedFiles.length > 0) {
    for (const file of uploadedFiles) {
      const uploadResult = await cloudinaryAdapter.uploadEvidence(
        file.buffer,
        file.originalname,
        file.mimetype
      );
      evidenceUrls.push(uploadResult.url);
    }
  }

  // Validate items, check quantities, and compute estimated refund amount
  let totalEstimatedRefundPaise = 0;
  const validatedReturnItems = [];

  for (const item of data.items) {
    const orderItem = order.items.find(
      oi =>
        (item.orderItemId && oi._id.toString() === item.orderItemId) ||
        oi.product === item.product ||
        oi.sku === item.product
    );

    if (!orderItem) {
      throw new AppError(
        `Item '${item.product}' (orderItemId: ${item.orderItemId || 'N/A'}) does not exist in order #${order.orderNumber}`,
        400
      );
    }

    // Eligibility Rule 4: No duplicate open return for the same item
    const activeReturn = existingReturns.find(
      er =>
        ['REQUESTED', 'APPROVED', 'PICKUP_SCHEDULED', 'RECEIVED', 'INSPECTED'].includes(er.status) &&
        er.items.some(
          ei =>
            (ei.orderItemId && ei.orderItemId.toString() === orderItem._id.toString()) ||
            ei.product === orderItem.product
        )
    );

    if (activeReturn) {
      throw new AppError(
        `An active return (${activeReturn.returnNumber || activeReturn._id}) is already in progress for product '${orderItem.name}'`,
        400
      );
    }

    // Eligibility Rule 3: Quantity check against delivered minus already returned
    let alreadyReturnedQty = 0;
    for (const er of existingReturns) {
      for (const ei of er.items) {
        if (
          (ei.orderItemId && ei.orderItemId.toString() === orderItem._id.toString()) ||
          ei.product === orderItem.product
        ) {
          alreadyReturnedQty += ei.qty;
        }
      }
    }

    const availableToReturn = orderItem.qty - alreadyReturnedQty;
    if (item.qty > availableToReturn) {
      throw new AppError(
        `Requested return quantity (${item.qty}) for '${orderItem.name}' exceeds available delivered quantity (${availableToReturn})`,
        400
      );
    }

    // Calculate item refund amount (unit price + tax - discount per unit * qty)
    const perUnitDiscount = Math.floor((orderItem.discount || 0) / orderItem.qty);
    const perUnitTax = Math.floor((orderItem.tax || 0) / orderItem.qty);
    const itemPaise = (orderItem.unitPrice - perUnitDiscount + perUnitTax) * item.qty;
    totalEstimatedRefundPaise += itemPaise;

    validatedReturnItems.push({
      orderItemId: orderItem._id,
      product: orderItem.product,
      qty: item.qty,
      reason: item.reason
    });
  }

  const returnNumber = generateReturnNumber();

  const returnDocData = {
    returnNumber,
    order: order._id,
    items: validatedReturnItems,
    reason: data.reason,
    evidence: evidenceUrls,
    status: RETURN_STATUSES.REQUESTED,
    refundAmount: totalEstimatedRefundPaise,
    restocked: false,
    createdBy: {
      userId: user?.id || 'customer',
      name: user?.name || 'Customer',
      role: user?.role || 'customer'
    },
    history: [
      {
        from: 'NONE',
        to: RETURN_STATUSES.REQUESTED,
        by: {
          userId: user?.id || 'customer',
          name: user?.name || 'Customer',
          role: user?.role || 'customer'
        },
        at: new Date(),
        note: `Return requested by customer. Reason: ${data.reason}`
      }
    ]
  };

  const createdReturn = await Return.create(returnDocData);

  // Cross-module consistency hooks
  await recordAuditLog({
    entity: 'Return',
    entityId: createdReturn._id,
    action: 'RETURN_REQUESTED',
    performedBy: { userId: user?.id, name: user?.name, role: user?.role },
    newState: { returnNumber, status: RETURN_STATUSES.REQUESTED, refundAmount: totalEstimatedRefundPaise },
    metadata: { orderNumber: order.orderNumber }
  });

  await notificationStub.notify('return.requested', {
    returnId: createdReturn._id,
    returnNumber,
    orderNumber: order.orderNumber,
    customerId: order.customer.customerId,
    refundAmount: totalEstimatedRefundPaise
  });

  eventBus.publish('return.requested', {
    returnId: createdReturn._id,
    returnNumber,
    orderNumber: order.orderNumber,
    itemCount: validatedReturnItems.length
  });

  return createdReturn;
};

/**
 * 2. Approve Return Request (Separate authorization step - permission: returns.approve)
 */
const approveReturn = async (id, decisionNote = 'Return request approved', user) => {
  const returnRecord = await Return.findById(id).populate('order', 'orderNumber customer');
  if (!returnRecord) {
    throw new AppError(`Return '${id}' not found`, 404);
  }

  const previousStatus = returnRecord.status;
  validateReturnTransition(previousStatus, RETURN_STATUSES.APPROVED);

  returnRecord.status = RETURN_STATUSES.APPROVED;
  returnRecord.decisionBy = {
    userId: user?.id || 'support',
    name: user?.name || 'Support Agent',
    role: user?.role || 'support'
  };
  returnRecord.decisionNote = decisionNote;
  returnRecord.history.push({
    from: previousStatus,
    to: RETURN_STATUSES.APPROVED,
    by: returnRecord.decisionBy,
    at: new Date(),
    note: decisionNote
  });

  await returnRecord.save();

  await recordAuditLog({
    entity: 'Return',
    entityId: returnRecord._id,
    action: 'RETURN_APPROVED',
    performedBy: returnRecord.decisionBy,
    previousState: { status: previousStatus },
    newState: { status: RETURN_STATUSES.APPROVED },
    changes: { decisionNote }
  });

  await notificationStub.notify('return.approved', {
    returnId: returnRecord._id,
    returnNumber: returnRecord.returnNumber,
    orderNumber: returnRecord.order?.orderNumber,
    decisionNote
  });

  eventBus.publish('return.approved', {
    returnId: returnRecord._id,
    returnNumber: returnRecord.returnNumber
  });

  return returnRecord;
};

/**
 * 3. Reject Return Request (Permission: returns.approve)
 */
const rejectReturn = async (id, decisionNote, user) => {
  const returnRecord = await Return.findById(id).populate('order', 'orderNumber customer');
  if (!returnRecord) {
    throw new AppError(`Return '${id}' not found`, 404);
  }

  const previousStatus = returnRecord.status;
  validateReturnTransition(previousStatus, RETURN_STATUSES.REJECTED);

  returnRecord.status = RETURN_STATUSES.REJECTED;
  returnRecord.decisionBy = {
    userId: user?.id || 'support',
    name: user?.name || 'Support Agent',
    role: user?.role || 'support'
  };
  returnRecord.decisionNote = decisionNote;
  returnRecord.history.push({
    from: previousStatus,
    to: RETURN_STATUSES.REJECTED,
    by: returnRecord.decisionBy,
    at: new Date(),
    note: decisionNote
  });

  await returnRecord.save();

  await recordAuditLog({
    entity: 'Return',
    entityId: returnRecord._id,
    action: 'RETURN_REJECTED',
    performedBy: returnRecord.decisionBy,
    previousState: { status: previousStatus },
    newState: { status: RETURN_STATUSES.REJECTED },
    changes: { decisionNote }
  });

  await notificationStub.notify('return.rejected', {
    returnId: returnRecord._id,
    returnNumber: returnRecord.returnNumber,
    orderNumber: returnRecord.order?.orderNumber,
    decisionNote
  });

  eventBus.publish('return.rejected', {
    returnId: returnRecord._id,
    returnNumber: returnRecord.returnNumber
  });

  return returnRecord;
};

/**
 * 4. Update Return Status through State Machine
 */
const updateReturnStatus = async (id, nextStatus, note, user) => {
  const returnRecord = await Return.findById(id).populate('order');
  if (!returnRecord) {
    throw new AppError(`Return '${id}' not found`, 404);
  }

  const previousStatus = returnRecord.status;
  validateReturnTransition(previousStatus, nextStatus);

  returnRecord.status = nextStatus;
  returnRecord.history.push({
    from: previousStatus,
    to: nextStatus,
    by: {
      userId: user?.id || 'support',
      name: user?.name || 'Support Agent',
      role: user?.role || 'support'
    },
    at: new Date(),
    note: note || `Return transitioned from ${previousStatus} to ${nextStatus}`
  });

  // Cross-module consistency hook: restock inventory upon item receipt / inspection OK
  if (
    (nextStatus === RETURN_STATUSES.RECEIVED || nextStatus === RETURN_STATUSES.INSPECTED) &&
    !returnRecord.restocked
  ) {
    const restockItems = returnRecord.items.map(i => ({
      sku: i.product,
      qty: i.qty
    }));
    await inventoryStub.restock(restockItems, returnRecord._id.toString());
    returnRecord.restocked = true;
  }

  await returnRecord.save();

  await recordAuditLog({
    entity: 'Return',
    entityId: returnRecord._id,
    action: 'RETURN_STATUS_UPDATED',
    performedBy: { userId: user?.id, name: user?.name, role: user?.role },
    previousState: { status: previousStatus },
    newState: { status: nextStatus },
    changes: { note, restocked: returnRecord.restocked }
  });

  eventBus.publish('return.status_updated', {
    returnId: returnRecord._id,
    from: previousStatus,
    to: nextStatus
  });

  return returnRecord;
};

/**
 * 5. Query Returns
 */
const getReturns = async (query = {}) => {
  const page = parseInt(query.page, 10) || 1;
  const limit = Math.min(parseInt(query.limit, 10) || 10, 100);
  const skip = (page - 1) * limit;

  const filter = { isArchived: false };
  if (query.status) filter.status = query.status;
  if (query.orderId) {
    if (mongoose.Types.ObjectId.isValid(query.orderId)) {
      filter.order = query.orderId;
    } else {
      const order = await Order.findOne({ orderNumber: query.orderId.toUpperCase() });
      filter.order = order ? order._id : new mongoose.Types.ObjectId();
    }
  }

  if (query.startDate || query.endDate) {
    filter.createdAt = {};
    if (query.startDate) filter.createdAt.$gte = new Date(query.startDate);
    if (query.endDate) filter.createdAt.$lte = new Date(query.endDate);
  }

  let sortOption = { createdAt: -1 };
  if (query.sort) {
    const [field, direction] = query.sort.split(':');
    sortOption = { [field]: direction === 'asc' ? 1 : -1 };
  }

  const [returns, totalRecords] = await Promise.all([
    Return.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .populate('order', 'orderNumber grandTotal customer status paymentStatus')
      .lean(),
    Return.countDocuments(filter)
  ]);

  const totalPages = Math.ceil(totalRecords / limit) || 1;

  return {
    returns,
    pagination: {
      page,
      limit,
      totalRecords,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  };
};

/**
 * 6. Get Single Return by ID
 */
const getReturnById = async (id) => {
  const returnRecord = await Return.findById(id).populate(
    'order',
    'orderNumber grandTotal customer status paymentStatus items'
  );
  if (!returnRecord) {
    throw new AppError(`Return record '${id}' not found`, 404);
  }
  return returnRecord;
};

module.exports = {
  createReturn,
  approveReturn,
  rejectReturn,
  updateReturnStatus,
  getReturns,
  getReturnById
};
