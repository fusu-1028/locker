const api = require('../../utils/api.js')
const util = require('../../utils/util.js')

function decorateLookupResult(parcel) {
  return {
    phone: parcel.phone,
    maskedPhone: parcel.maskedPhone || util.maskPhone(parcel.phone),
    pickupCode: parcel.pickupCode,
    cabinetNo: parcel.cabinetNo,
    createdAtText: util.formatServerTime(parcel.createdAt),
    instruction: parcel.instruction
  }
}

function decorateVerifyResult(result) {
  return {
    maskedPhone: result.maskedPhone || util.maskPhone(result.phone),
    cabinetNo: result.cabinetNo,
    pickupCode: result.pickupCode,
    verifySource: util.formatSourceText(result.verifySource),
    relayText: result.relayCommand
      ? `继电器动作：${result.relayCommand.action}，持续 ${result.relayCommand.durationMs}ms`
      : '继电器动作待硬件执行',
    message: result.message
  }
}

Page({
  data: {
    phone: '',
    lookupLoading: false,
    verifyLoading: false,
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
        errorMessage: error.message || '未找到该手机号对应的待取件信息。'
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
        lookupResult: null,
        verifyResult: decorateVerifyResult(response.data || {}),
        phone: ''
      })

      wx.showModal({
        title: '硬件开锁指令已触发',
        content: '本次是通过小程序模拟 ESP8266 上传验证码，实际部署时由硬件调用同一接口。',
        showCancel: false
      })
    } catch (error) {
      this.setData({
        errorMessage: error.message || '验证码校验失败。'
      })
    } finally {
      this.setData({
        verifyLoading: false
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
