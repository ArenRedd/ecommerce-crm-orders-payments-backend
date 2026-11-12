const orderService = require('./orders.service');
const apiResponse = require('../../utils/apiResponse');

/**
 * Orders Controller (Thin controller layer)
 */

const createOrder = async (req, res, next) => {
  try {
    const result = await orderService.createOrder(req.body, req.user);
    return apiResponse.created(res, {
      message: 'Order created successfully and inventory reserved',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const getOrders = async (req, res, next) => {
  try {
    const { orders, pagination } = await orderService.getOrders(req.query);
    return apiResponse.paginated(res, {
      message: 'Orders retrieved successfully',
      data: orders,
      pagination
    });
  } catch (error) {
    next(error);
  }
};

const getOrderById = async (req, res, next) => {
  try {
    const order = await orderService.getOrderById(req.params.id);
    return apiResponse.success(res, {
      message: 'Order details retrieved successfully',
      data: order
    });
  } catch (error) {
    next(error);
  }
};

const updateOrderStatus = async (req, res, next) => {
  try {
    const { status, note } = req.body;
    const order = await orderService.updateOrderStatus(req.params.id, status, note, req.user);
    return apiResponse.success(res, {
      message: `Order status successfully updated to '${status}'`,
      data: order
    });
  } catch (error) {
    next(error);
  }
};

const cancelOrder = async (req, res, next) => {
  try {
    const { reason, note } = req.body;
    const result = await orderService.cancelOrder(req.params.id, reason, note, req.user);
    return apiResponse.success(res, {
      message: result.refundRequired
        ? 'Order cancelled successfully. Stock released and refund flagged for processing.'
        : 'Order cancelled successfully and stock released.',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const getOrderPayment = async (req, res, next) => {
  try {
    const paymentData = await orderService.getOrderPayment(req.params.id);
    return apiResponse.success(res, {
      message: 'Order payment details retrieved successfully',
      data: paymentData
    });
  } catch (error) {
    next(error);
  }
};

const getOrderTracking = async (req, res, next) => {
  try {
    const trackingData = await orderService.getOrderTracking(req.params.id);
    return apiResponse.success(res, {
      message: 'Order tracking information retrieved successfully',
      data: trackingData
    });
  } catch (error) {
    next(error);
  }
};

const getOrderInvoice = async (req, res, next) => {
  try {
    const invoiceData = await orderService.getOrderInvoice(req.params.id);
    return apiResponse.success(res, {
      message: 'Order invoice data generated successfully',
      data: invoiceData
    });
  } catch (error) {
    next(error);
  }
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
