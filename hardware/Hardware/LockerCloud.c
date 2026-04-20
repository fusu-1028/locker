#include "LockerCloud.h"
#include "Delay.h"
#include "Serial.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define LOCKER_AT_BUFFER_SIZE               512U
#define LOCKER_HTTP_REQUEST_SIZE            384U
#define LOCKER_WIFI_COMMAND_SIZE            128U
#define LOCKER_AT_BOOT_TIMEOUT_MS           3000U
#define LOCKER_AT_SHORT_TIMEOUT_MS          2000U
#define LOCKER_AT_QUERY_TIMEOUT_MS          3000U
#define LOCKER_AT_HTTP_TIMEOUT_MS           6000U
#define LOCKER_AT_WIFI_TIMEOUT_MS           20000U
#define LOCKER_AT_RETRY_COUNT               3U

static uint8_t LockerCloud_WifiReady = 0U;

static uint8_t LockerCloud_EnsureWifiReady(char *response, uint16_t responseSize);
static uint8_t LockerCloud_ConnectHotspotInternal(char *response, uint16_t responseSize);
static uint8_t LockerCloud_WaitModuleReady(char *response, uint16_t responseSize);
static uint8_t LockerCloud_HttpPostJson(const char *path, const char *jsonBody, char *response, uint16_t responseSize);
static uint8_t LockerCloud_HttpPostJsonOnce(const char *path, const char *jsonBody, char *response, uint16_t responseSize);
static uint8_t LockerCloud_SendCommandAndWait(const char *command, const char *token, uint32_t timeoutMs, char *response, uint16_t responseSize);
static uint8_t LockerCloud_SendDataAndWait(const char *data, const char *token, uint32_t timeoutMs, char *response, uint16_t responseSize);
static uint8_t LockerCloud_ReadUntilToken(const char *token, uint32_t timeoutMs, char *buffer, uint16_t bufferSize);
static uint8_t LockerCloud_ContainsToken(const char *buffer, const char *token);
static void LockerCloud_AppendByte(char *buffer, uint16_t bufferSize, uint16_t *length, char byte);
static uint8_t LockerCloud_ParseBoolean(const char *response, const char *key);
static uint16_t LockerCloud_ParseUint(const char *response, const char *key, uint16_t defaultValue);
static void LockerCloud_PrintResponse(const char *prefix, const char *response);

void LockerCloud_Init(void)
{
    ESP8266_ClearRxBuffer();
    ESP8266_ClearRxFlag();
    ESP8266_ClearOverflowFlag();
    LockerCloud_WifiReady = 0U;
}

uint8_t LockerCloud_ConnectHotspot(void)
{
    char response[LOCKER_AT_BUFFER_SIZE];

    return LockerCloud_ConnectHotspotInternal(response, sizeof(response));
}

uint8_t LockerCloud_IsHotspotConnected(void)
{
    char response[LOCKER_AT_BUFFER_SIZE];

    if (!LockerCloud_WaitModuleReady(response, sizeof(response)))
    {
        LockerCloud_WifiReady = 0U;
        printf("[wifi] ESP8266 did not respond during health check.\r\n");
        LockerCloud_PrintResponse("[wifi] Health-check response: ", response);
        return 0;
    }

    if (!LockerCloud_SendCommandAndWait("AT+CWJAP?\r\n", "OK", LOCKER_AT_QUERY_TIMEOUT_MS, response, sizeof(response)))
    {
        LockerCloud_WifiReady = 0U;
        printf("[wifi] Failed to query current hotspot state.\r\n");
        LockerCloud_PrintResponse("[wifi] Query response: ", response);
        return 0;
    }

    if (!LockerCloud_ContainsToken(response, "+CWJAP:\""))
    {
        LockerCloud_WifiReady = 0U;
        printf("[wifi] Hotspot connection is not available.\r\n");
        LockerCloud_PrintResponse("[wifi] Status response: ", response);
        return 0;
    }

    LockerCloud_WifiReady = 1U;
    return 1;
}

uint8_t LockerCloud_VerifyPickupCode(const char *pickupCode, uint16_t *durationMs)
{
    char jsonBody[64];
    char response[LOCKER_AT_BUFFER_SIZE];

    if ((pickupCode == 0) || (strlen(pickupCode) != LOCKER_PICKUP_CODE_LENGTH))
    {
        return 0;
    }

    sprintf(jsonBody, "{\"pickupCode\":\"%s\"}", pickupCode);
    printf("[cloud] Verifying pickup code %s.\r\n", pickupCode);

    if (!LockerCloud_HttpPostJson(LOCKER_VERIFY_PICKUP_PATH, jsonBody, response, sizeof(response)))
    {
        printf("[cloud] Pickup verification request failed.\r\n");
        return 0;
    }

    if (durationMs != 0)
    {
        *durationMs = LockerCloud_ParseUint(response, "\"durationMs\":", 800U);
    }

    return LockerCloud_ParseBoolean(response, "\"openDoor\":true");
}

uint8_t LockerCloud_ConfirmPickup(const char *pickupCode)
{
    char jsonBody[64];
    char response[LOCKER_AT_BUFFER_SIZE];

    if ((pickupCode == 0) || (strlen(pickupCode) != LOCKER_PICKUP_CODE_LENGTH))
    {
        return 0;
    }

    sprintf(jsonBody, "{\"pickupCode\":\"%s\"}", pickupCode);
    printf("[cloud] Confirming pickup completion for %s.\r\n", pickupCode);

    if (!LockerCloud_HttpPostJson(LOCKER_CONFIRM_PICKUP_PATH, jsonBody, response, sizeof(response)))
    {
        printf("[cloud] Pickup completion request failed.\r\n");
        return 0;
    }

    return LockerCloud_ParseBoolean(response, "\"completed\":true");
}

uint8_t LockerCloud_ConfirmStore(const char *pickupCode)
{
    char jsonBody[64];
    char response[LOCKER_AT_BUFFER_SIZE];

    if ((pickupCode == 0) || (strlen(pickupCode) != LOCKER_PICKUP_CODE_LENGTH))
    {
        return 0;
    }

    sprintf(jsonBody, "{\"pickupCode\":\"%s\"}", pickupCode);
    printf("[cloud] Confirming store completion for %s.\r\n", pickupCode);

    if (!LockerCloud_HttpPostJson(LOCKER_CONFIRM_STORE_PATH, jsonBody, response, sizeof(response)))
    {
        printf("[cloud] Store completion request failed.\r\n");
        return 0;
    }

    return (uint8_t)(
        LockerCloud_ContainsToken(response, "\"cabinetStatus\":\"pending_pickup\"") ||
        LockerCloud_ContainsToken(response, "\"status\":2")
    );
}

static uint8_t LockerCloud_EnsureWifiReady(char *response, uint16_t responseSize)
{
    if (LockerCloud_WifiReady)
    {
        return 1;
    }

    printf("[wifi] Cached WiFi state is offline, starting reconnect.\r\n");
    return LockerCloud_ConnectHotspotInternal(response, responseSize);
}

static uint8_t LockerCloud_ConnectHotspotInternal(char *response, uint16_t responseSize)
{
    char command[LOCKER_WIFI_COMMAND_SIZE];

    if ((response == 0) || (responseSize == 0U))
    {
        return 0;
    }

    LockerCloud_Init();
    Delay_ms(500U);

    printf("[wifi] Initializing ESP8266 before hotspot join.\r\n");

    if (!LockerCloud_WaitModuleReady(response, responseSize))
    {
        printf("[wifi] ESP8266 is not ready.\r\n");
        LockerCloud_PrintResponse("[wifi] Boot response: ", response);
        return 0;
    }

    if (!LockerCloud_SendCommandAndWait("ATE0\r\n", "OK", LOCKER_AT_SHORT_TIMEOUT_MS, response, responseSize))
    {
        printf("[wifi] Failed to disable AT echo.\r\n");
        LockerCloud_PrintResponse("[wifi] Echo response: ", response);
        return 0;
    }

    if (!LockerCloud_SendCommandAndWait("AT+CWMODE=1\r\n", "OK", LOCKER_AT_SHORT_TIMEOUT_MS, response, responseSize))
    {
        printf("[wifi] Failed to set STA mode.\r\n");
        LockerCloud_PrintResponse("[wifi] CWMODE response: ", response);
        return 0;
    }

    if (!LockerCloud_SendCommandAndWait("AT+CIPMUX=0\r\n", "OK", LOCKER_AT_SHORT_TIMEOUT_MS, response, responseSize))
    {
        printf("[wifi] Failed to set single TCP mode.\r\n");
        LockerCloud_PrintResponse("[wifi] CIPMUX response: ", response);
        return 0;
    }

    printf("[wifi] Joining hotspot \"%s\".\r\n", LOCKER_WIFI_SSID);
    snprintf(
        command,
        sizeof(command),
        "AT+CWJAP_CUR=\"%s\",\"%s\"\r\n",
        LOCKER_WIFI_SSID,
        LOCKER_WIFI_PASSWORD
    );

    if (!LockerCloud_SendCommandAndWait(command, "OK", LOCKER_AT_WIFI_TIMEOUT_MS, response, responseSize))
    {
        printf("[wifi] Temporary hotspot join failed, retrying with persistent join command.\r\n");
        LockerCloud_PrintResponse("[wifi] CWJAP_CUR response: ", response);

        snprintf(
            command,
            sizeof(command),
            "AT+CWJAP=\"%s\",\"%s\"\r\n",
            LOCKER_WIFI_SSID,
            LOCKER_WIFI_PASSWORD
        );

        if (!LockerCloud_SendCommandAndWait(command, "OK", LOCKER_AT_WIFI_TIMEOUT_MS, response, responseSize))
        {
            LockerCloud_WifiReady = 0U;
            printf("[wifi] Failed to join hotspot \"%s\".\r\n", LOCKER_WIFI_SSID);
            LockerCloud_PrintResponse("[wifi] CWJAP response: ", response);
            return 0;
        }
    }

    LockerCloud_WifiReady = 1U;
    printf("[wifi] Hotspot \"%s\" connected successfully.\r\n", LOCKER_WIFI_SSID);
    return 1;
}

static uint8_t LockerCloud_WaitModuleReady(char *response, uint16_t responseSize)
{
    uint8_t attempt;

    for (attempt = 0U; attempt < LOCKER_AT_RETRY_COUNT; attempt++)
    {
        if (LockerCloud_SendCommandAndWait("AT\r\n", "OK", LOCKER_AT_BOOT_TIMEOUT_MS, response, responseSize))
        {
            return 1;
        }

        Delay_ms(500U);
    }

    return 0;
}

static uint8_t LockerCloud_HttpPostJson(const char *path, const char *jsonBody, char *response, uint16_t responseSize)
{
    if ((path == 0) || (jsonBody == 0) || (response == 0) || (responseSize == 0U))
    {
        return 0;
    }

    if (!LockerCloud_EnsureWifiReady(response, responseSize))
    {
        printf("[wifi] HTTP request blocked because hotspot is unavailable.\r\n");
        return 0;
    }

    if (LockerCloud_HttpPostJsonOnce(path, jsonBody, response, responseSize))
    {
        return 1;
    }

    printf("[wifi] HTTP request failed, resetting WiFi state and retrying once.\r\n");
    LockerCloud_PrintResponse("[cloud] Failed HTTP response: ", response);
    LockerCloud_WifiReady = 0U;

    if (!LockerCloud_EnsureWifiReady(response, responseSize))
    {
        return 0;
    }

    return LockerCloud_HttpPostJsonOnce(path, jsonBody, response, responseSize);
}

static uint8_t LockerCloud_HttpPostJsonOnce(const char *path, const char *jsonBody, char *response, uint16_t responseSize)
{
    char request[LOCKER_HTTP_REQUEST_SIZE];
    char command[96];
    uint16_t bodyLength;
    int requestLength;
    uint8_t httpOk;

    ESP8266_SendString("AT+CIPCLOSE\r\n");
    Delay_ms(200U);
    ESP8266_ClearRxBuffer();

    sprintf(command, "AT+CIPSTART=\"TCP\",\"%s\",%u\r\n", LOCKER_SERVER_HOST, LOCKER_SERVER_PORT);
    if (!LockerCloud_SendCommandAndWait(command, "OK", LOCKER_AT_SHORT_TIMEOUT_MS, response, responseSize))
    {
        printf("[cloud] Failed to open TCP connection to %s:%u.\r\n", LOCKER_SERVER_HOST, LOCKER_SERVER_PORT);
        LockerCloud_PrintResponse("[cloud] CIPSTART response: ", response);
        return 0;
    }

    bodyLength = (uint16_t)strlen(jsonBody);
    requestLength = snprintf(
        request,
        sizeof(request),
        "POST %s HTTP/1.1\r\n"
        "Host: %s:%u\r\n"
        "Content-Type: application/json\r\n"
        "Connection: close\r\n"
        "Content-Length: %u\r\n"
        "\r\n"
        "%s",
        path,
        LOCKER_SERVER_HOST,
        LOCKER_SERVER_PORT,
        bodyLength,
        jsonBody
    );

    if ((requestLength <= 0) || ((uint16_t)requestLength >= sizeof(request)))
    {
        printf("[cloud] HTTP request body is too large.\r\n");
        return 0;
    }

    sprintf(command, "AT+CIPSEND=%u\r\n", (uint16_t)requestLength);
    if (!LockerCloud_SendCommandAndWait(command, ">", LOCKER_AT_SHORT_TIMEOUT_MS, response, responseSize))
    {
        printf("[cloud] Failed to enter TCP send mode.\r\n");
        LockerCloud_PrintResponse("[cloud] CIPSEND response: ", response);
        return 0;
    }

    if (!LockerCloud_SendDataAndWait(request, "SEND OK", LOCKER_AT_SHORT_TIMEOUT_MS, response, responseSize))
    {
        printf("[cloud] Failed to send HTTP payload.\r\n");
        LockerCloud_PrintResponse("[cloud] Send response: ", response);
        return 0;
    }

    if (!LockerCloud_ReadUntilToken("CLOSED", LOCKER_AT_HTTP_TIMEOUT_MS, response, responseSize))
    {
        printf("[cloud] TCP close token not observed, continuing with current response buffer.\r\n");
    }

    ESP8266_SendString("AT+CIPCLOSE\r\n");
    Delay_ms(100U);

    httpOk = (uint8_t)(
        LockerCloud_ContainsToken(response, "HTTP/1.1 200") ||
        LockerCloud_ContainsToken(response, "\"message\":")
    );

    if (!httpOk)
    {
        LockerCloud_PrintResponse("[cloud] HTTP response without success token: ", response);
    }

    return httpOk;
}

static uint8_t LockerCloud_SendCommandAndWait(const char *command, const char *token, uint32_t timeoutMs, char *response, uint16_t responseSize)
{
    if ((command == 0) || (token == 0))
    {
        return 0;
    }

    ESP8266_ClearRxBuffer();
    ESP8266_SendString(command);
    return LockerCloud_ReadUntilToken(token, timeoutMs, response, responseSize);
}

static uint8_t LockerCloud_SendDataAndWait(const char *data, const char *token, uint32_t timeoutMs, char *response, uint16_t responseSize)
{
    if ((data == 0) || (token == 0))
    {
        return 0;
    }

    ESP8266_ClearRxBuffer();
    ESP8266_SendBuffer((const uint8_t *)data, (uint16_t)strlen(data));
    return LockerCloud_ReadUntilToken(token, timeoutMs, response, responseSize);
}

static uint8_t LockerCloud_ReadUntilToken(const char *token, uint32_t timeoutMs, char *buffer, uint16_t bufferSize)
{
    uint16_t length = 0U;
    uint8_t byte = 0U;

    if ((token == 0) || (buffer == 0) || (bufferSize == 0U))
    {
        return 0;
    }

    buffer[0] = '\0';

    while (timeoutMs > 0U)
    {
        while (ESP8266_ReadByte(&byte))
        {
            LockerCloud_AppendByte(buffer, bufferSize, &length, (char)byte);

            if (LockerCloud_ContainsToken(buffer, token))
            {
                return 1;
            }

            if (LockerCloud_ContainsToken(buffer, "ERROR") ||
                LockerCloud_ContainsToken(buffer, "FAIL"))
            {
                return 0;
            }
        }

        Delay_ms(1U);
        timeoutMs--;
    }

    return LockerCloud_ContainsToken(buffer, token);
}

static uint8_t LockerCloud_ContainsToken(const char *buffer, const char *token)
{
    if ((buffer == 0) || (token == 0))
    {
        return 0;
    }

    return (uint8_t)(strstr(buffer, token) != 0);
}

static void LockerCloud_AppendByte(char *buffer, uint16_t bufferSize, uint16_t *length, char byte)
{
    if ((buffer == 0) || (length == 0) || (bufferSize < 2U))
    {
        return;
    }

    if (*length < (uint16_t)(bufferSize - 1U))
    {
        buffer[*length] = byte;
        (*length)++;
        buffer[*length] = '\0';
    }
}

static uint8_t LockerCloud_ParseBoolean(const char *response, const char *key)
{
    return LockerCloud_ContainsToken(response, key);
}

static uint16_t LockerCloud_ParseUint(const char *response, const char *key, uint16_t defaultValue)
{
    const char *start;
    unsigned long value;

    if ((response == 0) || (key == 0))
    {
        return defaultValue;
    }

    start = strstr(response, key);
    if (start == 0)
    {
        return defaultValue;
    }

    start += strlen(key);
    value = strtoul(start, 0, 10);

    if (value > 0xFFFFUL)
    {
        return 0xFFFFU;
    }

    return (uint16_t)value;
}

static void LockerCloud_PrintResponse(const char *prefix, const char *response)
{
    if ((response == 0) || (response[0] == '\0'))
    {
        return;
    }

    printf("%s%.160s\r\n", prefix, response);
}
