const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '.env'), quiet: true });

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

module.exports = {
  server,
  database
};
