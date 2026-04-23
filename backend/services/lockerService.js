const crypto = require('node:crypto');
const {
  database: DB_CONFIG,
  locker,
  messages,
  orderStatus,
  logType
} = require('../config');
const { getPool, closeDatabase } = require('../models/db');
const { normalizePhone, isValidPhone } = require('../utils/phone');
const { formatOrder, formatLog, buildCabinetState } = require('../utils/format');
const { AppError, normalizePickupCode, clampRecordLimit } = require('../utils/common');

function createLockerService() {
  const pool = getPool();

  function buildOpenCommand() {
    return {
      relayCommand: {
        action: 'pulse_open',
        cabinetCode: locker.cabinetCode,
        durationMs: locker.relayPulseMs
      },
      command: {
        action: 'open',
        cabinetCode: locker.cabinetCode
      }
    };
  }

  async function createLog(connection, type, orderId = null) {
    await connection.query(
      'INSERT INTO device_log (order_id, type) VALUES (?, ?)',
      [orderId, type]
    );
  }

  async function createFailLog(orderId = null) {
    await pool.query(
      'INSERT INTO device_log (order_id, type) VALUES (?, ?)',
      [orderId, logType.fail]
    );
  }

  async function generateUniquePickupCode(connection) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const pickupCode = String(crypto.randomInt(100000, 1000000));
      const [rows] = await connection.query(
        'SELECT 1 FROM parcel_order WHERE pickup_code = ? LIMIT 1',
        [pickupCode]
      );

      if (rows.length === 0) {
        return pickupCode;
      }
    }

    throw new AppError(500, messages.pickupCodeGenerationFailed);
  }

  async function getCabinetRow(connection = pool) {
    const [rows] = await connection.query(
      'SELECT id, code, status FROM cabinet WHERE code = ? LIMIT 1',
      [locker.cabinetCode]
    );

    return rows[0] || null;
  }

  async function getActiveOrder(connection = pool) {
    const [rows] = await connection.query(
      `SELECT
        id,
        phone,
        pickup_code AS pickupCode,
        status,
        create_time AS createTime,
        update_time AS updateTime
      FROM parcel_order
      WHERE status IN (?, ?)
      ORDER BY id DESC
      LIMIT 1`,
      [orderStatus.pendingStore, orderStatus.pendingPickup]
    );

    return formatOrder(rows[0]);
  }

  async function getActiveOrderForUpdate(connection) {
    const [rows] = await connection.query(
      `SELECT
        id,
        phone,
        pickup_code AS pickupCode,
        status,
        create_time AS createTime,
        update_time AS updateTime
      FROM parcel_order
      WHERE status IN (?, ?)
      ORDER BY id DESC
      LIMIT 1
      FOR UPDATE`,
      [orderStatus.pendingStore, orderStatus.pendingPickup]
    );

    return formatOrder(rows[0]);
  }

  async function getOrderByCodeForUpdate(connection, pickupCode) {
    const [rows] = await connection.query(
      `SELECT
        id,
        phone,
        pickup_code AS pickupCode,
        status,
        create_time AS createTime,
        update_time AS updateTime
      FROM parcel_order
      WHERE pickup_code = ?
      ORDER BY id DESC
      LIMIT 1
      FOR UPDATE`,
      [pickupCode]
    );

    return formatOrder(rows[0]);
  }

  async function getLatestOrderByCode(pickupCode, connection = pool) {
    const [rows] = await connection.query(
      `SELECT
        id,
        phone,
        pickup_code AS pickupCode,
        status,
        create_time AS createTime,
        update_time AS updateTime
      FROM parcel_order
      WHERE pickup_code = ?
      ORDER BY id DESC
      LIMIT 1`,
      [pickupCode]
    );

    return formatOrder(rows[0]);
  }

  async function getOrderForPhone(phone, connection = pool) {
    const [rows] = await connection.query(
      `SELECT
        id,
        phone,
        pickup_code AS pickupCode,
        status,
        create_time AS createTime,
        update_time AS updateTime
      FROM parcel_order
      WHERE phone = ?
        AND status IN (?, ?)
      ORDER BY id DESC
      LIMIT 1`,
      [phone, orderStatus.pendingStore, orderStatus.pendingPickup]
    );

    return formatOrder(rows[0]);
  }

  async function getOrderSummary(connection = pool) {
    const [rows] = await connection.query(
      `SELECT
        COUNT(*) AS totalCount,
        COALESCE(SUM(CASE WHEN status = ? THEN 1 ELSE 0 END), 0) AS pendingStoreCount,
        COALESCE(SUM(CASE WHEN status = ? THEN 1 ELSE 0 END), 0) AS pendingPickupCount,
        COALESCE(SUM(CASE WHEN status = ? THEN 1 ELSE 0 END), 0) AS pickedUpCount,
        COALESCE(SUM(CASE WHEN DATE(create_time) = CURRENT_DATE THEN 1 ELSE 0 END), 0) AS todayCount
      FROM parcel_order`,
      [orderStatus.pendingStore, orderStatus.pendingPickup, orderStatus.pickedUp]
    );

    const summary = rows[0] || {};

    return {
      totalCount: Number(summary.totalCount || 0),
      pendingStoreCount: Number(summary.pendingStoreCount || 0),
      pendingPickupCount: Number(summary.pendingPickupCount || 0),
      pickedUpCount: Number(summary.pickedUpCount || 0),
      todayCount: Number(summary.todayCount || 0)
    };
  }

  async function getLogSummary(connection = pool) {
    const [rows] = await connection.query(
      `SELECT
        COUNT(*) AS totalCount,
        COALESCE(SUM(CASE WHEN type = ? THEN 1 ELSE 0 END), 0) AS createCount,
        COALESCE(SUM(CASE WHEN type = ? THEN 1 ELSE 0 END), 0) AS confirmCount,
        COALESCE(SUM(CASE WHEN type = ? THEN 1 ELSE 0 END), 0) AS openCount,
        COALESCE(SUM(CASE WHEN type = ? THEN 1 ELSE 0 END), 0) AS failCount
      FROM device_log`,
      [logType.create, logType.confirm, logType.open, logType.fail]
    );

    const summary = rows[0] || {};

    return {
      totalCount: Number(summary.totalCount || 0),
      createCount: Number(summary.createCount || 0),
      confirmCount: Number(summary.confirmCount || 0),
      openCount: Number(summary.openCount || 0),
      failCount: Number(summary.failCount || 0)
    };
  }

  async function getRecentLogs(limit = locker.defaultLogLimit, connection = pool) {
    const [rows] = await connection.query(
      `SELECT
        l.id,
        l.order_id AS orderId,
        l.type,
        l.create_time AS createTime,
        o.phone,
        o.pickup_code AS pickupCode,
        o.status
      FROM device_log l
      LEFT JOIN parcel_order o ON o.id = l.order_id
      ORDER BY l.id DESC
      LIMIT ?`,
      [clampRecordLimit(limit)]
    );

    return rows.map(formatLog);
  }

  async function getRecentOrders(limit = locker.defaultLogLimit, connection = pool) {
    const [rows] = await connection.query(
      `SELECT
        id,
        phone,
        pickup_code AS pickupCode,
        status,
        create_time AS createTime,
        update_time AS updateTime
      FROM parcel_order
      ORDER BY id DESC
      LIMIT ?`,
      [clampRecordLimit(limit)]
    );

    return rows.map(formatOrder);
  }

  async function ensureCabinetAvailableForStore(connection) {
    const [cabinetRows] = await connection.query(
      'SELECT id, code, status FROM cabinet WHERE code = ? LIMIT 1 FOR UPDATE',
      [locker.cabinetCode]
    );

    const cabinet = cabinetRows[0];

    if (!cabinet || Number(cabinet.status) !== 1) {
      throw new AppError(409, messages.cabinetFault);
    }

    const activeOrder = await getActiveOrderForUpdate(connection);

    if (activeOrder) {
      throw new AppError(409, messages.cabinetOccupied);
    }

    return cabinet;
  }

  async function resolvePendingStoreOrder(connection, pickupCode) {
    if (pickupCode) {
      const order = await getOrderByCodeForUpdate(connection, pickupCode);
      if (order && order.status === orderStatus.pendingStore) {
        return order;
      }
      return null;
    }

    const activeOrder = await getActiveOrderForUpdate(connection);
    if (activeOrder && activeOrder.status === orderStatus.pendingStore) {
      return activeOrder;
    }

    return null;
  }

  async function getCabinetState(connection = pool) {
    const [cabinet, activeOrder] = await Promise.all([
      getCabinetRow(connection),
      getActiveOrder(connection)
    ]);

    return buildCabinetState(cabinet, activeOrder);
  }

  return {
    async getSystemStatus() {
      const [cabinet, summary, logSummary] = await Promise.all([
        getCabinetState(),
        getOrderSummary(),
        getLogSummary()
      ]);

      return {
        database: DB_CONFIG.database,
        databaseHost: DB_CONFIG.host,
        cabinet,
        summary,
        logSummary
      };
    },

    async getDashboard(limit = 6) {
      const [cabinet, summary, recentRecords] = await Promise.all([
        getCabinetState(),
        getOrderSummary(),
        getRecentLogs(limit)
      ]);

      return {
        projectName: '单柜快递柜毕业设计 Demo',
        cabinet,
        summary,
        recentRecords,
        flow: [
          '用户在小程序输入手机号发起存件。',
          '后端生成 parcel_order 订单和 6 位取件码，状态为待确认存件。',
          '用户确认存件后，订单状态更新为待取件。',
          '用户可通过手机号查询是否存在待取件订单。',
          '用户在柜体输入取件码，后端校验成功后开锁并把订单更新为已取件。',
          '整个流程不删数据，只通过状态字段追踪业务进度。'
        ]
      };
    },

    async getCabinetStatus() {
      return getCabinetState();
    },

    async listParcels(limit) {
      return getRecentOrders(limit);
    },

    async listRecords(limit) {
      const [summary, records] = await Promise.all([
        getLogSummary(),
        getRecentLogs(limit)
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
        await ensureCabinetAvailableForStore(connection);

        const pickupCode = await generateUniquePickupCode(connection);
        const [result] = await connection.query(
          'INSERT INTO parcel_order (phone, pickup_code, status) VALUES (?, ?, ?)',
          [phone, pickupCode, orderStatus.pendingStore]
        );

        const [rows] = await connection.query(
          `SELECT
            id,
            phone,
            pickup_code AS pickupCode,
            status,
            create_time AS createTime,
            update_time AS updateTime
          FROM parcel_order
          WHERE id = ?`,
          [result.insertId]
        );

        const order = formatOrder(rows[0]);
        await createLog(connection, logType.create, order.id);
        await connection.commit();

        return {
          ...order,
          cabinetCode: locker.cabinetCode,
          cabinetNo: locker.cabinetCode,
          cabinetStatus: 'pending_store',
          openDoor: true,
          nextAction: 'confirm_store',
          confirmEndpoint: '/api/parcels/store/confirm',
          instruction: '订单已创建，请放入快递后按确认键完成存件。',
          ...buildOpenCommand()
        };
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },

    async confirmStoreByPickupCode(codeInput) {
      const pickupCode = codeInput ? normalizePickupCode(codeInput) : '';

      if (pickupCode && !/^\d{6}$/.test(pickupCode)) {
        throw new AppError(400, messages.invalidPickupCode);
      }

      const connection = await pool.getConnection();

      try {
        await connection.beginTransaction();

        const order = await resolvePendingStoreOrder(connection, pickupCode);

        if (!order) {
          throw new AppError(404, messages.storeConfirmNotFound);
        }

        await connection.query(
          'UPDATE parcel_order SET status = ?, update_time = NOW() WHERE id = ?',
          [orderStatus.pendingPickup, order.id]
        );

        await createLog(connection, logType.confirm, order.id);
        await connection.commit();

        return {
          ...order,
          status: orderStatus.pendingPickup,
          statusText: '待取件',
          cabinetCode: locker.cabinetCode,
          cabinetNo: locker.cabinetCode,
          cabinetStatus: 'pending_pickup',
          message: '存件确认成功，订单已进入待取件状态。'
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

      const order = await getOrderForPhone(phone);

      if (!order) {
        throw new AppError(404, messages.parcelNotFoundByPhone);
      }

      if (order.status === orderStatus.pendingStore) {
        throw new AppError(409, messages.cabinetNotReadyForPickup);
      }

        return {
          ...order,
          cabinetCode: locker.cabinetCode,
          cabinetNo: locker.cabinetCode,
          cabinetStatus: 'pending_pickup',
          pickupStage: 'keyboard_verification',
          instruction: '请前往柜体输入 6 位取件码，校验成功后即可开锁取件。',
          verifyEndpoint: '/api/parcels/verify-pickup',
          hardwareEndpoint: '/api/parcels/verify-pickup'
        };
    },

    async verifyAndOpenByPickupCode(codeInput, options = {}) {
      const pickupCode = normalizePickupCode(codeInput);
      const source = options.source || 'hardware';

      if (!/^\d{6}$/.test(pickupCode)) {
        await createFailLog();
        throw new AppError(400, messages.invalidPickupCode);
      }

      const connection = await pool.getConnection();

      try {
        await connection.beginTransaction();

        const order = await getOrderByCodeForUpdate(connection, pickupCode);

        if (!order) {
          throw new AppError(404, messages.parcelNotFoundByCode);
        }

        if (order.status === orderStatus.pendingStore) {
          throw new AppError(409, messages.cabinetNotReadyForPickup);
        }

        if (order.status === orderStatus.pickedUp) {
          throw new AppError(409, messages.parcelAlreadyPickedUp);
        }

        await connection.query(
          'UPDATE parcel_order SET status = ?, update_time = NOW() WHERE id = ?',
          [orderStatus.pickedUp, order.id]
        );

        await createLog(connection, logType.open, order.id);
        await connection.commit();

        return {
          openDoor: true,
          completed: true,
          cabinetCode: locker.cabinetCode,
          cabinetNo: locker.cabinetCode,
          cabinetStatus: 'idle',
          phone: order.phone,
          maskedPhone: order.maskedPhone,
          pickupCode: order.pickupCode,
          status: orderStatus.pickedUp,
          statusText: '已取件',
          verifySource: source,
          message: '取件成功，订单已更新为已取件。',
          ...buildOpenCommand()
        };
      } catch (error) {
        await connection.rollback();

        if (error instanceof AppError) {
          const latestOrder = await getLatestOrderByCode(pickupCode).catch(() => null);
          await createFailLog(latestOrder ? latestOrder.id : null).catch(() => {});
        }

        throw error;
      } finally {
        connection.release();
      }
    },

    async confirmPickupByPickupCode(codeInput) {
      const pickupCode = normalizePickupCode(codeInput);

      if (!/^\d{6}$/.test(pickupCode)) {
        throw new AppError(400, messages.invalidPickupCode);
      }

      const order = await getLatestOrderByCode(pickupCode);

      if (!order) {
        throw new AppError(404, messages.pickupConfirmNotFound);
      }

      if (order.status !== orderStatus.pickedUp) {
        throw new AppError(409, messages.pickupConfirmNotFound);
      }

      return {
        completed: true,
        cabinetCode: locker.cabinetCode,
        cabinetNo: locker.cabinetCode,
        cabinetStatus: 'idle',
        phone: order.phone,
        maskedPhone: order.maskedPhone,
        pickupCode: order.pickupCode,
        status: order.status,
        statusText: order.statusText,
        message: '订单已是已取件状态，无需重复确认。'
      };
    },

    async close() {
      await closeDatabase();
    }
  };
}

module.exports = createLockerService;
