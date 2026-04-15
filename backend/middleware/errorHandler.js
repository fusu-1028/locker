const { messages } = require('../config');
const { AppError, buildErrorMessage } = require('../utils/common');

function errorHandler(error, req, res, next) {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({ message: error.message });
  }

  console.error(`[error] ${req.method} ${req.originalUrl}: ${buildErrorMessage(error)}`);
  return res.status(500).json({ message: messages.serverError });
}

module.exports = errorHandler;
