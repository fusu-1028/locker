const api = require('../../utils/api.js')
const util = require('../../utils/util.js')

function getCabinetClass(status) {
  return status === 'idle' ? 'idle' : 'occupied'
}

function decorateCabinet(cabinet) {
  const order = cabinet && (cabinet.order || cabinet.parcel) ? (cabinet.order || cabinet.parcel) : null
  const status = cabinet && cabinet.status ? cabinet.status : 'idle'
  const cabinetCode = cabinet && (cabinet.cabinetCode || cabinet.code || cabinet.cabinetNo)
    ? (cabinet.cabinetCode || cabinet.code || cabinet.cabinetNo)
    : 'CAB001'

  return {
    cabinetNo: cabinetCode,
    status,
    statusText: util.formatCabinetStatus(status),
    statusClass: getCabinetClass(status),
    hasParcel: !!order,
    parcel: order ? {
      phone: order.phone,
      maskedPhone: order.maskedPhone || util.maskPhone(order.phone),
      pickupCode: order.pickupCode,
      statusText: order.statusText || util.formatOrderStatusText(order.status),
      createdAtText: util.formatServerTime(order.createTime || order.createdAt)
    } : null
  }
}

function decorateRecord(record) {
  const type = record && record.type ? record.type : 'CREATE'

  return {
    id: record.id,
    action: type,
    actionText: record.typeText || util.formatActionText(type),
    actionClass: type === 'OPEN' ? 'pickup' : type === 'FAIL' ? 'pickup' : 'store',
    maskedPhone: record.maskedPhone || util.maskPhone(record.phone),
    pickupCode: record.pickupCode,
    cabinetNo: 'CAB001',
    note: record.message,
    createdAtText: util.formatServerTime(record.createTime || record.createdAt)
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
          { label: '柜体编号', value: `${cabinet.cabinetNo}`, accent: 'navy' },
          { label: '当前状态', value: cabinet.statusText, accent: cabinet.status === 'idle' ? 'teal' : 'orange' },
          { label: '待确认存件', value: `${summary.pendingStoreCount || 0}`, accent: 'navy' },
          { label: '待取件', value: `${summary.pendingPickupCount || 0}`, accent: 'teal' }
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
