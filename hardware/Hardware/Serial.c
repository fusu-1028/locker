#include "Serial.h"

/*
 * Serial.c 作为兼容封装层使用。
 * 实际硬件逻辑已经拆分到 USART1.c 和 USART2.c 中。
 * 保留这一层可以避免修改现有应用代码。
 */

/* 按照原有顺序初始化两个串口。 */
void Serial_Init(void)
{
    Serial_DebugInit();
    ESP8266_UART_Init();
}

/* 面向原有调试代码的 USART1 兼容封装。 */
void Serial_DebugInit(void)
{
    USART1_DebugInit();
}

void Serial_DebugSendByte(uint8_t Byte)
{
    USART1_DebugSendByte(Byte);
}

void Serial_DebugSendBuffer(const uint8_t *Buffer, uint16_t Length)
{
    USART1_DebugSendBuffer(Buffer, Length);
}

void Serial_DebugSendString(const char *String)
{
    USART1_DebugSendString(String);
}

uint8_t Serial_DebugReadByte(uint8_t *Byte)
{
    return USART1_DebugReadByte(Byte);
}

/* 面向原有 ESP8266 代码的 USART2 兼容封装。 */
void ESP8266_UART_Init(void)
{
    USART2_ESP8266_Init();
}

void ESP8266_SendByte(uint8_t Byte)
{
    USART2_ESP8266_SendByte(Byte);
}

void ESP8266_SendBuffer(const uint8_t *Buffer, uint16_t Length)
{
    USART2_ESP8266_SendBuffer(Buffer, Length);
}

void ESP8266_SendString(const char *String)
{
    USART2_ESP8266_SendString(String);
}

uint8_t ESP8266_ReadByte(uint8_t *Byte)
{
    return USART2_ESP8266_ReadByte(Byte);
}

uint16_t ESP8266_ReadBuffer(uint8_t *Buffer, uint16_t BufferSize)
{
    return USART2_ESP8266_ReadBuffer(Buffer, BufferSize);
}

uint16_t ESP8266_GetRxCount(void)
{
    return USART2_ESP8266_GetRxCount();
}

uint8_t ESP8266_GetRxFlag(void)
{
    return USART2_ESP8266_GetRxFlag();
}

void ESP8266_ClearRxFlag(void)
{
    USART2_ESP8266_ClearRxFlag();
}

uint8_t ESP8266_GetOverflowFlag(void)
{
    return USART2_ESP8266_GetOverflowFlag();
}

void ESP8266_ClearOverflowFlag(void)
{
    USART2_ESP8266_ClearOverflowFlag();
}

void ESP8266_ClearRxBuffer(void)
{
    USART2_ESP8266_ClearRxBuffer();
}

void ESP8266_USART_IRQHandler(void)
{
    USART2_ESP8266_IRQHandler();
}
