const mongoose = require('mongoose');
const Refund = require('../payments/refund.model');
const Return = require('../returns/return.model');
const Order = require('../orders/order.model');
const Payment = require('../payments/payment.model');
const razorpayAdapter = require('../../integrations/payment/razorpay.adapter');
const { runInTransaction } = require('../../config/db');
const { recordAuditLog } = require('../audit/auditLog.service');
const notificationStub = require('../../integrations/stubs/notificationStub');
const eventBus = require('../../integrations/stubs/eventBus');
const AppError = require('../../utils/AppError');
const crypto = require('crypto');

const generateRefundNumber = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `REF-${year}${month}${day}-${random}`;
};

/**
 * 1. Create a Refund Record (for inspected return or cancelled paid order)
 */
const createRefund = async (data, user) => {
  let orderId = data.orderId;
  let returnRecord = null;

  if (data.returnId) {
    returnRecord = await Return.findById(data.returnId);
    if (!returnRecord) {
      throw new AppError(`Return record '${data.returnId}' not found`, 404);
    }

    if (!['INSPECTED', 'APPROVED'].includes(returnRecord.status)) {
      throw new AppError(
        `Cannot initiate refund for return with status '${returnRecord.status}'. Return must be 'INSPECTED' or 'APPROVED'.`,
        400
      );
    }
    orderId = returnRecord.order;
  }

  const order = await Order.findById(orderId);
  if (!order) {
    throw new AppError(`Order '${orderId}' not found`, 404);
  }

  // Find captured payment
  const payment = await Payment.findOne({
    order: order._id,
    status: 'PAID'
  }).sort({ createdAt: -1 });

  if (!payment) {
    throw new AppError(`No captured (PAID) payment transaction found for order #${order.orderNumber}`, 400);
  }

  // Calculate refund amount
  const amountToRefund = data.amount || (returnRecord ? returnRecord.refundAmount : order.grandTotal);

  if (!amountToRefund || amountToRefund <= 0) {
    throw new AppError('Refund amount must be a positive integer in paise', 400);
  }

  // Limit check: validate amount <= paid - already refunded
  const allPaidPayments = await Payment.find({ order: order._id, status: 'PAID' });
  const totalPaid = allPaidPayments.reduce((sum, p) => sum + p.amount, 0);

  const existingProcessedRefunds = await Refund.find({ order: order._id, status: 'PROCESSED' });
  const totalAlreadyRefunded = existingProcessedRefunds.reduce((sum, r) => sum + r.amount, 0);

  const maxRefundable = totalPaid - totalAlreadyRefunded;
  if (amountToRefund > maxRefundable) {
    throw new AppError(
      `Refund amount (${amountToRefund} paise) exceeds available refundable balance (${maxRefundable} paise). Total Paid: ${totalPaid}, Already Refunded: ${totalAlreadyRefunded}`,
      400
    );
  }

  const refundNumber = generateRefundNumber();

  const refundDoc = await Refund.create({
    refundNumber,
    order: order._id,
    return: returnRecord ? returnRecord._id : null,
    payment: payment._id,
    amount: amountToRefund,
    currency: order.currency || 'INR',
    status: 'PENDING',
    notes: data.notes,
    approvedBy: {
      userId: user?.id || 'system',
      name: user?.name || 'User',
      role: user?.role || 'support'
    }
  });

  await recordAuditLog({
    entity: 'Refund',
    entityId: refundDoc._id,
    action: 'REFUND_CREATED',
    performedBy: { userId: user?.id, name: user?.name, role: user?.role },
    newState: { refundNumber, amount: amountToRefund, status: 'PENDING' },
    metadata: { orderNumber: order.orderNumber, returnId: returnRecord?._id }
  });

  return refundDoc;
};

/**
 * 2. Process Refund via Gateway (Separate authorization step - permission: refunds.approve)
 */
const processRefund = async (refundId, { notes } = {}, user) => {
  const refund = await Refund.findById(refundId);
  if (!refund) {
    throw new AppError(`Refund '${refundId}' not found`, 404);
  }

  // Idempotency check: if already processed, return clean
  if (refund.status === 'PROCESSED') {
    return {
      refund,
      message: 'Refund has already been processed (idempotent)',
      idempotent: true
    };
  }

  const order = await Order.findById(refund.order);
  if (!order) {
    throw new AppError(`Associated order ${refund.order} not found`, 404);
  }

  const payment = await Payment.findById(refund.payment);
  if (!payment) {
    throw new AppError(`Associated payment ${refund.payment} not found`, 404);
  }

  // Limit re-verification under atomic lock
  const allPaidPayments = await Payment.find({ order: order._id, status: 'PAID' });
  const totalPaid = allPaidPayments.reduce((sum, p) => sum + p.amount, 0);

  const existingProcessedRefunds = await Refund.find({
    order: order._id,
    status: 'PROCESSED',
    _id: { $ne: refund._id }
  });
  const totalAlreadyRefunded = existingProcessedRefunds.reduce((sum, r) => sum + r.amount, 0);

  const maxRefundable = totalPaid - totalAlreadyRefunded;
  if (refund.amount > maxRefundable) {
    throw new AppError(
      `Cannot process refund: Amount (${refund.amount} paise) exceeds refundable balance (${maxRefundable} paise)`,
      400
    );
  }

  // Call Razorpay refund API via adapter
  let rzpRefundResult;
  try {
    rzpRefundResult = await razorpayAdapter.createRefund({
      paymentId: payment.razorpayPaymentId || `pay_mock_${Date.now()}`,
      amount: refund.amount,
      notes: {
        refundId: refund._id.toString(),
        orderNumber: order.orderNumber,
        notes: notes || refund.notes || 'Order refund'
      }
    });
  } catch (gatewayErr) {
    refund.status = 'FAILED';
    refund.failureReason = gatewayErr.message;
    await refund.save();

    await recordAuditLog({
      entity: 'Refund',
      entityId: refund._id,
      action: 'REFUND_GATEWAY_FAILED',
      performedBy: { userId: user?.id, name: user?.name, role: user?.role },
      newState: { status: 'FAILED', reason: gatewayErr.message }
    });

    throw new AppError(`Gateway refund execution failed: ${gatewayErr.message}`, 502);
  }

  // Transactional database update
  const result = await runInTransaction(async (session) => {
    refund.status = 'PROCESSED';
    refund.razorpayRefundId = rzpRefundResult.id;
    refund.processedAt = new Date();
    refund.approvedBy = {
      userId: user?.id || 'finance_agent',
      name: user?.name || 'Finance Agent',
      role: user?.role || 'finance'
    };
    if (notes) refund.notes = notes;
    await refund.save({ session });

    // Update Order paymentStatus: PARTIALLY_REFUNDED vs REFUNDED
    const newTotalRefunded = totalAlreadyRefunded + refund.amount;
    order.paymentStatus = newTotalRefunded >= totalPaid ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    await order.save({ session });

    // If linked to a Return, transition Return status to REFUNDED
    let returnRecord = null;
    if (refund.return) {
      returnRecord = await Return.findById(refund.return).session(session);
      if (returnRecord && returnRecord.status !== 'REFUNDED') {
        const prevReturnStatus = returnRecord.status;
        returnRecord.status = 'REFUNDED';
        returnRecord.history.push({
          from: prevReturnStatus,
          to: 'REFUNDED',
          by: {
            userId: user?.id || user?.userId || 'finance_agent',
            name: user?.name || 'Finance Agent',
            role: user?.role || 'finance'
          },
          at: new Date(),
          note: `Refund processed successfully via Razorpay (ID: ${rzpRefundResult.id})`
        });
        await returnRecord.save({ session });
      }
    }

    await recordAuditLog(
      {
        entity: 'Refund',
        entityId: refund._id,
        action: 'REFUND_PROCESSED',
        performedBy: { userId: user?.id, name: user?.name, role: user?.role },
        newState: {
          status: 'PROCESSED',
          razorpayRefundId: rzpRefundResult.id,
          orderPaymentStatus: order.paymentStatus
        },
        metadata: { orderNumber: order.orderNumber, returnId: refund.return }
      },
      session
    );

    return {
      refund,
      order,
      return: returnRecord
    };
  });

  // Cross-module consistency notification & event bus
  await notificationStub.notify('refund.processed', {
    refundId: refund._id,
    orderNumber: order.orderNumber,
    amount: refund.amount,
    razorpayRefundId: rzpRefundResult.id
  });

  eventBus.publish('refund.processed', {
    refundId: refund._id,
    orderNumber: order.orderNumber,
    amount: refund.amount
  });

  return result;
};

/**
 * 3. Query Refunds
 */
const getRefunds = async (query = {}) => {
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
  if (query.returnId) filter.return = query.returnId;

  if (query.startDate || query.endDate) {
    filter.createdAt = {};
    if (query.startDate) filter.createdAt.$gte = new Date(query.startDate);
    if (query.endDate) filter.createdAt.$lte = new Date(query.endDate);
  }

  const [refunds, totalRecords] = await Promise.all([
    Refund.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('order', 'orderNumber grandTotal customer paymentStatus')
      .populate('return', 'returnNumber status reason')
      .populate('payment', 'amount method razorpayPaymentId')
      .lean(),
    Refund.countDocuments(filter)
  ]);

  const totalPages = Math.ceil(totalRecords / limit) || 1;

  return {
    refunds,
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
 * 4. Get Single Refund by ID
 */
const getRefundById = async (id) => {
  const refund = await Refund.findById(id)
    .populate('order', 'orderNumber grandTotal customer paymentStatus')
    .populate('return', 'returnNumber status reason items')
    .populate('payment', 'amount method razorpayPaymentId');

  if (!refund) {
    throw new AppError(`Refund record '${id}' not found`, 404);
  }
  return refund;
};

module.exports = {
  createRefund,
  processRefund,
  getRefunds,
  getRefundById
};
