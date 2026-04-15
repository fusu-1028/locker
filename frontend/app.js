App({
  onLaunch() {
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)
  },
  globalData: {
    apiBaseUrl: wx.getStorageSync('lockerApiBaseUrl') || 'http://127.0.0.1:3000',
    projectName: '智享快递柜',
    cabinetName: '1号智能柜'
  }
})
