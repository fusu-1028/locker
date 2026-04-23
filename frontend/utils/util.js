const formatNumber = n => {
  const value = String(n)
  return value[1] ? value : `0${value}`
}

const formatTime = date => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()

  return `${[year, month, day].map(formatNumber).join('/')} ${[hour, minute, second].map(formatNumber).join(':')}`
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
  const textMap = {
    idle: '空闲',
    pending_store: '待完成存件',
    pending_pickup: '待取件',
    fault: '故障'
  }

  return textMap[status] || status || '--'
}

const formatOrderStatusText = status => {
  const textMap = {
    1: '待完成存件',
    2: '待取件',
    3: '已取件'
  }

  return textMap[String(status)] || String(status || '--')
}

const formatActionText = action => {
  const textMap = {
    CREATE: '创建订单',
    CONFIRM: '存件完成',
    OPEN: '取件完成',
    FAIL: '处理失败'
  }

  return textMap[action] || action || '--'
}

const formatSourceText = source => {
  if (source === 'hardware') {
    return '柜机设备'
  }

  if (source === 'debug') {
    return '系统处理'
  }

  return '小程序'
}

module.exports = {
  formatNumber,
  formatTime,
  formatServerTime,
  maskPhone,
  formatCabinetStatus,
  formatOrderStatusText,
  formatActionText,
  formatSourceText
}
