#ifndef __LOCKER_CLOUD_H
#define __LOCKER_CLOUD_H

#include "stm32f10x.h"

/*
 * ESP8266 sta mode configuration.
 * Current deployment:
 * 1. Connect STM32 + ESP8266 to the phone hotspot below.
 * 2. Access the backend through the public IP on port 3000.
 * 3. Hardware and miniapp now share the same /api/parcels/* endpoints.
 */
#define LOCKER_WIFI_SSID                    "moon"
#define LOCKER_WIFI_PASSWORD                "12345678"

#define LOCKER_SERVER_HOST                  "47.239.169.253"
#define LOCKER_SERVER_PORT                  3000U
#define LOCKER_VERIFY_PICKUP_PATH           "/api/parcels/verify-pickup"
#define LOCKER_CONFIRM_PICKUP_PATH          "/api/parcels/pickup/confirm"
#define LOCKER_CONFIRM_STORE_PATH           "/api/parcels/store/confirm"
#define LOCKER_PICKUP_CODE_LENGTH           6U

void LockerCloud_Init(void);
uint8_t LockerCloud_ConnectHotspot(void);
uint8_t LockerCloud_IsHotspotConnected(void);
uint8_t LockerCloud_VerifyPickupCode(const char *pickupCode, uint16_t *durationMs);
uint8_t LockerCloud_ConfirmPickup(const char *pickupCode);
uint8_t LockerCloud_ConfirmStore(const char *pickupCode);

#endif
