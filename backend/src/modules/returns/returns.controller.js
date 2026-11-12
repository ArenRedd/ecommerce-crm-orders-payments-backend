const Return = require('./return.model');
const apiResponse = require('../../utils/apiResponse');

const getReturns = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const [returns, totalRecords] = await Promise.all([
      Return.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Return.countDocuments()
    ]);

    const totalPages = Math.ceil(totalRecords / limit) || 1;

    return apiResponse.paginated(res, {
      message: 'Returns retrieved successfully',
      data: returns,
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

const getReturnById = async (req, res, next) => {
  try {
    const returnRecord = await Return.findById(req.params.id);
    if (!returnRecord) {
      return apiResponse.error(res, { statusCode: 404, message: 'Return record not found' });
    }
    return apiResponse.success(res, {
      message: 'Return record retrieved successfully',
      data: returnRecord
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getReturns,
  getReturnById
};
