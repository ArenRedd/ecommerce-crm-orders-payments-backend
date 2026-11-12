const Payment = require('./payment.model');
const Refund = require('./refund.model');
const apiResponse = require('../../utils/apiResponse');

const getPayments = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const [payments, totalRecords] = await Promise.all([
      Payment.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Payment.countDocuments()
    ]);

    const totalPages = Math.ceil(totalRecords / limit) || 1;

    return apiResponse.paginated(res, {
      message: 'Payments retrieved successfully',
      data: payments,
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    next(error);
  }
};

const getPaymentById = async (req, res, next) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return apiResponse.error(res, { statusCode: 404, message: 'Payment record not found' });
    }
    return apiResponse.success(res, {
      message: 'Payment retrieved successfully',
      data: payment
    });
  } catch (error) {
    next(error);
  }
};

const getRefunds = async (req, res, next) => {
  try {
    const refunds = await Refund.find().sort({ createdAt: -1 }).lean();
    return apiResponse.success(res, {
      message: 'Refund records retrieved successfully',
      data: refunds
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPayments,
  getPaymentById,
  getRefunds
};
