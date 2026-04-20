#include "Relay.h"
#include "Delay.h"

void Relay_Init(void)
{
    GPIO_InitTypeDef GPIO_InitStructure;

    RCC_APB2PeriphClockCmd(RELAY_GPIO_CLK, ENABLE);

    /*
     * 先把输出数据寄存器置高，避免 GPIO 从复位态切到输出模式时
     * 短暂输出低电平导致继电器误吸合。
     */
    GPIO_SetBits(RELAY_GPIO_PORT, RELAY_GPIO_PIN);

    GPIO_InitStructure.GPIO_Pin = RELAY_GPIO_PIN;
    GPIO_InitStructure.GPIO_Mode = GPIO_Mode_Out_PP;
    GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(RELAY_GPIO_PORT, &GPIO_InitStructure);

    Relay_Off();
}

void Relay_On(void)
{
    /* 低电平触发：拉低控制脚使继电器吸合。 */
    GPIO_ResetBits(RELAY_GPIO_PORT, RELAY_GPIO_PIN);
}

void Relay_Off(void)
{
    /* 高电平为关闭态，上电默认保持该状态。 */
    GPIO_SetBits(RELAY_GPIO_PORT, RELAY_GPIO_PIN);
}

void Lock_Open(uint32_t ms)
{
    if (ms == 0U)
    {
        return;
    }

    /*
     * 电磁锁不能长时间通电，这里做一个上限保护。
     * 如果调用者传入过大的时长，会自动裁剪到 10 秒。
     */
    if (ms > LOCK_OPEN_MAX_MS)
    {
        ms = LOCK_OPEN_MAX_MS;
    }

    Relay_On();
    Delay_ms(ms);
    Relay_Off();
}
