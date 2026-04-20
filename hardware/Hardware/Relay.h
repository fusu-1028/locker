#ifndef __RELAY_H
#define __RELAY_H

#include "stm32f10x.h"

/*
 * 当前文档里同时出现了 PA11 两个控制脚描述。
 * 这里默认按硬件接线说明使用 PA11 -> 继电器 IN。
 * 如果你的实际板子接的是 PB0，只需要修改下面这 3 个宏即可。
 */
#define RELAY_GPIO_CLK          RCC_APB2Periph_GPIOA
#define RELAY_GPIO_PORT         GPIOA
#define RELAY_GPIO_PIN          GPIO_Pin_11

/*
 * 低电平触发：
 * 输出低电平 -> 继电器吸合 -> 电磁锁通电缩回
 * 输出高电平 -> 继电器断开 -> 电磁锁断电弹出
 */
#define LOCK_OPEN_MAX_MS        10000U

void Relay_Init(void);
void Relay_On(void);
void Relay_Off(void);
void Lock_Open(uint32_t ms);

#endif
