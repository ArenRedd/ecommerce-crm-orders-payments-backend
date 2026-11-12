const returnsService = require('./returns.service');
const apiResponse = require('../../utils/apiResponse');

const createReturn = async (req, res, next) => {
  try {
    const returnRecord = await returnsService.createReturn(req.body, req.files, req.user);
    return apiResponse.created(res, {
      message: 'Return request submitted successfully',
      data: returnRecord
    });
  } catch (error) {
    next(error);
  }
};

const getReturns = async (req, res, next) => {
  try {
    const { returns, pagination } = await returnsService.getReturns(req.query);
    return apiResponse.paginated(res, {
      message: 'Returns retrieved successfully',
      data: returns,
      pagination
    });
  } catch (error) {
    next(error);
  }
};

const getReturnById = async (req, res, next) => {
  try {
    const returnRecord = await returnsService.getReturnById(req.params.id);
    return apiResponse.success(res, {
      message: 'Return details retrieved successfully',
      data: returnRecord
    });
  } catch (error) {
    next(error);
  }
};

const approveReturn = async (req, res, next) => {
  try {
    const { decisionNote } = req.body;
    const returnRecord = await returnsService.approveReturn(req.params.id, decisionNote, req.user);
    return apiResponse.success(res, {
      message: 'Return request approved successfully',
      data: returnRecord
    });
  } catch (error) {
    next(error);
  }
};

const rejectReturn = async (req, res, next) => {
  try {
    const { decisionNote } = req.body;
    const returnRecord = await returnsService.rejectReturn(req.params.id, decisionNote, req.user);
    return apiResponse.success(res, {
      message: 'Return request rejected',
      data: returnRecord
    });
  } catch (error) {
    next(error);
  }
};

const updateReturnStatus = async (req, res, next) => {
  try {
    const { status, note } = req.body;
    const returnRecord = await returnsService.updateReturnStatus(req.params.id, status, note, req.user);
    return apiResponse.success(res, {
      message: `Return status updated to '${status}'`,
      data: returnRecord
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createReturn,
  getReturns,
  getReturnById,
  approveReturn,
  rejectReturn,
  updateReturnStatus
};
