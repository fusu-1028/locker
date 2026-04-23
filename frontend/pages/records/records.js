const api = require('../../utils/api.js')
const util = require('../../utils/util.js')

function decorateRecord(record) {
  const type = record && record.type ? record.type : 'CREATE'
  const orderStatusText = record.orderStatus
    ? util.formatOrderStatusText(record.orderStatus)
    : (record.orderStatusText || '--')

  return {
    id: record.id,
    actionText: util.formatActionText(type),
    actionClass: type === 'FAIL' ? 'warning' : type === 'OPEN' ? 'pickup' : 'store',
    maskedPhone: record.maskedPhone || util.maskPhone(record.phone),
    pickupCode: record.pickupCode || '--',
    cabinetNo: record.cabinetCode || record.cabinetNo || 'CAB001',
    sourceText: orderStatusText ? `订单状态：${orderStatusText}` : '订单状态：--',
    sourceClass: type === 'FAIL' ? 'warning' : type === 'OPEN' ? 'pickup' : 'store',
    note: record.message || '系统已记录本次业务操作。',
    createdAtText: util.formatServerTime(record.createTime || record.createdAt)
  }
}

Page({
  data: {
    loading: true,
    errorMessage: '',
    records: [],
    summaryCards: []
  },

  onShow() {
    this.loadRecords()
  },

  onPullDownRefresh() {
    this.loadRecords(true)
  },

  async loadRecords(fromPullDown) {
    this.setData({
      loading: true
    })

    try {
      const response = await api.listRecords(20)
      const payload = response.data || {}
      const summary = payload.summary || {}

      this.setData({
        errorMessage: '',
        records: (payload.records || []).map(decorateRecord),
        summaryCards: [
          { label: '记录总数', value: `${summary.totalCount || 0}`, accent: 'navy' },
          { label: '创建订单', value: `${summary.createCount || 0}`, accent: 'orange' },
          { label: '存件完成', value: `${summary.confirmCount || 0}`, accent: 'teal' },
          { label: '取件完成', value: `${summary.openCount || 0}`, accent: 'navy' }
        ]
      })
    } catch (error) {
      this.setData({
        errorMessage: error.message || '记录加载失败，请稍后重试。'
      })
    } finally {
      this.setData({
        loading: false
      })

      if (fromPullDown) {
        wx.stopPullDownRefresh()
      }
    }
  }
})
