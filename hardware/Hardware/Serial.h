#ifndef __SERIAL_H
#define __SERIAL_H

#include "stm32f10x.h"
#include "USART1.h"
#include "USART2.h"

/*
 * 串口兼容封装层。
 * USART1 用于电脑调试输出。
 * USART2 用于 ESP8266 通信。
 */
#define SERIAL_BAUDRATE          USART1_DEBUG_BAUDRATE
#define ESP8266_RX_BUFFER_SIZE   USART2_ESP8266_RX_BUFFER_SIZE

/* 在不修改原有调用位置的前提下，同时初始化 USART1 和 USART2。 */
void Serial_Init(void);

/* 兼容原有调试代码的 USART1 接口。 */
void Serial_DebugInit(void);
void Serial_DebugSendByte(uint8_t Byte);
void Serial_DebugSendBuffer(const uint8_t *Buffer, uint16_t Length);
void Serial_DebugSendString(const char *String);
uint8_t Serial_DebugReadByte(uint8_t *Byte);

/* 兼容原有 ESP8266 代码的 USART2 接口。 */
void ESP8266_UART_Init(void);
void ESP8266_SendByte(uint8_t Byte);
void ESP8266_SendBuffer(const uint8_t *Buffer, uint16_t Length);
void ESP8266_SendString(const char *String);
uint8_t ESP8266_ReadByte(uint8_t *Byte);
uint16_t ESP8266_ReadBuffer(uint8_t *Buffer, uint16_t BufferSize);
uint16_t ESP8266_GetRxCount(void);
uint8_t ESP8266_GetRxFlag(void);
void ESP8266_ClearRxFlag(void);
uint8_t ESP8266_GetOverflowFlag(void);
void ESP8266_ClearOverflowFlag(void);
void ESP8266_ClearRxBuffer(void);
void ESP8266_USART_IRQHandler(void);

#endif
