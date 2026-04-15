const crypto = require('node:crypto');
const { database: DB_CONFIG, locker, messages } = require('../config');
const { getPool, closeDatabase } = require('../models/db');
const { normalizePhone, isValidPhone } = require('../utils/phone');
const { formatParcel, formatRecord, buildCabinetState } = require('../utils/format');
const { AppError, normalizePickupCode, clampRecordLimit } = require('../utils/common');

function createLockerService() {
  const pool = getPool();

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

    throw new AppError(500, messages.pickupCodeGenerationFailed);
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
      [locker.cabinetNo]
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
        payload.cabinetNo || locker.cabinetNo,
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

  async function getRecentRecords(limit = locker.defaultRecordLimit, connection = pool) {
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
        throw new AppError(400, messages.invalidPhone);
      }

      const connection = await pool.getConnection();

      try {
        await connection.beginTransaction();

        const [occupiedRows] = await connection.query(
          'SELECT id FROM parcels WHERE cabinet_no = ? FOR UPDATE',
          [locker.cabinetNo]
        );

        if (occupiedRows.length > 0) {
          throw new AppError(409, messages.cabinetOccupied);
        }

        const pickupCode = await generateUniquePickupCode(connection);
        const [result] = await connection.query(
          'INSERT INTO parcels (phone, pickup_code, cabinet_no) VALUES (?, ?, ?)',
          [phone, pickupCode, locker.cabinetNo]
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
        throw new AppError(400, messages.invalidPhone);
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
        throw new AppError(404, messages.parcelNotFoundByPhone);
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
        throw new AppError(400, messages.invalidPickupCode);
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
          throw new AppError(404, messages.parcelNotFoundByCode);
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
      await closeDatabase();
    }
  };
}

module.exports = createLockerService;
