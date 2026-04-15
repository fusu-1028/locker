const express = require('express');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const { database: DB_CONFIG, server: SERVER_CONFIG } = require('./config');

const HOST = SERVER_CONFIG.host;
const PORT = SERVER_CONFIG.port;
const CORS_ORIGIN = SERVER_CONFIG.corsOrigin;
const CABINET_NO = 1;
const DEFAULT_RECORD_LIMIT = 12;

const MESSAGES = {
  invalidPhone: '请输入有效的 11 位手机号。',
  invalidPickupCode: '请输入有效的 6 位取件码。',
  cabinetOccupied: '当前柜门已被占用，请先完成取件。',
  pickupCodeGenerationFailed: '取件码生成失败，请稍后重试。',
  parcelNotFoundByPhone: '未查询到该手机号对应的待取件信息。',
  parcelNotFoundByCode: '取件码不存在或已失效。',
  healthOk: '智能快递柜服务运行正常。',
  dashboardOk: '联调看板加载成功。',
  cabinetOk: '柜体状态加载成功。',
  parcelListOk: '当前包裹数据加载成功。',
  recordsOk: '操作记录加载成功。',
  storeOk: '存件成功，已生成取件码。',
  takeOk: '已查询到取件信息，请在柜体键盘输入验证码。',
  verifyOk: '取件码校验成功，柜门已解锁。',
  hardwareVerifyOk: '硬件验证码校验成功，已下发开锁指令。',
  serverError: '服务器内部错误，请稍后重试。'
};

class AppError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
  }
}

function logInfo(message) {
  console.log(`[startup] ${message}`);
}

function logWarn(message) {
  console.warn(`[startup] ${message}`);
}

function buildErrorMessage(error) {
  const details = [];

  if (error.code) {
    details.push(`code=${error.code}`);
  }

  if (error.errno) {
    details.push(`errno=${error.errno}`);
  }

  if (error.address || error.port) {
    details.push(`target=${error.address || DB_CONFIG.host}:${error.port || DB_CONFIG.port}`);
  }

  if (error.sqlMessage) {
    details.push(error.sqlMessage);
  } else if (error.message) {
    details.push(error.message);
  }

  return details.join(' | ');
}

function wrapStartupError(message, error) {
  return new Error(`${message}: ${buildErrorMessage(error)}`, { cause: error });
}

function getDisplayServerUrl() {
  const displayHost = HOST === '0.0.0.0' ? 'SERVER_IP_OR_DOMAIN' : HOST;
  return `http://${displayHost}:${PORT}`;
}

function normalizePhone(phone) {
  return String(phone || '').trim().replace(/^\+?86/, '');
}

function isValidPhone(phone) {
  return /^1[3-9]\d{9}$/.test(phone);
}

function normalizePickupCode(code) {
  return String(code || '').replace(/\s+/g, '').trim();
}

function escapeIdentifier(value) {
  return String(value).replace(/`/g, '``');
}

function clampRecordLimit(limitInput) {
  const parsed = Number.parseInt(limitInput, 10);

  if (Number.isNaN(parsed)) {
    return DEFAULT_RECORD_LIMIT;
  }

  return Math.min(Math.max(parsed, 1), 50);
}

function maskPhone(phoneInput) {
  const phone = normalizePhone(phoneInput);

  if (!/^\d{11}$/.test(phone)) {
    return phone;
  }

  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

function formatParcel(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    phone: row.phone,
    maskedPhone: maskPhone(row.phone),
    pickupCode: row.pickupCode || row.pickup_code,
    cabinetNo: row.cabinetNo || row.cabinet_no,
    createdAt: row.createdAt || row.created_at,
    updatedAt: row.updatedAt || row.updated_at
  };
}

function formatRecord(row) {
  return {
    id: row.id,
    parcelId: row.parcelId || row.parcel_id || null,
    action: row.action,
    actionText: row.action === 'pickup' ? '取件开锁' : '存件完成',
    phone: row.phone,
    maskedPhone: maskPhone(row.phone),
    pickupCode: row.pickupCode || row.pickup_code,
    cabinetNo: row.cabinetNo || row.cabinet_no,
    source: row.source,
    note: row.note,
    createdAt: row.createdAt || row.created_at
  };
}

function buildCabinetState(parcel) {
  const hasPendingParcel = Boolean(parcel);

  return {
    cabinetNo: CABINET_NO,
    status: hasPendingParcel ? 'occupied' : 'idle',
    statusText: hasPendingParcel ? '使用中' : '空闲待用',
    hasPendingParcel,
    parcel
  };
}

async function ensureDatabaseReady() {
  logInfo(
    `Preparing MySQL connection ${DB_CONFIG.user}@${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`
  );

  let adminConnection = null;

  try {
    adminConnection = await mysql.createConnection({
      host: DB_CONFIG.host,
      port: DB_CONFIG.port,
      user: DB_CONFIG.user,
      password: DB_CONFIG.password
    });

    const databaseName = escapeIdentifier(DB_CONFIG.database);
    await adminConnection.query(
      `CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    logInfo(`Database ensured: ${DB_CONFIG.database}`);
  } catch (error) {
    const permissionErrors = new Set([
      'ER_DBACCESS_DENIED_ERROR',
      'ER_SPECIFIC_ACCESS_DENIED_ERROR'
    ]);

    if (permissionErrors.has(error.code)) {
      logWarn(
        `MySQL user ${DB_CONFIG.user} cannot create databases automatically. ` +
        `Will continue and try to use existing database ${DB_CONFIG.database}.`
      );
    } else {
      throw wrapStartupError('Failed to connect to MySQL before initialization', error);
    }
  } finally {
    if (adminConnection) {
      await adminConnection.end().catch(() => {});
    }
  }

  const pool = mysql.createPool(DB_CONFIG);

  try {
    await pool.query('SELECT 1');
    logInfo('MySQL connection established.');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS parcels (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        phone VARCHAR(20) NOT NULL COMMENT 'User phone number',
        pickup_code CHAR(6) NOT NULL UNIQUE COMMENT '6-digit pickup code',
        cabinet_no TINYINT UNSIGNED NOT NULL DEFAULT 1 UNIQUE COMMENT 'Cabinet number',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Current parcels waiting for pickup'
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS parcel_records (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        parcel_id BIGINT UNSIGNED NULL COMMENT 'Historical parcel id',
        action ENUM('store', 'pickup') NOT NULL COMMENT 'Business action',
        phone VARCHAR(20) NOT NULL COMMENT 'User phone number',
        pickup_code CHAR(6) NOT NULL COMMENT '6-digit pickup code snapshot',
        cabinet_no TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Cabinet number',
        source VARCHAR(20) NOT NULL DEFAULT 'miniapp' COMMENT 'Request source: miniapp/hardware/debug',
        note VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'Business note',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_records_created_at (created_at),
        INDEX idx_records_phone (phone)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Locker operation history'
    `);

    logInfo('MySQL tables ensured.');
    return pool;
  } catch (error) {
    await pool.end().catch(() => {});
    throw wrapStartupError(`Failed to initialize database ${DB_CONFIG.database}`, error);
  }
}

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

async function createLockerService() {
  const pool = await ensureDatabaseReady();

  async function generateUniquePickupCode(connection) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const pickupCode = String(crypto.randomInt(100000, 1000000));
      const [rows] = await connection.query(
        'SELECT 1 FROM parcels WHERE pickup_code = ? LIMIT 1',
        [pickupCode]
      );

      if (rows.length === 0) {
        return pickupCode;
      }
    }

    throw new AppError(500, MESSAGES.pickupCodeGenerationFailed);
  }

  async function getCurrentParcel(connection = pool) {
    const [rows] = await connection.query(
      `SELECT
        id,
        phone,
        pickup_code AS pickupCode,
        cabinet_no AS cabinetNo,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM parcels
      WHERE cabinet_no = ?
      LIMIT 1`,
      [CABINET_NO]
    );

    return formatParcel(rows[0]);
  }

  async function createRecord(connection, payload) {
    await connection.query(
      `INSERT INTO parcel_records (
        parcel_id,
        action,
        phone,
        pickup_code,
        cabinet_no,
        source,
        note
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.parcelId || null,
        payload.action,
        payload.phone,
        payload.pickupCode,
        payload.cabinetNo || CABINET_NO,
        payload.source || 'miniapp',
        payload.note || ''
      ]
    );
  }

  async function getRecordSummary(connection = pool) {
    const [rows] = await connection.query(`
      SELECT
        COUNT(*) AS totalCount,
        COALESCE(SUM(CASE WHEN action = 'store' THEN 1 ELSE 0 END), 0) AS storeCount,
        COALESCE(SUM(CASE WHEN action = 'pickup' THEN 1 ELSE 0 END), 0) AS pickupCount,
        COALESCE(SUM(CASE WHEN DATE(created_at) = CURRENT_DATE THEN 1 ELSE 0 END), 0) AS todayCount
      FROM parcel_records
    `);

    const summary = rows[0] || {};

    return {
      totalCount: Number(summary.totalCount || 0),
      storeCount: Number(summary.storeCount || 0),
      pickupCount: Number(summary.pickupCount || 0),
      todayCount: Number(summary.todayCount || 0)
    };
  }

  async function getRecentRecords(limit = DEFAULT_RECORD_LIMIT, connection = pool) {
    const [rows] = await connection.query(
      `SELECT
        id,
        parcel_id AS parcelId,
        action,
        phone,
        pickup_code AS pickupCode,
        cabinet_no AS cabinetNo,
        source,
        note,
        created_at AS createdAt
      FROM parcel_records
      ORDER BY id DESC
      LIMIT ?`,
      [clampRecordLimit(limit)]
    );

    return rows.map(formatRecord);
  }

  return {
    async getSystemStatus() {
      const [parcel, recordSummary] = await Promise.all([
        getCurrentParcel(),
        getRecordSummary()
      ]);

      return {
        database: DB_CONFIG.database,
        databaseHost: DB_CONFIG.host,
        cabinet: buildCabinetState(parcel),
        recordSummary
      };
    },
    async getDashboard(limit = 6) {
      const [parcel, summary, recentRecords] = await Promise.all([
        getCurrentParcel(),
        getRecordSummary(),
        getRecentRecords(limit)
      ]);

      return {
        projectName: '智能快递柜联调看板',
        cabinet: buildCabinetState(parcel),
        summary,
        recentRecords,
        flow: [
          '小程序录入手机号并提交存件请求。',
          '后端写入数据库并生成随机六位取件码。',
          '用户取件时先输入手机号查询待取件信息。',
          'STM32 或 ESP8266 上传键盘验证码，校验成功后驱动继电器开锁。'
        ]
      };
    },
    async getCabinetStatus() {
      const parcel = await getCurrentParcel();
      return buildCabinetState(parcel);
    },
    async listParcels() {
      const parcel = await getCurrentParcel();
      return parcel ? [parcel] : [];
    },
    async listRecords(limit) {
      const [summary, records] = await Promise.all([
        getRecordSummary(),
        getRecentRecords(limit)
      ]);

      return {
        summary,
        records
      };
    },
    async storeParcel(phoneInput) {
      const phone = normalizePhone(phoneInput);

      if (!isValidPhone(phone)) {
        throw new AppError(400, MESSAGES.invalidPhone);
      }

      const connection = await pool.getConnection();

      try {
        await connection.beginTransaction();

        const [occupiedRows] = await connection.query(
          'SELECT id FROM parcels WHERE cabinet_no = ? FOR UPDATE',
          [CABINET_NO]
        );

        if (occupiedRows.length > 0) {
          throw new AppError(409, MESSAGES.cabinetOccupied);
        }

        const pickupCode = await generateUniquePickupCode(connection);
        const [result] = await connection.query(
          'INSERT INTO parcels (phone, pickup_code, cabinet_no) VALUES (?, ?, ?)',
          [phone, pickupCode, CABINET_NO]
        );

        const [rows] = await connection.query(
          `SELECT
            id,
            phone,
            pickup_code AS pickupCode,
            cabinet_no AS cabinetNo,
            created_at AS createdAt,
            updated_at AS updatedAt
          FROM parcels
          WHERE id = ?`,
          [result.insertId]
        );

        const parcel = formatParcel(rows[0]);
        await createRecord(connection, {
          parcelId: parcel.id,
          action: 'store',
          phone: parcel.phone,
          pickupCode: parcel.pickupCode,
          cabinetNo: parcel.cabinetNo,
          source: 'miniapp',
          note: '用户已完成存件，等待柜门关闭并上锁。'
        });

        await connection.commit();

        return {
          ...parcel,
          cabinetStatus: 'occupied',
          instruction: '请提醒用户保存六位取件码，取件时需要在柜体键盘输入。'
        };
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },
    async getParcelByPhone(phoneInput) {
      const phone = normalizePhone(phoneInput);

      if (!isValidPhone(phone)) {
        throw new AppError(400, MESSAGES.invalidPhone);
      }

      const [rows] = await pool.query(
        `SELECT
          id,
          phone,
          pickup_code AS pickupCode,
          cabinet_no AS cabinetNo,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM parcels
        WHERE phone = ?
        LIMIT 1`,
        [phone]
      );

      if (rows.length === 0) {
        throw new AppError(404, MESSAGES.parcelNotFoundByPhone);
      }

      const parcel = formatParcel(rows[0]);

      return {
        ...parcel,
        cabinetStatus: 'occupied',
        pickupStage: 'keyboard_verification',
        instruction: '请前往柜体触摸键盘输入下方六位取件码，硬件校验通过后会自动开锁。',
        hardwareEndpoint: '/api/hardware/verify-pickup'
      };
    },
    async verifyAndOpenByPickupCode(codeInput, options = {}) {
      const pickupCode = normalizePickupCode(codeInput);
      const source = options.source || 'hardware';

      if (!/^\d{6}$/.test(pickupCode)) {
        throw new AppError(400, MESSAGES.invalidPickupCode);
      }

      const connection = await pool.getConnection();

      try {
        await connection.beginTransaction();

        const [rows] = await connection.query(
          `SELECT
            id,
            phone,
            pickup_code AS pickupCode,
            cabinet_no AS cabinetNo,
            created_at AS createdAt,
            updated_at AS updatedAt
          FROM parcels
          WHERE pickup_code = ?
          LIMIT 1
          FOR UPDATE`,
          [pickupCode]
        );

        if (rows.length === 0) {
          throw new AppError(404, MESSAGES.parcelNotFoundByCode);
        }

        const parcel = formatParcel(rows[0]);
        await connection.query('DELETE FROM parcels WHERE id = ?', [parcel.id]);
        await createRecord(connection, {
          parcelId: parcel.id,
          action: 'pickup',
          phone: parcel.phone,
          pickupCode: parcel.pickupCode,
          cabinetNo: parcel.cabinetNo,
          source,
          note: source === 'hardware'
            ? '硬件验证码校验成功，已向继电器发送开锁脉冲。'
            : '开发联调模式下模拟开锁成功。'
        });
        await connection.commit();

        return {
          openDoor: true,
          cabinetNo: parcel.cabinetNo,
          cabinetStatus: 'idle',
          phone: parcel.phone,
          maskedPhone: parcel.maskedPhone,
          pickupCode: parcel.pickupCode,
          verifySource: source,
          relayCommand: {
            action: 'pulse_open',
            cabinetNo: parcel.cabinetNo,
            durationMs: 800
          },
          command: {
            action: 'open',
            cabinetNo: parcel.cabinetNo
          },
          message: '取件码校验成功，允许柜门打开。'
        };
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },
    async close() {
      await pool.end();
    }
  };
}

function applyCors(app) {
  app.use((req, res, next) => {
    if (CORS_ORIGIN === '*') {
      res.setHeader('Access-Control-Allow-Origin', '*');
    } else {
      res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
      res.setHeader('Vary', 'Origin');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }

    next();
  });
}

function createApp(service) {
  const app = express();

  app.disable('x-powered-by');
  applyCors(app);
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', asyncHandler(async (req, res) => {
    res.json({
      message: MESSAGES.healthOk,
      data: await service.getSystemStatus()
    });
  }));

  app.get('/api/dashboard', asyncHandler(async (req, res) => {
    res.json({
      message: MESSAGES.dashboardOk,
      data: await service.getDashboard(req.query.limit)
    });
  }));

  app.get('/api/cabinet', asyncHandler(async (req, res) => {
    res.json({
      message: MESSAGES.cabinetOk,
      data: await service.getCabinetStatus()
    });
  }));

  app.get('/api/parcels', asyncHandler(async (req, res) => {
    res.json({
      message: MESSAGES.parcelListOk,
      data: await service.listParcels()
    });
  }));

  app.get('/api/records', asyncHandler(async (req, res) => {
    res.json({
      message: MESSAGES.recordsOk,
      data: await service.listRecords(req.query.limit)
    });
  }));

  app.get('/health', (req, res) => {
    res.json({ ok: true, service: 'locker-backend' });
  });
  
  app.post('/api/parcels/store', asyncHandler(async (req, res) => {
    const result = await service.storeParcel(req.body.phone);
    res.status(201).json({
      message: MESSAGES.storeOk,
      data: result
    });
  }));

  app.post('/api/parcels/take', asyncHandler(async (req, res) => {
    const result = await service.getParcelByPhone(req.body.phone);
    res.json({
      message: MESSAGES.takeOk,
      data: result
    });
  }));

  app.post('/api/parcels/verify-pickup', asyncHandler(async (req, res) => {
    const result = await service.verifyAndOpenByPickupCode(req.body.pickupCode || req.body.code, {
      source: 'debug'
    });
    res.json({
      message: MESSAGES.verifyOk,
      data: result
    });
  }));

  app.post('/api/hardware/verify-pickup', asyncHandler(async (req, res) => {
    const result = await service.verifyAndOpenByPickupCode(req.body.pickupCode || req.body.code, {
      source: 'hardware'
    });
    res.json({
      message: MESSAGES.hardwareVerifyOk,
      data: result
    });
  }));

  app.use((error, req, res, next) => {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    console.error(`[error] ${req.method} ${req.originalUrl}: ${buildErrorMessage(error)}`);
    return res.status(500).json({ message: MESSAGES.serverError });
  });

  return app;
}

function listenAsync(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, HOST, () => resolve(server));
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

  const service = await createLockerService();
  const app = createApp(service);

  try {
    const server = await listenAsync(app);
    registerShutdownHandlers(server, service);

    logInfo(`HTTP server listening on ${HOST}:${PORT}`);
    logInfo(`Public access URL: ${getDisplayServerUrl()}`);
    logInfo(`CORS origin: ${CORS_ORIGIN}`);
    logInfo(`MySQL database: ${DB_CONFIG.database}`);

    return { app, service, server };
  } catch (error) {
    await service.close().catch(() => {});
    throw wrapStartupError('Failed to start HTTP server', error);
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
  AppError,
  DB_CONFIG,
  createApp,
  createLockerService,
  startServer
};
