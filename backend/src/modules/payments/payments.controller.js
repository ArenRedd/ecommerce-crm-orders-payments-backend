const paymentsService = require('./payments.service');
const apiResponse = require('../../utils/apiResponse');

/**
 * Payments Controller (Thin controller layer)
 */

const createRazorpayOrder = async (req, res, next) => {
  try {
    const { orderId } = req.body;
    const checkoutData = await paymentsService.createRazorpayOrder(orderId, req.user);
    return apiResponse.created(res, {
      message: 'Razorpay order generated successfully for checkout',
      data: checkoutData
    });
  } catch (error) {
    next(error);
  }
};

const verifyPayment = async (req, res, next) => {
  try {
    const result = await paymentsService.verifyPayment(req.body, req.user);
    return apiResponse.success(res, {
      message: result.isDuplicateVerification
        ? 'Payment has already been verified and marked as PAID'
        : 'Payment verified successfully and order confirmed',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const handleWebhook = async (req, res, next) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = req.body; // Buffer from express.raw

    const outcome = await paymentsService.handleWebhook({ rawBody, signature });
    return apiResponse.success(res, {
      message: outcome.message || 'Webhook acknowledged',
      data: outcome
    });
  } catch (error) {
    next(error);
  }
};

const createManualPayment = async (req, res, next) => {
  try {
    const payment = await paymentsService.createManualPayment(req.body, req.user);
    return apiResponse.created(res, {
      message: 'Manual offline payment recorded successfully',
      data: payment
    });
  } catch (error) {
    next(error);
  }
};

const getPayments = async (req, res, next) => {
  try {
    const { payments, pagination } = await paymentsService.getPayments(req.query);
    return apiResponse.paginated(res, {
      message: 'Payments retrieved successfully',
      data: payments,
      pagination
    });
  } catch (error) {
    next(error);
  }
};

const getPaymentById = async (req, res, next) => {
  try {
    const payment = await paymentsService.getPaymentById(req.params.id);
    return apiResponse.success(res, {
      message: 'Payment details retrieved successfully',
      data: payment
    });
  } catch (error) {
    next(error);
  }
};

const updatePaymentStatus = async (req, res, next) => {
  try {
    const payment = await paymentsService.updatePaymentStatus(req.params.id, req.body, req.user);
    return apiResponse.success(res, {
      message: `Payment status successfully updated to '${req.body.status}'`,
      data: payment
    });
  } catch (error) {
    next(error);
  }
};

const reconcilePayments = async (req, res, next) => {
  try {
    const summary = await paymentsService.reconcilePendingPayments(req.body);
    return apiResponse.success(res, {
      message: `Payment reconciliation completed. Checked ${summary.checkedCount}, resolved ${summary.reconciledCount}.`,
      data: summary
    });
  } catch (error) {
    next(error);
  }
};

const getRefunds = async (req, res, next) => {
  try {
    const refunds = await paymentsService.getRefunds();
    return apiResponse.success(res, {
      message: 'Refund records retrieved successfully',
      data: refunds
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createRazorpayOrder,
  verifyPayment,
  handleWebhook,
  createManualPayment,
  getPayments,
  getPaymentById,
  updatePaymentStatus,
  reconcilePayments,
  getRefunds
};
