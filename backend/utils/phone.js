function normalizePhone(phone) {
  return String(phone || '').trim().replace(/^\+?86/, '');
}

function isValidPhone(phone) {
  return /^1[3-9]\d{9}$/.test(phone);
}

function maskPhone(phoneInput) {
  const phone = normalizePhone(phoneInput);

  if (!/^\d{11}$/.test(phone)) {
    return phone;
  }

  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

module.exports = {
  normalizePhone,
  isValidPhone,
  maskPhone
};
