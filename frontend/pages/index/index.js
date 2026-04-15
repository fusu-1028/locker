const api = require('../../utils/api.js')
const util = require('../../utils/util.js')

function decorateCabinet(cabinet) {
  const parcel = cabinet && cabinet.parcel ? cabinet.parcel : null
  const status = cabinet && cabinet.status ? cabinet.status : 'idle'

  return {
    cabinetNo: cabinet && cabinet.cabinetNo ? cabinet.cabinetNo : 1,
    status,
    statusText: util.formatCabinetStatus(status),
    statusClass: status === 'occupied' ? 'occupied' : 'idle',
    hasParcel: !!parcel,
    parcel: parcel ? {
      phone: parcel.phone,
      maskedPhone: parcel.maskedPhone || util.maskPhone(parcel.phone),
      pickupCode: parcel.pickupCode,
      createdAtText: util.formatServerTime(parcel.createdAt)
    } : null
  }
}

function decorateRecord(record) {
  const action = record && record.action ? record.action : 'store'

  return {
    id: record.id,
    action,
    actionText: record.actionText || util.formatActionText(action),
    actionClass: action === 'pickup' ? 'pickup' : 'store',
    maskedPhone: record.maskedPhone || util.maskPhone(record.phone),
    pickupCode: record.pickupCode,
    cabinetNo: record.cabinetNo,
    note: record.note,
    createdAtText: util.formatServerTime(record.createdAt)
  }
}

Page({
  data: {
    loading: true,
    errorMessage: '',
    cabinet: decorateCabinet({}),
    summaryCards: [],
    recentRecords: [],
    flowSteps: [],
    apiBaseUrl: api.getBaseUrl(),
    refreshedAt: '--'
  },

  onShow() {
    this.loadDashboard()
  },

  onPullDownRefresh() {
    this.loadDashboard(true)
  },

  async loadDashboard(fromPullDown) {
    this.setData({
      loading: true,
      errorMessage: '',
      apiBaseUrl: api.getBaseUrl()
    })

    try {
      const response = await api.getDashboard()
      const dashboard = response.data || {}
      const cabinet = decorateCabinet(dashboard.cabinet || {})
      const summary = dashboard.summary || {}

      this.setData({
        cabinet,
        summaryCards: [
          { label: '柜门编号', value: `0${cabinet.cabinetNo}`, accent: 'navy' },
          { label: '当前状态', value: cabinet.statusText, accent: cabinet.status === 'occupied' ? 'orange' : 'teal' },
          { label: '累计存件', value: `${summary.storeCount || 0}`, accent: 'navy' },
          { label: '累计取件', value: `${summary.pickupCount || 0}`, accent: 'teal' }
        ],
        recentRecords: (dashboard.recentRecords || []).map(decorateRecord),
        flowSteps: dashboard.flow || [],
        refreshedAt: util.formatTime(new Date())
      })
    } catch (error) {
      this.setData({
        errorMessage: error.message || '看板数据加载失败，请检查后端服务是否已启动。'
      })
    } finally {
      this.setData({ loading: false })

      if (fromPullDown) {
        wx.stopPullDownRefresh()
      }
    }
  },

  goStore() {
    wx.navigateTo({
      url: '/pages/store/store'
    })
  },

  goTake() {
    wx.navigateTo({
      url: '/pages/take/take'
    })
  },

  goRecords() {
    wx.navigateTo({
      url: '/pages/records/records'
    })
  }
})
