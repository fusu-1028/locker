const { locker, orderStatus, logType } = require('../config');
const { maskPhone } = require('./phone');

const cabinetBusinessStatusTextMap = {
  idle: '空闲',
  pending_store: '待确认存件',
  pending_pickup: '待取件',
  fault: '故障'
};

const orderStatusTextMap = {
  [orderStatus.pendingStore]: '待确认存件',
  [orderStatus.pendingPickup]: '待取件',
  [orderStatus.pickedUp]: '已取件'
};

const logTypeTextMap = {
  [logType.create]: '创建订单',
  [logType.confirm]: '确认存件',
  [logType.open]: '开锁取件',
  [logType.fail]: '校验失败'
};

const logMessageMap = {
  [logType.create]: '用户提交手机号，系统已生成订单和取件码。',
  [logType.confirm]: '硬件确认存件完成，订单已进入待取件状态。',
  [logType.open]: '取件码校验成功，柜门已打开，订单已更新为已取件。',
  [logType.fail]: '设备操作失败，请检查当前状态或取件码。'
};

function formatOrder(row) {
  if (!row) {
    return null;
  }

  const status = Number(row.status);

  return {
    id: row.id,
    phone: row.phone,
    maskedPhone: maskPhone(row.phone),
    pickupCode: row.pickupCode || row.pickup_code,
    status,
    statusText: orderStatusTextMap[status] || String(status),
    createTime: row.createTime || row.create_time,
    updateTime: row.updateTime || row.update_time
  };
}

function formatLog(row) {
  if (!row) {
    return null;
  }

  const type = row.type;
  const status = row.status === undefined || row.status === null ? null : Number(row.status);

  return {
    id: row.id,
    orderId: row.orderId || row.order_id || null,
    type,
    typeText: logTypeTextMap[type] || type,
    phone: row.phone || '',
    maskedPhone: row.phone ? maskPhone(row.phone) : '--',
    pickupCode: row.pickupCode || row.pickup_code || '--',
    orderStatus: status,
    orderStatusText: status ? (orderStatusTextMap[status] || String(status)) : '--',
    message: logMessageMap[type] || '设备产生了一条新的业务日志。',
    createTime: row.createTime || row.create_time
  };
}

function buildCabinetState(cabinetRow, activeOrder) {
  const deviceStatus = cabinetRow ? Number(cabinetRow.status) : 1;
  let businessStatus = 'idle';

  if (deviceStatus !== 1) {
    businessStatus = 'fault';
  } else if (activeOrder && activeOrder.status === orderStatus.pendingStore) {
    businessStatus = 'pending_store';
  } else if (activeOrder && activeOrder.status === orderStatus.pendingPickup) {
    businessStatus = 'pending_pickup';
  }

  return {
    code: cabinetRow && cabinetRow.code ? cabinetRow.code : locker.cabinetCode,
    cabinetCode: cabinetRow && cabinetRow.code ? cabinetRow.code : locker.cabinetCode,
    cabinetNo: cabinetRow && cabinetRow.code ? cabinetRow.code : locker.cabinetCode,
    deviceStatus,
    deviceStatusText: deviceStatus === 1 ? '正常' : '故障',
    status: businessStatus,
    statusText: cabinetBusinessStatusTextMap[businessStatus] || businessStatus,
    hasActiveOrder: Boolean(activeOrder),
    parcel: activeOrder || null,
    order: activeOrder || null
  };
}

module.exports = {
  formatOrder,
  formatLog,
  buildCabinetState
};
