const api = require('../../utils/api.js')
const util = require('../../utils/util.js')

function decorateLookupResult(order) {
  return {
    phone: order.phone,
    maskedPhone: order.maskedPhone || util.maskPhone(order.phone),
    pickupCode: order.pickupCode,
    cabinetNo: order.cabinetCode || order.cabinetNo || 'CAB001',
    statusText: order.statusText || util.formatOrderStatusText(order.status),
    createdAtText: util.formatServerTime(order.createTime || order.createdAt),
    instruction: order.instruction
  }
}

function decorateVerifyResult(result) {
  return {
    maskedPhone: result.maskedPhone || util.maskPhone(result.phone),
    cabinetNo: result.cabinetCode || result.cabinetNo || 'CAB001',
    pickupCode: result.pickupCode,
    verifySource: util.formatSourceText(result.verifySource),
    relayText: result.relayCommand
      ? `开锁脉冲：${result.relayCommand.durationMs}ms`
      : '等待硬件执行开锁',
    message: result.message,
    completed: Boolean(result.completed)
  }
}

Page({
  data: {
    phone: '',
    lookupLoading: false,
    verifyLoading: false,
    confirmingPickup: false,
    errorMessage: '',
    lookupResult: null,
    verifyResult: null,
    apiBaseUrl: api.getBaseUrl()
  },

  onShow() {
    this.setData({
      apiBaseUrl: api.getBaseUrl()
    })
  },

  handlePhoneInput(event) {
    this.setData({
      phone: String(event.detail.value || '').replace(/\D/g, '').slice(0, 11)
    })
  },

  fillDemoPhone() {
    this.setData({
      phone: '13800138000'
    })
  },

  async submitLookup() {
    const phone = this.data.phone

    if (!/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({
        title: '请输入正确手机号',
        icon: 'none'
      })
      return
    }

    this.setData({
      lookupLoading: true,
      errorMessage: '',
      verifyResult: null
    })

    try {
      const response = await api.preparePickup(phone)
      this.setData({
        lookupResult: decorateLookupResult(response.data || {})
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

  async simulateHardwareVerify() {
    const lookupResult = this.data.lookupResult

    if (!lookupResult) {
      return
    }

    this.setData({
      verifyLoading: true,
      errorMessage: ''
    })

    try {
      const response = await api.verifyPickup(lookupResult.pickupCode, true)
      this.setData({
        verifyResult: decorateVerifyResult(response.data || {})
      })

      wx.showModal({
        title: '取件完成',
        content: '取件码校验成功，系统已经开锁并将订单更新为已取件。',
        showCancel: false
      })
    } catch (error) {
      this.setData({
        errorMessage: error.message || '取件码校验失败。'
      })
    } finally {
      this.setData({
        verifyLoading: false
      })
    }
  },

  async confirmPickup() {
    const verifyResult = this.data.verifyResult

    if (!verifyResult || verifyResult.completed) {
      return
    }

    this.setData({
      confirmingPickup: true,
      errorMessage: ''
    })

    try {
      await api.confirmPickup(verifyResult.pickupCode, true)

      this.setData({
        verifyResult: {
          ...verifyResult,
          completed: true,
          message: '订单已更新为已取件。'
        }
      })
    } catch (error) {
      this.setData({
        errorMessage: error.message || '取件确认失败。'
      })
    } finally {
      this.setData({
        confirmingPickup: false
      })
    }
  },

  resetFlow() {
    this.setData({
      phone: '',
      lookupResult: null,
      verifyResult: null,
      errorMessage: ''
    })
  },

  goRecordsPage() {
    wx.navigateTo({
      url: '/pages/records/records'
    })
  }
})
