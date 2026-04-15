const express = require('express');
const { server: SERVER_CONFIG, database: DB_CONFIG } = require('./config');
const { initializeDatabase } = require('./models/db');
const createLockerService = require('./services/lockerService');
const createParcelController = require('./controllers/parcelController');
const createParcelRouter = require('./routes/parcelRoutes');
const errorHandler = require('./middleware/errorHandler');
const {
  buildErrorMessage,
  wrapStartupError,
  getDisplayServerUrl,
  createCorsMiddleware,
  logInfo
} = require('./utils/common');

function createApp(service) {
  const controller = createParcelController(service);
  const app = express();

  app.disable('x-powered-by');
  app.use(createCorsMiddleware());
  app.use(express.json({ limit: '1mb' }));
  app.use(createParcelRouter(controller));
  app.use(errorHandler);

  return app;
}

function listenAsync(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(SERVER_CONFIG.port, SERVER_CONFIG.host, () => resolve(server));
    server.once('error', reject);
  });
}

function registerShutdownHandlers(server, service) {
  let isShuttingDown = false;

  const shutdown = async (signal) => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    logInfo(`Received ${signal}, shutting down...`);

    await service.close().catch((error) => {
      console.error(`[shutdown] Failed to close MySQL pool: ${buildErrorMessage(error)}`);
    });

    await new Promise((resolve) => {
      server.close(() => resolve());
    });

    logInfo('Shutdown complete.');
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

async function startServer() {
  logInfo('Starting smart locker backend...');

  await initializeDatabase();
  const service = createLockerService();
  const app = createApp(service);

  try {
    const server = await listenAsync(app);
    registerShutdownHandlers(server, service);

    logInfo(`HTTP server listening on ${SERVER_CONFIG.host}:${SERVER_CONFIG.port}`);
    logInfo(`Public access URL: ${getDisplayServerUrl()}`);
    logInfo(`CORS origin: ${SERVER_CONFIG.corsOrigin}`);
    logInfo(`MySQL database: ${DB_CONFIG.database}`);

    return { app, service, server };
  } catch (error) {
    await service.close().catch(() => {});
    throw wrapStartupError('Failed to start HTTP server', error, {
      host: SERVER_CONFIG.host,
      port: SERVER_CONFIG.port
    });
  }
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error(`[startup] ${error.message}`);

    if (process.env.NODE_ENV !== 'production' && error.cause && error.cause.stack) {
      console.error(error.cause.stack);
    }

    process.exit(1);
  });
}

module.exports = {
  createApp,
  startServer
};
