const api = require('../../utils/api.js')
const util = require('../../utils/util.js')

function getCabinetClass(status) {
  return status === 'idle' ? 'idle' : 'occupied'
}

function decorateCabinet(cabinet) {
  const status = cabinet && cabinet.status ? cabinet.status : 'idle'
  const order = cabinet && (cabinet.order || cabinet.parcel) ? (cabinet.order || cabinet.parcel) : null
  const cabinetCode = cabinet && (cabinet.cabinetCode || cabinet.code || cabinet.cabinetNo)
    ? (cabinet.cabinetCode || cabinet.code || cabinet.cabinetNo)
    : 'CAB001'

  return {
    cabinetNo: cabinetCode,
    status,
    statusText: util.formatCabinetStatus(status),
    statusClass: getCabinetClass(status),
    parcel: order ? {
      maskedPhone: order.maskedPhone || util.maskPhone(order.phone),
      pickupCode: order.pickupCode,
      statusText: order.statusText || util.formatOrderStatusText(order.status),
      createdAtText: util.formatServerTime(order.createTime || order.createdAt)
    } : null
  }
}

function decorateStoreResult(payload) {
  return {
    phone: payload.phone,
    maskedPhone: payload.maskedPhone || util.maskPhone(payload.phone),
    pickupCode: payload.pickupCode,
    cabinetNo: payload.cabinetCode || payload.cabinetNo || 'CAB001',
    createdAtText: util.formatServerTime(payload.createTime || payload.createdAt),
    instruction: payload.instruction,
    relayText: payload.relayCommand
      ? `开锁脉冲：${payload.relayCommand.durationMs}ms`
      : '等待硬件执行开锁',
    confirmed: false,
    statusText: payload.statusText || util.formatOrderStatusText(payload.status || 1)
  }
}

Page({
  data: {
    phone: '',
    submitting: false,
    confirmingStore: false,
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
      errorMessage: '',
      result: null
    })

    try {
      const response = await api.storeParcel(phone)
      const result = decorateStoreResult(response.data || {})

      this.setData({
        result,
        phone: '',
        cabinet: {
          cabinetNo: result.cabinetNo,
          status: 'pending_store',
          statusText: util.formatCabinetStatus('pending_store'),
          statusClass: getCabinetClass('pending_store'),
          parcel: {
            maskedPhone: result.maskedPhone,
            pickupCode: result.pickupCode,
            statusText: util.formatOrderStatusText(1),
            createdAtText: result.createdAtText
          }
        }
      })

      wx.showModal({
        title: '订单已创建',
        content: '系统已生成取件码。请放入快递后，再通过柜体确认键完成存件。',
        showCancel: false
      })
    } catch (error) {
      this.setData({
        errorMessage: error.message || '存件失败，请稍后重试。'
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

  async confirmStore() {
    const result = this.data.result

    if (!result || result.confirmed) {
      return
    }

    this.setData({
      confirmingStore: true,
      errorMessage: ''
    })

    try {
      await api.confirmStore(result.pickupCode, false)

      this.setData({
        result: {
          ...result,
          confirmed: true,
          statusText: util.formatOrderStatusText(2),
          instruction: '存件已确认，订单状态已更新为待取件。'
        },
        cabinet: {
          cabinetNo: result.cabinetNo,
          status: 'pending_pickup',
          statusText: util.formatCabinetStatus('pending_pickup'),
          statusClass: getCabinetClass('pending_pickup'),
          parcel: {
            maskedPhone: result.maskedPhone,
            pickupCode: result.pickupCode,
            statusText: util.formatOrderStatusText(2),
            createdAtText: result.createdAtText
          }
        }
      })

      wx.showToast({
        title: '存件已确认',
        icon: 'success'
      })
    } catch (error) {
      this.setData({
        errorMessage: error.message || '存件确认失败。'
      })
    } finally {
      this.setData({
        confirmingStore: false
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
