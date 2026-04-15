const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

function pickEnv(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }

  return '';
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

const server = {
  host: pickEnv(process.env.HOST, process.env.SERVER_HOST) || '0.0.0.0',
  port: parseInteger(process.env.PORT, 3000),
  corsOrigin: pickEnv(process.env.CORS_ORIGIN, process.env.ALLOWED_ORIGIN) || '*'
};

const database = {
  host: pickEnv(process.env.DB_HOST, process.env.MYSQL_HOST) || '127.0.0.1',
  port: parseInteger(pickEnv(process.env.DB_PORT, process.env.MYSQL_PORT), 3306),
  user: pickEnv(process.env.DB_USER, process.env.MYSQL_USER) || 'locker_user',
  password: pickEnv(process.env.DB_PASSWORD, process.env.MYSQL_PASSWORD) || '123456',
  database: pickEnv(process.env.DB_NAME, process.env.MYSQL_DATABASE) || 'smart_locker',
  waitForConnections: true,
  connectionLimit: parseInteger(process.env.DB_CONNECTION_LIMIT, 10),
  queueLimit: 0,
  dateStrings: true
};

const locker = {
  cabinetNo: 1,
  defaultRecordLimit: 12
};

const messages = {
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

module.exports = {
  server,
  database,
  locker,
  messages
};
