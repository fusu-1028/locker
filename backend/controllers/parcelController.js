const { messages } = require('../config');

function createParcelController(service) {
  return {
    async health(req, res) {
      res.json({
        message: messages.healthOk,
        data: await service.getSystemStatus()
      });
    },

    async getDashboard(req, res) {
      res.json({
        message: messages.dashboardOk,
        data: await service.getDashboard(req.query.limit)
      });
    },

    async getCabinetStatus(req, res) {
      res.json({
        message: messages.cabinetOk,
        data: await service.getCabinetStatus()
      });
    },

    async listParcels(req, res) {
      res.json({
        message: messages.parcelListOk,
        data: await service.listParcels()
      });
    },

    async listRecords(req, res) {
      res.json({
        message: messages.recordsOk,
        data: await service.listRecords(req.query.limit)
      });
    },

    async storeParcel(req, res) {
      const result = await service.storeParcel(req.body.phone);
      res.status(201).json({
        message: messages.storeOk,
        data: result
      });
    },

    async confirmStore(req, res) {
      const result = await service.confirmStoreByPickupCode(
        req.body.pickupCode || req.body.code,
        { source: 'miniapp' }
      );

      res.json({
        message: messages.storeConfirmOk,
        data: result
      });
    },

    async confirmHardwareStore(req, res) {
      const result = await service.confirmStoreByPickupCode(
        req.body.pickupCode || req.body.code,
        { source: 'hardware' }
      );

      res.json({
        message: messages.storeConfirmOk,
        data: result
      });
    },

    async takeParcel(req, res) {
      const result = await service.getParcelByPhone(req.body.phone);
      res.json({
        message: messages.takeOk,
        data: result
      });
    },

    async verifyPickup(req, res) {
      const result = await service.verifyAndOpenByPickupCode(
        req.body.pickupCode || req.body.code,
        { source: 'debug' }
      );

      res.json({
        message: messages.verifyOk,
        data: result
      });
    },

    async verifyHardwarePickup(req, res) {
      const result = await service.verifyAndOpenByPickupCode(
        req.body.pickupCode || req.body.code,
        { source: 'hardware' }
      );

      res.json({
        message: messages.hardwareVerifyOk,
        data: result
      });
    },

    async confirmPickup(req, res) {
      const result = await service.confirmPickupByPickupCode(
        req.body.pickupCode || req.body.code,
        { source: 'miniapp' }
      );

      res.json({
        message: messages.pickupConfirmOk,
        data: result
      });
    },

    async confirmHardwarePickup(req, res) {
      const result = await service.confirmPickupByPickupCode(
        req.body.pickupCode || req.body.code,
        { source: 'hardware' }
      );

      res.json({
        message: messages.pickupConfirmOk,
        data: result
      });
    }
  };
}

module.exports = createParcelController;
