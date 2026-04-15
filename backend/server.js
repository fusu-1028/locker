const express = require('express');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');

const PORT = Number(process.env.PORT || 3000);
const CABINET_NO = 1;
const DEFAULT_RECORD_LIMIT = 12;
const DB_CONFIG = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '12203990708',
  database: process.env.MYSQL_DATABASE || 'smart_locker',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true
};
const MESSAGES = {
  invalidPhone: '请输入有效的 11 位手机号码。',
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
  verifyOk: '验证码校验成功，柜门已解锁。',
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
  const adminConnection = await mysql.createConnection({
    host: DB_CONFIG.host,
    port: DB_CONFIG.port,
    user: DB_CONFIG.user,
    password: DB_CONFIG.password
  });

  try {
    const databaseName = escapeIdentifier(DB_CONFIG.database);
    await adminConnection.query(
      `CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await adminConnection.end();
  }

  const pool = mysql.createPool(DB_CONFIG);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS parcels (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      phone VARCHAR(20) NOT NULL COMMENT '用户预留手机号',
      pickup_code CHAR(6) NOT NULL UNIQUE COMMENT '六位取件码',
      cabinet_no TINYINT UNSIGNED NOT NULL DEFAULT 1 UNIQUE COMMENT '柜门编号，当前为单柜模式',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='当前柜门中的待取件包裹'
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS parcel_records (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      parcel_id BIGINT UNSIGNED NULL COMMENT '原包裹主键，删除后仅作为日志保留',
      action ENUM('store', 'pickup') NOT NULL COMMENT '业务动作',
      phone VARCHAR(20) NOT NULL COMMENT '用户手机号',
      pickup_code CHAR(6) NOT NULL COMMENT '六位取件码快照',
      cabinet_no TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '柜门编号',
      source VARCHAR(20) NOT NULL DEFAULT 'miniapp' COMMENT '触发来源：miniapp/hardware/debug',
      note VARCHAR(255) NOT NULL DEFAULT '' COMMENT '本次动作说明',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_records_created_at (created_at),
      INDEX idx_records_phone (phone)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='智能快递柜操作流水'
  `);

  return pool;
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
          '小程序录入手机号并提交存件请求',
          '后端写入数据库并生成随机六位取件码',
          '用户取件时先输入手机号查询对应验证码',
          'STM32/ESP8266 上传键盘验证码，校验成功后驱动继电器开锁'
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
          note: '用户已完成存件，等待柜门关闭与上锁。'
        });

        await connection.commit();

        return {
          ...parcel,
          cabinetStatus: 'occupied',
          instruction: '请提醒用户保存六位取件码，取件时需在柜体触摸键盘输入。'
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
        instruction: '请前往柜体触摸键盘输入下方六位取件码，硬件校验通过后自动开锁。',
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
          message: '验证码校验成功，允许柜门打开。'
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

function createApp(service) {
  const app = express();

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

    console.error(error);
    return res.status(500).json({ message: MESSAGES.serverError });
  });

  return app;
}

async function startServer() {
  const service = await createLockerService();
  const app = createApp(service);
  const server = app.listen(PORT, () => {
    console.log(`Smart locker server is listening on http://localhost:${PORT}`);
    console.log(`MySQL database: ${DB_CONFIG.database}`);
  });

  const shutdown = async () => {
    await service.close();
    server.close();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { app, service, server };
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Failed to start server:', error);
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
