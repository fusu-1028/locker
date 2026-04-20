#ifndef __USART2_H
#define __USART2_H

#include "stm32f10x.h"

/*
 * USART2 驱动
 * TX：PA2
 * RX：PA3
 * 用途：STM32 与 ESP8266 之间的通信链路
 */
#define USART2_ESP8266_BAUDRATE         115200U
#define USART2_ESP8266_RX_BUFFER_SIZE   256U

/* 对外提供的初始化、发送、读取和接收缓存状态接口。 */
void USART2_ESP8266_Init(void);
void USART2_ESP8266_SendByte(uint8_t Byte);
void USART2_ESP8266_SendBuffer(const uint8_t *Buffer, uint16_t Length);
void USART2_ESP8266_SendString(const char *String);
uint8_t USART2_ESP8266_ReadByte(uint8_t *Byte);
uint16_t USART2_ESP8266_ReadBuffer(uint8_t *Buffer, uint16_t BufferSize);
uint16_t USART2_ESP8266_GetRxCount(void);
uint8_t USART2_ESP8266_GetRxFlag(void);
void USART2_ESP8266_ClearRxFlag(void);
uint8_t USART2_ESP8266_GetOverflowFlag(void);
void USART2_ESP8266_ClearOverflowFlag(void);
void USART2_ESP8266_ClearRxBuffer(void);
void USART2_ESP8266_IRQHandler(void);

#endif
