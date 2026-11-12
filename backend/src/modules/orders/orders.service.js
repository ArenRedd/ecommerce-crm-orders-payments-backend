const mongoose = require('mongoose');
const Order = require('./order.model');
const Payment = require('../payments/payment.model');
const Refund = require('../payments/refund.model');
const { runInTransaction } = require('../../config/db');
const { generateOrderNumber } = require('../../utils/orderNumber');
const { calculateOrderTotals, paiseToRupees, formatINR } = require('../../utils/money');
const {
  ORDER_STATUSES,
  validateTransition,
  assertCancellable
} = require('../../utils/orderStateMachine');
const customerStub = require('../../integrations/stubs/customerStub');
const productStub = require('../../integrations/stubs/productStub');
const inventoryStub = require('../../integrations/stubs/inventoryStub');
const { recordAuditLog } = require('../audit/auditLog.service');
const AppError = require('../../utils/AppError');

/**
 * Helper to resolve order by either Mongo ObjectId or orderNumber
 */
const findOrderByIdOrNumber = async (idOrNumber, session = null) => {
  let query;
  if (mongoose.Types.ObjectId.isValid(idOrNumber) && String(new mongoose.Types.ObjectId(idOrNumber)) === idOrNumber) {
    query = Order.findOne({ _id: idOrNumber, isArchived: false });
  } else {
    query = Order.findOne({ orderNumber: String(idOrNumber).toUpperCase(), isArchived: false });
  }

  if (session) {
    query = query.session(session);
  }

  const order = await query;
  if (!order) {
    throw new AppError(`Order '${idOrNumber}' not found`, 404);
  }
  return order;
};

/**
 * 1. Create a new Order (Manual / Checkout)
 */
const createOrder = async (orderInput, user) => {
  // Step 1: Validate customer
  const customer = await customerStub.validateCustomer(orderInput.customerId);
  const customerSnapshot = {
    customerId: customer.customerId,
    name: orderInput.customerName || customer.name,
    email: orderInput.customerEmail || customer.email,
    phone: orderInput.customerPhone || customer.phone
  };

  // Step 2: Enrich and snapshot product catalog data
  const enrichedItems = await productStub.enrichAndValidateItems(orderInput.items);

  // Step 3: Server-side totals calculation in integer paise
  const totals = calculateOrderTotals(enrichedItems, orderInput.shippingFee || 0);

  // Step 4: Generate unique order number
  let orderNumber;
  let isUnique = false;
  let attempts = 0;
  while (!isUnique && attempts < 5) {
    orderNumber = generateOrderNumber();
    const existing = await Order.findOne({ orderNumber });
    if (!existing) {
      isUnique = true;
    }
    attempts++;
  }

  // Step 5: Check stock and reserve via inventory stub
  await inventoryStub.reserveStock(enrichedItems, orderNumber);

  // Step 6: Persist order and initial pending payment placeholder inside a transaction
  const shippingAddress = orderInput.shippingAddress;
  const billingAddress = orderInput.billingAddress || orderInput.shippingAddress;
  const paymentMethod = orderInput.paymentMethod || 'RAZORPAY';

  const orderData = {
    orderNumber,
    customer: customerSnapshot,
    items: enrichedItems,
    subtotal: totals.subtotal,
    discountTotal: totals.discountTotal,
    taxTotal: totals.taxTotal,
    shippingFee: totals.shippingFee,
    grandTotal: totals.grandTotal,
    currency: 'INR',
    shippingAddress,
    billingAddress,
    status: ORDER_STATUSES.PLACED,
    paymentStatus: 'PENDING',
    paymentMethod,
    notes: orderInput.notes,
    statusHistory: [
      {
        from: 'NONE',
        to: ORDER_STATUSES.PLACED,
        by: {
          userId: user.id || 'usr_unknown',
          name: user.name || 'User',
          role: user.role || 'customer'
        },
        at: new Date(),
        note: 'Order initiated and stock reserved'
      }
    ],
    isArchived: false,
    createdBy: {
      userId: user.id || 'usr_unknown',
      name: user.name || 'User',
      role: user.role || 'customer'
    }
  };

  const result = await runInTransaction(async (session) => {
    // Create Order
    let createdOrder;
    if (session) {
      const [doc] = await Order.create([orderData], { session });
      createdOrder = doc;
    } else {
      createdOrder = await Order.create(orderData);
    }

    // Create PENDING Payment placeholder record
    const paymentData = {
      order: createdOrder._id,
      amount: totals.grandTotal,
      currency: 'INR',
      method: paymentMethod,
      status: 'PENDING',
      events: [
        {
          event: 'PAYMENT_PENDING_INITIALIZED',
          payload: { orderNumber: createdOrder.orderNumber, amount: totals.grandTotal },
          receivedAt: new Date()
        }
      ]
    };

    let paymentRecord;
    if (session) {
      const [payDoc] = await Payment.create([paymentData], { session });
      paymentRecord = payDoc;
    } else {
      paymentRecord = await Payment.create(paymentData);
    }

    // Record Audit Log
    await recordAuditLog(
      {
        entity: 'Order',
        entityId: createdOrder._id,
        action: 'ORDER_CREATED',
        performedBy: { userId: user.id, name: user.name, role: user.role },
        newState: {
          orderNumber: createdOrder.orderNumber,
          grandTotal: createdOrder.grandTotal,
          status: createdOrder.status,
          itemCount: createdOrder.items.length
        },
        metadata: { paymentId: paymentRecord._id }
      },
      session
    );

    return {
      order: createdOrder,
      payment: paymentRecord
    };
  });

  return result;
};

/**
 * 2. Get list of orders with filters, search, pagination, and sorting
 */
const getOrders = async (query) => {
  const page = parseInt(query.page, 10) || 1;
  const limit = Math.min(parseInt(query.limit, 10) || 10, 100);
  const skip = (page - 1) * limit;

  const filter = {};

  // Soft delete check
  if (!query.includeArchived) {
    filter.isArchived = false;
  }

  // Exact filters
  if (query.status) {
    filter.status = query.status;
  }

  if (query.paymentStatus) {
    filter.paymentStatus = query.paymentStatus;
  }

  // Date range filter
  if (query.startDate || query.endDate) {
    filter.createdAt = {};
    if (query.startDate) {
      filter.createdAt.$gte = new Date(query.startDate);
    }
    if (query.endDate) {
      const end = new Date(query.endDate);
      // If date string without time, include end of day
      if (query.endDate.length === 10) {
        end.setHours(23, 59, 59, 999);
      }
      filter.createdAt.$lte = end;
    }
  }

  // Text search
  if (query.search) {
    const searchRegex = new RegExp(query.search.trim(), 'i');
    filter.$or = [
      { orderNumber: searchRegex },
      { 'customer.name': searchRegex },
      { 'customer.email': searchRegex },
      { 'customer.customerId': searchRegex }
    ];
  }

  // Sorting
  let sortOption = { createdAt: -1 };
  if (query.sort) {
    const [field, direction] = query.sort.split(':');
    sortOption = { [field]: direction === 'asc' ? 1 : -1 };
  }

  const [orders, totalRecords] = await Promise.all([
    Order.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter)
  ]);

  const totalPages = Math.ceil(totalRecords / limit) || 1;

  const pagination = {
    page,
    limit,
    totalRecords,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1
  };

  return { orders, pagination };
};

/**
 * 3. Get single order by ID or orderNumber
 */
const getOrderById = async (idOrNumber) => {
  return await findOrderByIdOrNumber(idOrNumber);
};

/**
 * 4. Update order status through state machine
 */
const updateOrderStatus = async (idOrNumber, newStatus, note, user) => {
  return await runInTransaction(async (session) => {
    const order = await findOrderByIdOrNumber(idOrNumber, session);
    const previousStatus = order.status;

    // Validate state transition (throws 400 if invalid)
    validateTransition(previousStatus, newStatus);

    // Apply mutation
    order.status = newStatus;
    order.statusHistory.push({
      from: previousStatus,
      to: newStatus,
      by: {
        userId: user.id || 'usr_unknown',
        name: user.name || 'User',
        role: user.role || 'support'
      },
      at: new Date(),
      note: note || `Transitioned status from ${previousStatus} to ${newStatus}`
    });

    await order.save({ session });

    // Audit log
    await recordAuditLog(
      {
        entity: 'Order',
        entityId: order._id,
        action: 'ORDER_STATUS_UPDATED',
        performedBy: { userId: user.id, name: user.name, role: user.role },
        previousState: { status: previousStatus },
        newState: { status: newStatus },
        changes: { note }
      },
      session
    );

    return order;
  });
};

/**
 * 5. Cancel order
 * Reverses stock reservation and flags refund if already paid.
 */
const cancelOrder = async (idOrNumber, reason, note, user) => {
  return await runInTransaction(async (session) => {
    const order = await findOrderByIdOrNumber(idOrNumber, session);
    const previousStatus = order.status;

    // Must be cancellable (strictly before SHIPPED)
    assertCancellable(previousStatus);

    // Step 1: Release reserved inventory
    await inventoryStub.releaseStock(order.items, order._id);

    // Step 2: Check if payment was captured and flag refund requirement
    let refundRequired = false;
    let refundPlaceholder = null;

    if (order.paymentStatus === 'PAID') {
      refundRequired = true;
      order.paymentStatus = 'REFUND_PENDING';

      // Find the captured payment
      const payment = await Payment.findOne({ order: order._id, status: 'PAID' }).session(session);

      const refundData = {
        order: order._id,
        payment: payment ? payment._id : null,
        amount: order.grandTotal,
        currency: 'INR',
        status: 'PENDING',
        approvedBy: {
          userId: user.id || 'usr_unknown',
          name: user.name || 'User',
          role: user.role || 'support'
        },
        failureReason: null
      };

      if (session) {
        const [refDoc] = await Refund.create([refundData], { session });
        refundPlaceholder = refDoc;
      } else {
        refundPlaceholder = await Refund.create(refundData);
      }
    }

    // Step 3: Transition status
    order.status = ORDER_STATUSES.CANCELLED;
    order.cancellationReason = reason;
    order.statusHistory.push({
      from: previousStatus,
      to: ORDER_STATUSES.CANCELLED,
      by: {
        userId: user.id || 'usr_unknown',
        name: user.name || 'User',
        role: user.role || 'support'
      },
      at: new Date(),
      note: note ? `${reason} - ${note}` : reason
    });

    await order.save({ session });

    // Step 4: Record Audit Log
    await recordAuditLog(
      {
        entity: 'Order',
        entityId: order._id,
        action: 'ORDER_CANCELLED',
        performedBy: { userId: user.id, name: user.name, role: user.role },
        previousState: { status: previousStatus, paymentStatus: order.paymentStatus },
        newState: { status: ORDER_STATUSES.CANCELLED, paymentStatus: order.paymentStatus },
        changes: { reason, refundRequired, refundId: refundPlaceholder ? refundPlaceholder._id : null }
      },
      session
    );

    return {
      order,
      refundRequired,
      refund: refundPlaceholder
    };
  });
};

/**
 * 6. Get payment details for an order
 */
const getOrderPayment = async (idOrNumber) => {
  const order = await findOrderByIdOrNumber(idOrNumber);
  const payments = await Payment.find({ order: order._id }).sort({ createdAt: -1 }).lean();
  const refunds = await Refund.find({ order: order._id }).sort({ createdAt: -1 }).lean();

  return {
    orderId: order._id,
    orderNumber: order.orderNumber,
    grandTotal: order.grandTotal,
    currency: order.currency,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    payments,
    refunds
  };
};

/**
 * 7. Get tracking information for an order (Stub integration)
 */
const getOrderTracking = async (idOrNumber) => {
  const order = await findOrderByIdOrNumber(idOrNumber);

  // Derive tracking status and history milestones from order statusHistory
  const carrier = 'BlueDart Express';
  const trackingNumber = `BD${order.orderNumber.replace(/[^0-9A-Z]/g, '')}`;

  const estimatedDeliveryDate = new Date(order.createdAt);
  estimatedDeliveryDate.setDate(estimatedDeliveryDate.getDate() + 4);

  const statusMilestones = order.statusHistory.map(entry => ({
    status: entry.to,
    description: entry.note || `Order status updated to ${entry.to}`,
    timestamp: entry.at,
    location: entry.to === 'DELIVERED' ? `${order.shippingAddress.city}, ${order.shippingAddress.state}` : 'Warehouse Hub'
  }));

  return {
    orderNumber: order.orderNumber,
    carrier,
    trackingNumber,
    trackingUrl: `https://track.bluedart.example.com?track=${trackingNumber}`,
    currentStatus: order.status,
    shippingAddress: order.shippingAddress,
    estimatedDelivery: estimatedDeliveryDate,
    isDelivered: order.status === ORDER_STATUSES.DELIVERED,
    milestones: statusMilestones
  };
};

/**
 * 8. Get invoice data for an order (JSON format contract)
 */
const getOrderInvoice = async (idOrNumber) => {
  const order = await findOrderByIdOrNumber(idOrNumber);

  const invoiceNumber = `INV-${order.orderNumber.replace('ORD-', '')}`;
  const invoiceDate = order.createdAt;

  const itemDetails = order.items.map(item => {
    const itemSubtotal = item.unitPrice * item.qty;
    const itemDiscount = (item.discount || 0) * item.qty;
    const itemTax = (item.tax || 0) * item.qty;
    const lineTotal = itemSubtotal - itemDiscount + itemTax;

    return {
      itemId: item._id,
      product: item.product,
      name: item.name,
      sku: item.sku,
      qty: item.qty,
      unitPricePaise: item.unitPrice,
      unitPriceRupees: paiseToRupees(item.unitPrice),
      discountPaise: itemDiscount,
      discountRupees: paiseToRupees(itemDiscount),
      taxPaise: itemTax,
      taxRupees: paiseToRupees(itemTax),
      lineTotalPaise: lineTotal,
      lineTotalRupees: paiseToRupees(lineTotal),
      formattedTotal: formatINR(lineTotal)
    };
  });

  return {
    invoiceNumber,
    invoiceDate,
    orderId: order._id,
    orderNumber: order.orderNumber,
    currency: order.currency,
    customer: order.customer,
    billingAddress: order.billingAddress,
    shippingAddress: order.shippingAddress,
    items: itemDetails,
    summary: {
      subtotalPaise: order.subtotal,
      subtotalRupees: paiseToRupees(order.subtotal),
      subtotalFormatted: formatINR(order.subtotal),
      discountTotalPaise: order.discountTotal,
      discountTotalRupees: paiseToRupees(order.discountTotal),
      discountTotalFormatted: formatINR(order.discountTotal),
      taxTotalPaise: order.taxTotal,
      taxTotalRupees: paiseToRupees(order.taxTotal),
      taxTotalFormatted: formatINR(order.taxTotal),
      shippingFeePaise: order.shippingFee,
      shippingFeeRupees: paiseToRupees(order.shippingFee),
      shippingFeeFormatted: formatINR(order.shippingFee),
      grandTotalPaise: order.grandTotal,
      grandTotalRupees: paiseToRupees(order.grandTotal),
      grandTotalFormatted: formatINR(order.grandTotal)
    },
    paymentInfo: {
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod
    }
  };
};

module.exports = {
  createOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrder,
  getOrderPayment,
  getOrderTracking,
  getOrderInvoice
};
