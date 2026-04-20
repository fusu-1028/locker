#include "TTP229.h"
#include "Delay.h"

#define TTP229_GPIO_CLK                 RCC_APB2Periph_GPIOA
#define TTP229_SCL_PORT                 GPIOA
#define TTP229_SCL_PIN                  GPIO_Pin_4
#define TTP229_SDO_PORT                 GPIOA
#define TTP229_SDO_PIN                  GPIO_Pin_5

#define TTP229_START_HIGH_US            100U
#define TTP229_START_LOW_US             10U
#define TTP229_CLOCK_HALF_PERIOD_US     5U
#define TTP229_READ_GUARD_COUNT         20U

static uint16_t TTP229_CurrentKeys = 0xFFFFU;
static uint16_t TTP229_LastKeys = 0xFFFFU;
static uint16_t TTP229_NewPress = 0x0000U;

static void TTP229_SCL_OutputInit(void);

void TTP229_Init(void)
{
    RCC_APB2PeriphClockCmd(TTP229_GPIO_CLK, ENABLE);

    TTP229_SCL_OutputInit();
    TTP229_SDO_Input();

    GPIO_ResetBits(TTP229_SCL_PORT, TTP229_SCL_PIN);

    TTP229_CurrentKeys = 0xFFFFU;
    TTP229_LastKeys = 0xFFFFU;
    TTP229_NewPress = 0x0000U;
}

void TTP229_SDO_Output(void)
{
    GPIO_InitTypeDef GPIO_InitStructure;

    GPIO_InitStructure.GPIO_Pin = TTP229_SDO_PIN;
    GPIO_InitStructure.GPIO_Mode = GPIO_Mode_Out_PP;
    GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(TTP229_SDO_PORT, &GPIO_InitStructure);
}

void TTP229_SDO_Input(void)
{
    GPIO_InitTypeDef GPIO_InitStructure;

    GPIO_InitStructure.GPIO_Pin = TTP229_SDO_PIN;
    GPIO_InitStructure.GPIO_Mode = GPIO_Mode_IN_FLOATING;
    GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(TTP229_SDO_PORT, &GPIO_InitStructure);
}

uint16_t TTP229_ReadRaw(void)
{
    uint16_t value = 0x0000U;
    uint8_t bitIndex = 0U;
    uint32_t guard = TTP229_READ_GUARD_COUNT;

    /*
     * TTP229 2 线串行模式启动信号：
     * 1. SDO 切到输出
     * 2. 拉高约 100us
     * 3. 拉低约 10us
     * 4. 再切回输入，后续由模块驱动数据线
     */
    TTP229_SDO_Output();
    GPIO_SetBits(TTP229_SDO_PORT, TTP229_SDO_PIN);
    Delay_us(TTP229_START_HIGH_US);
    GPIO_ResetBits(TTP229_SDO_PORT, TTP229_SDO_PIN);
    Delay_us(TTP229_START_LOW_US);
    TTP229_SDO_Input();

    /*
     * 共读取 16 位，LSB first。
     * 按键低电平有效：0 表示按下，1 表示松开。
     * 这里使用固定 16 次加保护计数，避免异常情况下出现死循环。
     */
    while ((bitIndex < TTP229_KEY_COUNT) && (guard > 0U))
    {
        GPIO_SetBits(TTP229_SCL_PORT, TTP229_SCL_PIN);
        Delay_us(TTP229_CLOCK_HALF_PERIOD_US);

        GPIO_ResetBits(TTP229_SCL_PORT, TTP229_SCL_PIN);
        Delay_us(TTP229_CLOCK_HALF_PERIOD_US);

        if (GPIO_ReadInputDataBit(TTP229_SDO_PORT, TTP229_SDO_PIN) != Bit_RESET)
        {
            value |= (uint16_t)(1U << bitIndex);
        }

        bitIndex++;
        guard--;
    }

    /*
     * 如果保护计数提前耗尽，返回全 1，等价于“无按键按下”，
     * 这样不会误触发开锁逻辑。
     */
    if (bitIndex < TTP229_KEY_COUNT)
    {
        return 0xFFFFU;
    }

    return value;
}

void TTP229_Scan(void)
{
    TTP229_LastKeys = TTP229_CurrentKeys;
    TTP229_CurrentKeys = TTP229_ReadRaw();

    /*
     * 低电平按下：
     * last_keys 中对应位为 1，current_keys 中对应位变成 0，
     * 则 (~current_keys) & last_keys 会得到这一位的新按下边沿。
     */
    TTP229_NewPress = (uint16_t)(((~TTP229_CurrentKeys) & TTP229_LastKeys) & 0xFFFFU);
}

uint16_t TTP229_GetKey(void)
{
    return TTP229_CurrentKeys;
}

uint16_t TTP229_GetNewPress(void)
{
    return TTP229_NewPress;
}

static void TTP229_SCL_OutputInit(void)
{
    GPIO_InitTypeDef GPIO_InitStructure;

    GPIO_InitStructure.GPIO_Pin = TTP229_SCL_PIN;
    GPIO_InitStructure.GPIO_Mode = GPIO_Mode_Out_PP;
    GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(TTP229_SCL_PORT, &GPIO_InitStructure);
}
