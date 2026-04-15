const { locker } = require('../config');
const { maskPhone } = require('./phone');

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
    cabinetNo: locker.cabinetNo,
    status: hasPendingParcel ? 'occupied' : 'idle',
    statusText: hasPendingParcel ? '使用中' : '空闲待用',
    hasPendingParcel,
    parcel
  };
}

module.exports = {
  formatParcel,
  formatRecord,
  buildCabinetState
};
