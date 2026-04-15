const api = require('../../utils/api.js')
const util = require('../../utils/util.js')

function decorateCabinet(cabinet) {
  const status = cabinet && cabinet.status ? cabinet.status : 'idle'
  const parcel = cabinet && cabinet.parcel ? cabinet.parcel : null

  return {
    cabinetNo: cabinet && cabinet.cabinetNo ? cabinet.cabinetNo : 1,
    status,
    statusText: util.formatCabinetStatus(status),
    statusClass: status === 'occupied' ? 'occupied' : 'idle',
    parcel: parcel ? {
      maskedPhone: parcel.maskedPhone || util.maskPhone(parcel.phone),
      pickupCode: parcel.pickupCode,
      createdAtText: util.formatServerTime(parcel.createdAt)
    } : null
  }
}

function decorateResult(parcel) {
  return {
    phone: parcel.phone,
    maskedPhone: parcel.maskedPhone || util.maskPhone(parcel.phone),
    pickupCode: parcel.pickupCode,
    cabinetNo: parcel.cabinetNo,
    createdAtText: util.formatServerTime(parcel.createdAt),
    instruction: parcel.instruction
  }
}

Page({
  data: {
    phone: '',
    submitting: false,
    loadingCabinet: true,
    errorMessage: '',
    cabinet: decorateCabinet({}),
    result: null,
    apiBaseUrl: api.getBaseUrl()
  },

  onShow() {
    this.loadCabinet()
  },

  onPullDownRefresh() {
    this.loadCabinet(true)
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

  async loadCabinet(fromPullDown) {
    this.setData({
      loadingCabinet: true,
      apiBaseUrl: api.getBaseUrl()
    })

    try {
      const response = await api.getCabinetStatus()
      this.setData({
        cabinet: decorateCabinet(response.data || {}),
        errorMessage: ''
      })
    } catch (error) {
      this.setData({
        errorMessage: error.message || '柜体状态加载失败。'
      })
    } finally {
      this.setData({ loadingCabinet: false })

      if (fromPullDown) {
        wx.stopPullDownRefresh()
      }
    }
  },

  async submitStore() {
    const phone = this.data.phone

    if (!/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({
        title: '请输入正确手机号',
        icon: 'none'
      })
      return
    }

    this.setData({
      submitting: true,
      errorMessage: ''
    })

    try {
      const response = await api.storeParcel(phone)
      const result = decorateResult(response.data || {})

      this.setData({
        result,
        phone: '',
        cabinet: {
          cabinetNo: result.cabinetNo,
          status: 'occupied',
          statusText: util.formatCabinetStatus('occupied'),
          statusClass: 'occupied',
          parcel: {
            maskedPhone: result.maskedPhone,
            pickupCode: result.pickupCode,
            createdAtText: result.createdAtText
          }
        }
      })

      wx.showModal({
        title: '存件成功',
        content: '数据库已写入记录并生成六位取件码，请提醒用户妥善保存。',
        showCancel: false
      })
    } catch (error) {
      this.setData({
        errorMessage: error.message || '存件失败，请稍后再试。'
      })

      wx.showToast({
        title: '存件失败',
        icon: 'none'
      })
    } finally {
      this.setData({
        submitting: false
      })
    }
  },

  goTakePage() {
    wx.navigateTo({
      url: '/pages/take/take'
    })
  },

  goRecordsPage() {
    wx.navigateTo({
      url: '/pages/records/records'
    })
  }
})
