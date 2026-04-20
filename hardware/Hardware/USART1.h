#ifndef __USART1_H
#define __USART1_H

#include "stm32f10x.h"

/*
 * USART1 驱动
 * TX：PA9
 * RX：PA10
 * 用途：电脑调试串口、printf 重定向、调试通信
 */
#define USART1_DEBUG_BAUDRATE   115200U

/* 对外提供的初始化、发送与调试接收接口。 */
void USART1_DebugInit(void);
void USART1_DebugSendByte(uint8_t Byte);
void USART1_DebugSendBuffer(const uint8_t *Buffer, uint16_t Length);
void USART1_DebugSendString(const char *String);
uint8_t USART1_DebugReadByte(uint8_t *Byte);

#endif
