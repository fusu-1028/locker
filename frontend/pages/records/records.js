const api = require('../../utils/api.js')
const util = require('../../utils/util.js')

function decorateRecord(record) {
  const type = record && record.type ? record.type : 'CREATE'

  return {
    id: record.id,
    actionText: record.typeText || util.formatActionText(type),
    actionClass: type === 'OPEN' ? 'pickup' : type === 'FAIL' ? 'pickup' : 'store',
    maskedPhone: record.maskedPhone || util.maskPhone(record.phone),
    pickupCode: record.pickupCode || '--',
    cabinetNo: 'CAB001',
    sourceText: record.orderStatusText ? `订单状态：${record.orderStatusText}` : '订单状态：--',
    sourceClass: type === 'FAIL' ? 'debug' : type === 'OPEN' ? 'pickup' : 'store',
    note: record.message || '设备日志已记录。',
    createdAtText: util.formatServerTime(record.createTime || record.createdAt)
  }
}

Page({
  data: {
    loading: true,
    errorMessage: '',
    records: [],
    summaryCards: [],
    apiBaseUrl: api.getBaseUrl()
  },

  onShow() {
    this.loadRecords()
  },

  onPullDownRefresh() {
    this.loadRecords(true)
  },

  async loadRecords(fromPullDown) {
    this.setData({
      loading: true,
      apiBaseUrl: api.getBaseUrl()
    })

    try {
      const response = await api.listRecords(20)
      const payload = response.data || {}
      const summary = payload.summary || {}

      this.setData({
        errorMessage: '',
        records: (payload.records || []).map(decorateRecord),
        summaryCards: [
          { label: '日志总数', value: `${summary.totalCount || 0}`, accent: 'navy' },
          { label: '创建订单', value: `${summary.createCount || 0}`, accent: 'orange' },
          { label: '确认存件', value: `${summary.confirmCount || 0}`, accent: 'teal' },
          { label: '开锁取件', value: `${summary.openCount || 0}`, accent: 'navy' }
        ]
      })
    } catch (error) {
      this.setData({
        errorMessage: error.message || '设备日志加载失败。'
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
