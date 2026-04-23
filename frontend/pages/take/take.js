const api = require('../../utils/api.js')
const util = require('../../utils/util.js')

function decorateLookupResult(order) {
  return {
    phone: order.phone,
    maskedPhone: order.maskedPhone || util.maskPhone(order.phone),
    pickupCode: order.pickupCode || '--',
    cabinetNo: order.cabinetCode || order.cabinetNo || 'CAB001',
    statusText: util.formatOrderStatusText(order.status),
    createdAtText: util.formatServerTime(order.createTime || order.createdAt),
    instruction: order.instruction || '请前往柜机输入 6 位取件码，核验成功后即可开锁取件。'
  }
}

Page({
  data: {
    phone: '',
    lookupLoading: false,
    errorMessage: '',
    lookupResult: null
  },

  handlePhoneInput(event) {
    this.setData({
      phone: String(event.detail.value || '').replace(/\D/g, '').slice(0, 11)
    })
  },

  async submitLookup() {
    const phone = this.data.phone

    if (!/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({
        title: '请输入正确的手机号',
        icon: 'none'
      })
      return
    }

    this.setData({
      lookupLoading: true,
      errorMessage: '',
      lookupResult: null
    })

    try {
      const response = await api.preparePickup(phone)
      this.setData({
        lookupResult: decorateLookupResult(response.data || {}),
        phone: ''
      })
    } catch (error) {
      this.setData({
        lookupResult: null,
        errorMessage: error.message || '未找到该手机号对应的待取件订单。'
      })
    } finally {
      this.setData({
        lookupLoading: false
      })
    }
  },

  resetFlow() {
    this.setData({
      phone: '',
      lookupResult: null,
      errorMessage: ''
    })
  },

  goHome() {
    wx.reLaunch({
      url: '/pages/index/index'
    })
  }
})
