const { Router } = require('express');
const { asyncHandler } = require('../utils/common');

function createParcelRouter(controller) {
  const router = Router();

  router.get('/health', asyncHandler(controller.health));
  router.get('/api/dashboard', asyncHandler(controller.getDashboard));
  router.get('/api/cabinet', asyncHandler(controller.getCabinetStatus));
  router.get('/api/parcels', asyncHandler(controller.listParcels));
  router.get('/api/records', asyncHandler(controller.listRecords));

  router.post('/api/parcels/store', asyncHandler(controller.storeParcel));
  router.post('/api/parcels/store/confirm', asyncHandler(controller.confirmStore));
  router.post('/api/parcels/take', asyncHandler(controller.takeParcel));
  router.post('/api/parcels/verify-pickup', asyncHandler(controller.verifyPickup));
  router.post('/api/parcels/pickup/confirm', asyncHandler(controller.confirmPickup));

  router.post('/api/hardware/store/confirm', asyncHandler(controller.confirmHardwareStore));
  router.post('/api/hardware/verify-pickup', asyncHandler(controller.verifyHardwarePickup));
  router.post('/api/hardware/pickup/confirm', asyncHandler(controller.confirmHardwarePickup));

  return router;
}

module.exports = createParcelRouter;
