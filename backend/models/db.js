const mysql = require('mysql2/promise');
const { database: DB_CONFIG, locker } = require('../config');
const { escapeIdentifier, logInfo, logWarn, wrapStartupError } = require('../utils/common');

let pool = null;

async function ensureCabinetSchema(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS cabinet (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(32) NOT NULL COMMENT '柜子编号',
      status TINYINT NOT NULL DEFAULT 1 COMMENT '柜子状态：1正常，0故障'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='柜子表'
  `);
}

async function ensureParcelOrderSchema(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS parcel_order (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      phone VARCHAR(20) NOT NULL COMMENT '用户手机号',
      pickup_code VARCHAR(20) NOT NULL COMMENT '取件码',
      status TINYINT NOT NULL DEFAULT 1 COMMENT '订单状态：1待确认存件，2待取件，3已取件',
      create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      INDEX idx_parcel_order_phone (phone),
      INDEX idx_parcel_order_pickup_code (pickup_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单表'
  `);
}

async function ensureDeviceLogSchema(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS device_log (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      order_id INT UNSIGNED NULL COMMENT '订单ID，可为空',
      type VARCHAR(20) NOT NULL COMMENT '操作类型，例如 CONFIRM / OPEN / FAIL',
      create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '时间'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='设备日志表'
  `);
}

async function ensureCabinetSeed(connection) {
  const [rows] = await connection.query(
    'SELECT id FROM cabinet WHERE code = ? LIMIT 1',
    [locker.cabinetCode]
  );

  if (rows.length === 0) {
    await connection.query(
      'INSERT INTO cabinet (code, status) VALUES (?, ?)',
      [locker.cabinetCode, 1]
    );
  }
}

async function initializeDatabase() {
  if (pool) {
    return pool;
  }

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
      throw wrapStartupError('Failed to connect to MySQL before initialization', error, {
        host: DB_CONFIG.host,
        port: DB_CONFIG.port
      });
    }
  } finally {
    if (adminConnection) {
      await adminConnection.end().catch(() => {});
    }
  }

  const nextPool = mysql.createPool(DB_CONFIG);

  try {
    await nextPool.query('SELECT 1');
    logInfo('MySQL connection established.');

    await ensureCabinetSchema(nextPool);
    await ensureParcelOrderSchema(nextPool);
    await ensureDeviceLogSchema(nextPool);
    await ensureCabinetSeed(nextPool);

    logInfo('MySQL tables ensured.');
    pool = nextPool;
    return pool;
  } catch (error) {
    await nextPool.end().catch(() => {});
    throw wrapStartupError(`Failed to initialize database ${DB_CONFIG.database}`, error, {
      host: DB_CONFIG.host,
      port: DB_CONFIG.port
    });
  }
}

function getPool() {
  if (!pool) {
    throw new Error('Database pool has not been initialized yet.');
  }

  return pool;
}

async function closeDatabase() {
  if (!pool) {
    return;
  }

  const currentPool = pool;
  pool = null;
  await currentPool.end();
}

module.exports = {
  initializeDatabase,
  getPool,
  closeDatabase
};
