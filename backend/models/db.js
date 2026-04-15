const mysql = require('mysql2/promise');
const { database: DB_CONFIG } = require('../config');
const {
  escapeIdentifier,
  logInfo,
  logWarn,
  wrapStartupError
} = require('../utils/common');

let pool = null;

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

    await nextPool.query(`
      CREATE TABLE IF NOT EXISTS parcels (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        phone VARCHAR(20) NOT NULL COMMENT 'User phone number',
        pickup_code CHAR(6) NOT NULL UNIQUE COMMENT '6-digit pickup code',
        cabinet_no TINYINT UNSIGNED NOT NULL DEFAULT 1 UNIQUE COMMENT 'Cabinet number',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Current parcels waiting for pickup'
    `);

    await nextPool.query(`
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
