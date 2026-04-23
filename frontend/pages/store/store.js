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
      pickupCode: order.pickupCode || '--',
      statusText: util.formatOrderStatusText(order.status),
      createdAtText: util.formatServerTime(order.createTime || order.createdAt)
    } : null
  }
}

function decorateStoreResult(payload) {
  return {
    phone: payload.phone,
    maskedPhone: payload.maskedPhone || util.maskPhone(payload.phone),
    pickupCode: payload.pickupCode || '--',
    cabinetNo: payload.cabinetCode || payload.cabinetNo || 'CAB001',
    createdAtText: util.formatServerTime(payload.createTime || payload.createdAt),
    instruction: payload.instruction || '请放入物品并关闭柜门，完成本次存件。',
    relayText: payload.relayCommand
      ? '柜门已打开，请放入物品后关闭柜门。'
      : '请按页面提示完成后续操作。',
    confirmed: false,
    statusText: util.formatOrderStatusText(payload.status || 1)
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
    result: null
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

  async loadCabinet(fromPullDown) {
    this.setData({
      loadingCabinet: true
    })

    try {
      const response = await api.getCabinetStatus()
      this.setData({
        cabinet: decorateCabinet(response.data || {}),
        errorMessage: ''
      })
    } catch (error) {
      this.setData({
        errorMessage: error.message || '柜体状态获取失败，请稍后重试。'
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
        title: '请输入正确的手机号',
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
        title: '存件申请已提交',
        content: '系统已生成取件码并已开启柜门，请放入物品后关闭柜门。',
        showCancel: false
      })
    } catch (error) {
      this.setData({
        errorMessage: error.message || '存件失败，请稍后重试。'
      })

      wx.showToast({
        title: '存件失败，请重试',
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
      await api.confirmStore(result.pickupCode, 'miniapp')

      this.setData({
        result: {
          ...result,
          confirmed: true,
          statusText: util.formatOrderStatusText(2),
          instruction: '柜门已关闭，订单已进入待取件状态。'
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
        title: '存件已完成',
        icon: 'success'
      })
    } catch (error) {
      this.setData({
        errorMessage: error.message || '存件确认失败，请稍后重试。'
      })
    } finally {
      this.setData({
        confirmingStore: false
      })
    }
  },

  goHome() {
    wx.reLaunch({
      url: '/pages/index/index'
    })
  },

  goTakePage() {
    wx.navigateTo({
      url: '/pages/take/take'
    })
  }
})
