const api = require('../../utils/api.js')
const util = require('../../utils/util.js')

function decorateRecord(record) {
  const action = record && record.action ? record.action : 'store'
  const source = record && record.source ? record.source : 'miniapp'

  return {
    id: record.id,
    actionText: record.actionText || util.formatActionText(action),
    actionClass: action === 'pickup' ? 'pickup' : 'store',
    maskedPhone: record.maskedPhone || util.maskPhone(record.phone),
    pickupCode: record.pickupCode,
    cabinetNo: record.cabinetNo,
    sourceText: util.formatSourceText(source),
    sourceClass: source === 'debug' ? 'debug' : action === 'pickup' ? 'pickup' : 'store',
    note: record.note,
    createdAtText: util.formatServerTime(record.createdAt)
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
          { label: '总流水数', value: `${summary.totalCount || 0}`, accent: 'navy' },
          { label: '累计存件', value: `${summary.storeCount || 0}`, accent: 'orange' },
          { label: '累计取件', value: `${summary.pickupCount || 0}`, accent: 'teal' },
          { label: '今日操作', value: `${summary.todayCount || 0}`, accent: 'navy' }
        ]
      })
    } catch (error) {
      this.setData({
        errorMessage: error.message || '操作记录加载失败。'
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
