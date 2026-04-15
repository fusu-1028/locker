const { server: SERVER_CONFIG, database: DB_CONFIG, locker } = require('../config');

class AppError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
  }
}

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function logInfo(message) {
  console.log(`[startup] ${message}`);
}

function logWarn(message) {
  console.warn(`[startup] ${message}`);
}

function escapeIdentifier(value) {
  return String(value).replace(/`/g, '``');
}

function normalizePickupCode(code) {
  return String(code || '').replace(/\s+/g, '').trim();
}

function clampRecordLimit(limitInput) {
  const parsed = Number.parseInt(limitInput, 10);

  if (Number.isNaN(parsed)) {
    return locker.defaultRecordLimit;
  }

  return Math.min(Math.max(parsed, 1), 50);
}

function buildErrorMessage(error, fallbackTarget) {
  const details = [];

  if (error.code) {
    details.push(`code=${error.code}`);
  }

  if (error.errno) {
    details.push(`errno=${error.errno}`);
  }

  if (error.address || error.port || fallbackTarget) {
    const host = error.address || (fallbackTarget && fallbackTarget.host) || DB_CONFIG.host;
    const port = error.port || (fallbackTarget && fallbackTarget.port) || DB_CONFIG.port;
    details.push(`target=${host}:${port}`);
  }

  if (error.sqlMessage) {
    details.push(error.sqlMessage);
  } else if (error.message) {
    details.push(error.message);
  }

  return details.join(' | ');
}

function wrapStartupError(message, error, fallbackTarget) {
  return new Error(`${message}: ${buildErrorMessage(error, fallbackTarget)}`, { cause: error });
}

function getDisplayServerUrl() {
  const displayHost = SERVER_CONFIG.host === '0.0.0.0' ? 'SERVER_IP_OR_DOMAIN' : SERVER_CONFIG.host;
  return `http://${displayHost}:${SERVER_CONFIG.port}`;
}

function createCorsMiddleware() {
  return (req, res, next) => {
    if (SERVER_CONFIG.corsOrigin === '*') {
      res.setHeader('Access-Control-Allow-Origin', '*');
    } else {
      res.setHeader('Access-Control-Allow-Origin', SERVER_CONFIG.corsOrigin);
      res.setHeader('Vary', 'Origin');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }

    next();
  };
}

module.exports = {
  AppError,
  asyncHandler,
  logInfo,
  logWarn,
  escapeIdentifier,
  normalizePickupCode,
  clampRecordLimit,
  buildErrorMessage,
  wrapStartupError,
  getDisplayServerUrl,
  createCorsMiddleware
};
