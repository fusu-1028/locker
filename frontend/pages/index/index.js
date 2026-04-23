const api = require('../../utils/api.js')
const util = require('../../utils/util.js')

const HOME_FLOW_STEPS = [
  '存件时请输入收件手机号，系统会生成对应取件码。',
  '提交存件申请后，柜门会打开，请放入物品并关闭柜门。',
  '存件完成后，订单将进入待取件状态。',
  '取件时请输入手机号查询待取件订单信息。',
  '请前往柜机输入 6 位取件码，核验成功后即可开锁取件。'
]

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
      pickupCode: order.pickupCode || '--',
      statusText: util.formatOrderStatusText(order.status),
      createdAtText: util.formatServerTime(order.createTime || order.createdAt)
    } : null
  }
}

function decorateRecord(record) {
  const type = record && record.type ? record.type : 'CREATE'

  return {
    id: record.id,
    action: type,
    actionText: util.formatActionText(type),
    actionClass: type === 'FAIL' ? 'warning' : type === 'OPEN' ? 'pickup' : 'store',
    maskedPhone: record.maskedPhone || util.maskPhone(record.phone),
    pickupCode: record.pickupCode || '--',
    cabinetNo: record.cabinetCode || record.cabinetNo || 'CAB001',
    note: record.message || '系统已记录本次业务操作。',
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
    flowSteps: HOME_FLOW_STEPS,
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
      errorMessage: ''
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
          { label: '待完成存件', value: `${summary.pendingStoreCount || 0}`, accent: 'navy' },
          { label: '待取件', value: `${summary.pendingPickupCount || 0}`, accent: 'teal' }
        ],
        recentRecords: (dashboard.recentRecords || []).map(decorateRecord),
        flowSteps: HOME_FLOW_STEPS,
        refreshedAt: util.formatTime(new Date())
      })
    } catch (error) {
      this.setData({
        errorMessage: error.message || '页面数据加载失败，请稍后重试。'
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
