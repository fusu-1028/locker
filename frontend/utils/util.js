const formatTime = date => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()

  return `${[year, month, day].map(formatNumber).join('/')} ${[hour, minute, second].map(formatNumber).join(':')}`
}

const formatNumber = n => {
  n = n.toString()
  return n[1] ? n : `0${n}`
}

const formatServerTime = value => {
  if (!value) {
    return '--'
  }

  if (value instanceof Date) {
    return formatTime(value)
  }

  if (typeof value !== 'string') {
    return String(value)
  }

  const parts = value.split(' ')
  const datePart = parts[0]
  const timePart = parts[1] || '00:00:00'

  if (!datePart) {
    return value
  }

  const dateSegments = datePart.split('-').map(Number)
  const timeSegments = timePart.split(':').map(Number)

  if (dateSegments.length !== 3 || Number.isNaN(dateSegments[0])) {
    return value
  }

  const parsedDate = new Date(
    dateSegments[0],
    dateSegments[1] - 1,
    dateSegments[2],
    timeSegments[0] || 0,
    timeSegments[1] || 0,
    timeSegments[2] || 0
  )

  if (Number.isNaN(parsedDate.getTime())) {
    return value
  }

  return formatTime(parsedDate)
}

const maskPhone = phone => {
  const normalized = String(phone || '').replace(/\D/g, '')

  if (normalized.length !== 11) {
    return String(phone || '')
  }

  return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`
}

const formatCabinetStatus = status => {
  return status === 'occupied' ? '使用中' : '空闲待用'
}

const formatActionText = action => {
  return action === 'pickup' ? '取件开锁' : '存件完成'
}

const formatSourceText = source => {
  if (source === 'hardware') {
    return '硬件键盘'
  }

  if (source === 'debug') {
    return '调试模拟'
  }

  return '微信小程序'
}

module.exports = {
  formatTime,
  formatServerTime,
  maskPhone,
  formatCabinetStatus,
  formatActionText,
  formatSourceText
}
