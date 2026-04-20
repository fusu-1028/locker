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
  corsOrigin: pickEnv(process.env.CORS_ORIGIN, process.env.ALLOWED_ORIGIN) || '*',
  publicBaseUrl:
    pickEnv(process.env.PUBLIC_BASE_URL, process.env.SERVER_PUBLIC_BASE_URL) ||
    `http://${pickEnv(process.env.PUBLIC_HOST, process.env.SERVER_PUBLIC_HOST) || '127.0.0.1'}:${parseInteger(process.env.PORT, 3000)}`
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
  cabinetCode: 'CAB001',
  defaultLogLimit: 20,
  relayPulseMs: 800
};

const orderStatus = {
  pendingStore: 1,
  pendingPickup: 2,
  pickedUp: 3
};

const logType = {
  create: 'CREATE',
  confirm: 'CONFIRM',
  open: 'OPEN',
  fail: 'FAIL'
};

const messages = {
  invalidPhone: '请输入有效的 11 位手机号。',
  invalidPickupCode: '请输入有效的 6 位取件码。',
  cabinetFault: '当前柜体故障，暂时无法使用。',
  cabinetOccupied: '当前柜体已有未完成订单，请先完成现有流程。',
  cabinetNotReadyForPickup: '该订单仍处于待确认存件状态，暂时不能取件。',
  storeConfirmNotFound: '未找到待确认存件的订单，请先发起存件。',
  pickupConfirmNotFound: '未找到可处理的取件订单。',
  pickupCodeGenerationFailed: '取件码生成失败，请稍后重试。',
  parcelNotFoundByPhone: '未查询到该手机号对应的待取件订单。',
  parcelNotFoundByCode: '取件码不存在或已失效。',
  parcelAlreadyPickedUp: '该订单已取件，请勿重复操作。',
  healthOk: '智能快递柜服务运行正常。',
  dashboardOk: '看板数据加载成功。',
  cabinetOk: '柜体状态加载成功。',
  parcelListOk: '订单数据加载成功。',
  recordsOk: '设备日志加载成功。',
  storeOk: '存件请求已受理，请完成存件确认。',
  storeConfirmOk: '存件确认成功，订单已进入待取件状态。',
  takeOk: '已查询到待取件订单，请在柜体上输入取件码。',
  verifyOk: '取件码校验成功，柜门已打开，订单已更新为已取件。',
  hardwareVerifyOk: '硬件校验成功，已返回开锁指令并完成取件。',
  pickupConfirmOk: '订单当前状态已是已取件。',
  serverError: '服务器内部错误，请稍后重试。'
};

module.exports = {
  server,
  database,
  locker,
  orderStatus,
  logType,
  messages
};
