#include "stm32f10x.h"
#include "Delay.h"
#include "LockerCloud.h"
#include "OLED.h"
#include "Relay.h"
#include "Serial.h"
#include "TTP229.h"
#include <stdio.h>
#include <string.h>

#define LOCKER_SCAN_PERIOD_MS                  10U
#define LOCKER_WIFI_RETRY_DELAY_MS             3000U
#define LOCKER_WIFI_HEALTH_CHECK_INTERVAL_MS   5000U
#define LOCKER_OLED_LINE_WIDTH                 16U

typedef enum
{
    LOCKER_STATE_CONNECTING = 0,
    LOCKER_STATE_INPUT_PICKUP_CODE
} LockerState;

static char LockerApp_GetKeyFromPress(uint16_t newPress);
static const char *LockerApp_GetStateText(LockerState state);
static uint8_t LockerApp_IsDigitKey(char key);
static void LockerApp_ResetCode(char *pickupCode, uint8_t *length);
static void LockerApp_PrintInputState(const char *pickupCode, uint8_t length);
static void LockerApp_OledWriteLine(uint8_t line, const char *text);
static void LockerApp_BuildCodePreview(const char *pickupCode, char *buffer, uint16_t bufferSize);
static void LockerApp_UpdateDisplay(
    LockerState state,
    uint8_t wifiConnected,
    const char *displayCode,
    const char *message,
    uint32_t connectAttempt
);

int main(void)
{
    LockerState state = LOCKER_STATE_CONNECTING;
    LockerState resumeState = LOCKER_STATE_INPUT_PICKUP_CODE;
    char pickupCode[LOCKER_PICKUP_CODE_LENGTH + 1U];
    uint8_t pickupCodeLength = 0U;
    uint32_t wifiHealthElapsedMs = 0U;
    uint32_t connectAttempt = 0U;

    Serial_Init();
    Relay_Init();
    TTP229_Init();
    OLED_Init();
    LockerCloud_Init();

    LockerApp_ResetCode(pickupCode, &pickupCodeLength);
    LockerApp_UpdateDisplay(state, 0U, pickupCode, "BOOTING", connectAttempt);

    printf("\r\nSmart locker hardware flow started.\r\n");
    printf("Hotspot SSID: %s\r\n", LOCKER_WIFI_SSID);
    printf("Backend URL: http://%s:%u\r\n", LOCKER_SERVER_HOST, LOCKER_SERVER_PORT);
    printf("Boot policy: connect WiFi first, block business logic until online.\r\n");
    printf("Reconnect policy: if WiFi drops later, pause business logic and retry until online.\r\n");
    printf("Key map: digits 0-9 for pickup code, * clears current input.\r\n");

    while (1)
    {
        char key;

        if (state == LOCKER_STATE_CONNECTING)
        {
            connectAttempt++;
            LockerApp_UpdateDisplay(state, 0U, pickupCode, "JOIN WIFI", connectAttempt);
            printf("[wifi] Connect attempt %lu to SSID %s.\r\n", (unsigned long)connectAttempt, LOCKER_WIFI_SSID);

            if (LockerCloud_ConnectHotspot())
            {
                state = resumeState;
                wifiHealthElapsedMs = 0U;
                LockerApp_UpdateDisplay(
                    state,
                    1U,
                    pickupCode,
                    pickupCode[0] == '\0' ? "READY" : "",
                    connectAttempt
                );
                printf("[wifi] Hotspot connected. Resuming state: %s.\r\n", LockerApp_GetStateText(state));
            }
            else
            {
                LockerApp_UpdateDisplay(state, 0U, pickupCode, "RETRY IN 3S", connectAttempt);
                printf("[wifi] Connect attempt failed. Retrying in %u ms.\r\n", LOCKER_WIFI_RETRY_DELAY_MS);
                Delay_ms(LOCKER_WIFI_RETRY_DELAY_MS);
            }

            continue;
        }

        if (wifiHealthElapsedMs >= LOCKER_WIFI_HEALTH_CHECK_INTERVAL_MS)
        {
            if (!LockerCloud_IsHotspotConnected())
            {
                printf("[wifi] Connection lost during runtime. Switching back to reconnect mode.\r\n");
                resumeState = state;
                state = LOCKER_STATE_CONNECTING;
                LockerApp_UpdateDisplay(state, 0U, pickupCode, "WIFI LOST", connectAttempt);
                continue;
            }

            wifiHealthElapsedMs = 0U;
        }

        TTP229_Scan();
        key = LockerApp_GetKeyFromPress(TTP229_GetNewPress());

        if (key == '\0')
        {
            Delay_ms(LOCKER_SCAN_PERIOD_MS);
            wifiHealthElapsedMs += LOCKER_SCAN_PERIOD_MS;
            continue;
        }

        if (key == '*')
        {
            LockerApp_ResetCode(pickupCode, &pickupCodeLength);
            LockerApp_UpdateDisplay(state, 1U, pickupCode, "CLEARED", connectAttempt);
            printf("Pickup code cleared.\r\n");
        }
        else if (LockerApp_IsDigitKey(key))
        {
            uint16_t durationMs = 800U;

            if (pickupCodeLength < LOCKER_PICKUP_CODE_LENGTH)
            {
                pickupCode[pickupCodeLength] = key;
                pickupCodeLength++;
                pickupCode[pickupCodeLength] = '\0';
            }

            LockerApp_PrintInputState(pickupCode, pickupCodeLength);
            LockerApp_UpdateDisplay(state, 1U, pickupCode, "", connectAttempt);

            if (pickupCodeLength == LOCKER_PICKUP_CODE_LENGTH)
            {
                LockerApp_UpdateDisplay(state, 1U, pickupCode, "VERIFYING", connectAttempt);
                printf("Verifying pickup code %s.\r\n", pickupCode);

                if (LockerCloud_VerifyPickupCode(pickupCode, &durationMs))
                {
                    printf("Verification passed. Opening lock for %u ms.\r\n", durationMs);
                    Lock_Open(durationMs);

                    LockerApp_ResetCode(pickupCode, &pickupCodeLength);
                    LockerApp_UpdateDisplay(state, 1U, pickupCode, "DONE", connectAttempt);
                    printf("Pickup completed. Backend order status is now picked up.\r\n");
                    printf("Please enter the next 6-digit pickup code on TTP229.\r\n");
                }
                else if (!LockerCloud_IsHotspotConnected())
                {
                    printf("[wifi] Verification failed because WiFi is offline. Entering reconnect mode.\r\n");
                    resumeState = LOCKER_STATE_INPUT_PICKUP_CODE;
                    state = LOCKER_STATE_CONNECTING;
                    LockerApp_UpdateDisplay(state, 0U, pickupCode, "NET LOST", connectAttempt);
                }
                else
                {
                    LockerApp_ResetCode(pickupCode, &pickupCodeLength);
                    LockerApp_UpdateDisplay(state, 1U, pickupCode, "VERIFY FAIL", connectAttempt);
                    printf("Verification failed. Check the pickup code or backend data, then retry.\r\n");
                }
            }
        }
        else
        {
            LockerApp_UpdateDisplay(state, 1U, pickupCode, "DIGIT OR *", connectAttempt);
            printf("Unsupported key %c in input mode. Only digits and * are used here.\r\n", key);
        }

        Delay_ms(LOCKER_SCAN_PERIOD_MS);
        wifiHealthElapsedMs += LOCKER_SCAN_PERIOD_MS;
    }
}

static char LockerApp_GetKeyFromPress(uint16_t newPress)
{
    static const char KeyMap[TTP229_KEY_COUNT] = {
        '1', '2', '3', 'A',
        '4', '5', '6', 'B',
        '7', '8', '9', 'C',
        '*', '0', '#', 'D'
    };
    uint8_t index;

    for (index = 0U; index < TTP229_KEY_COUNT; index++)
    {
        if ((newPress & (uint16_t)(1U << index)) != 0U)
        {
            return KeyMap[index];
        }
    }

    return '\0';
}

static const char *LockerApp_GetStateText(LockerState state)
{
    switch (state)
    {
        case LOCKER_STATE_CONNECTING:
            return "CONNECT";

        case LOCKER_STATE_INPUT_PICKUP_CODE:
            return "INPUT";

        default:
            return "UNKNOWN";
    }
}

static uint8_t LockerApp_IsDigitKey(char key)
{
    return (uint8_t)((key >= '0') && (key <= '9'));
}

static void LockerApp_ResetCode(char *pickupCode, uint8_t *length)
{
    if (pickupCode != 0)
    {
        memset(pickupCode, 0, LOCKER_PICKUP_CODE_LENGTH + 1U);
    }

    if (length != 0)
    {
        *length = 0U;
    }
}

static void LockerApp_PrintInputState(const char *pickupCode, uint8_t length)
{
    printf(
        "Current pickup code: %s (%u/%u)\r\n",
        pickupCode,
        (unsigned int)length,
        (unsigned int)LOCKER_PICKUP_CODE_LENGTH
    );
}

static void LockerApp_OledWriteLine(uint8_t line, const char *text)
{
    char buffer[LOCKER_OLED_LINE_WIDTH + 1U];
    uint8_t index = 0U;

    memset(buffer, ' ', sizeof(buffer));
    buffer[LOCKER_OLED_LINE_WIDTH] = '\0';

    if (text != 0)
    {
        while ((index < LOCKER_OLED_LINE_WIDTH) && (text[index] != '\0'))
        {
            buffer[index] = text[index];
            index++;
        }
    }

    OLED_ShowString(line, 1U, buffer);
}

static void LockerApp_BuildCodePreview(const char *pickupCode, char *buffer, uint16_t bufferSize)
{
    char preview[LOCKER_PICKUP_CODE_LENGTH + 1U];
    uint8_t index;

    if ((buffer == 0) || (bufferSize == 0U))
    {
        return;
    }

    for (index = 0U; index < LOCKER_PICKUP_CODE_LENGTH; index++)
    {
        if ((pickupCode != 0) && (pickupCode[index] != '\0'))
        {
            preview[index] = pickupCode[index];
        }
        else
        {
            preview[index] = '_';
        }
    }

    preview[LOCKER_PICKUP_CODE_LENGTH] = '\0';
    snprintf(buffer, bufferSize, "CODE:%s", preview);
}

static void LockerApp_UpdateDisplay(
    LockerState state,
    uint8_t wifiConnected,
    const char *displayCode,
    const char *message,
    uint32_t connectAttempt
)
{
    char line1[LOCKER_OLED_LINE_WIDTH + 1U];
    char line2[LOCKER_OLED_LINE_WIDTH + 1U];
    char line3[LOCKER_OLED_LINE_WIDTH + 1U];
    char line4[LOCKER_OLED_LINE_WIDTH + 1U];

    snprintf(line1, sizeof(line1), "SMART LOCKER");

    if (wifiConnected)
    {
        snprintf(line2, sizeof(line2), "WIFI:ONLINE");
    }
    else
    {
        snprintf(line2, sizeof(line2), "WIFI:TRY %03lu", (unsigned long)(connectAttempt % 1000U));
    }

    snprintf(line3, sizeof(line3), "STATE:%s", LockerApp_GetStateText(state));

    if ((message != 0) && (message[0] != '\0'))
    {
        snprintf(line4, sizeof(line4), "%s", message);
    }
    else if (state == LOCKER_STATE_CONNECTING)
    {
        snprintf(line4, sizeof(line4), "SSID:%s", LOCKER_WIFI_SSID);
    }
    else
    {
        LockerApp_BuildCodePreview(displayCode, line4, sizeof(line4));
    }

    LockerApp_OledWriteLine(1U, line1);
    LockerApp_OledWriteLine(2U, line2);
    LockerApp_OledWriteLine(3U, line3);
    LockerApp_OledWriteLine(4U, line4);
}
