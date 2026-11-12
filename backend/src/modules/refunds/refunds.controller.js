const refundsService = require('./refunds.service');
const apiResponse = require('../../utils/apiResponse');

const createRefund = async (req, res, next) => {
  try {
    const refund = await refundsService.createRefund(req.body, req.user);
    return apiResponse.created(res, {
      message: 'Refund record initiated successfully in PENDING status',
      data: refund
    });
  } catch (error) {
    next(error);
  }
};

const processRefund = async (req, res, next) => {
  try {
    const result = await refundsService.processRefund(req.params.id, req.body || {}, req.user);
    return apiResponse.success(res, {
      message: result.idempotent
        ? 'Refund already processed (idempotent)'
        : 'Refund processed successfully via Razorpay gateway',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const getRefunds = async (req, res, next) => {
  try {
    const { refunds, pagination } = await refundsService.getRefunds(req.query);
    return apiResponse.paginated(res, {
      message: 'Refunds retrieved successfully',
      data: refunds,
      pagination
    });
  } catch (error) {
    next(error);
  }
};

const getRefundById = async (req, res, next) => {
  try {
    const refund = await refundsService.getRefundById(req.params.id);
    return apiResponse.success(res, {
      message: 'Refund details retrieved successfully',
      data: refund
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createRefund,
  processRefund,
  getRefunds,
  getRefundById
};
