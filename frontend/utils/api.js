const DEFAULT_BASE_URL = 'http://127.0.0.1:3000'

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/+$/, '')
}

function getBaseUrl() {
  let app = null

  try {
    app = getApp()
  } catch (error) {
    app = null
  }

  const appBaseUrl = app && app.globalData ? app.globalData.apiBaseUrl : ''
  const storedBaseUrl = wx.getStorageSync('lockerApiBaseUrl')

  return normalizeBaseUrl(appBaseUrl || storedBaseUrl || DEFAULT_BASE_URL)
}

function setBaseUrl(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl)
  wx.setStorageSync('lockerApiBaseUrl', normalized)

  const app = getApp()
  if (app && app.globalData) {
    app.globalData.apiBaseUrl = normalized
  }
}

function request(options) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${getBaseUrl()}${options.url}`,
      method: options.method || 'GET',
      data: options.data,
      timeout: 10000,
      header: {
        'content-type': 'application/json'
      },
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data)
          return
        }

        const message = response.data && response.data.message
          ? response.data.message
          : '请求失败，请稍后重试。'

        reject(new Error(message))
      },
      fail() {
        reject(new Error('无法连接到后端服务，请先启动 Node.js 服务并确认接口地址可访问。'))
      }
    })
  })
}

function getDashboard(limit) {
  const suffix = limit ? `?limit=${limit}` : ''
  return request({
    url: `/api/dashboard${suffix}`
  })
}

function getCabinetStatus() {
  return request({
    url: '/api/cabinet'
  })
}

function listRecords(limit) {
  const suffix = limit ? `?limit=${limit}` : ''
  return request({
    url: `/api/records${suffix}`
  })
}

function storeParcel(phone) {
  return request({
    url: '/api/parcels/store',
    method: 'POST',
    data: {
      phone
    }
  })
}

function preparePickup(phone) {
  return request({
    url: '/api/parcels/take',
    method: 'POST',
    data: {
      phone
    }
  })
}

function verifyPickup(pickupCode, useHardwareRoute) {
  return request({
    url: useHardwareRoute ? '/api/hardware/verify-pickup' : '/api/parcels/verify-pickup',
    method: 'POST',
    data: {
      pickupCode
    }
  })
}

module.exports = {
  DEFAULT_BASE_URL,
  getBaseUrl,
  setBaseUrl,
  request,
  getDashboard,
  getCabinetStatus,
  listRecords,
  storeParcel,
  preparePickup,
  verifyPickup
}
