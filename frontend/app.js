const { API_BASE_URL } = require('./config')

App({
  onLaunch() {
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)
  },
  globalData: {
    apiBaseUrl: wx.getStorageSync('lockerApiBaseUrl') || API_BASE_URL,
    projectName: '智能快递柜',
    cabinetName: '1号智能柜'
  }
})
