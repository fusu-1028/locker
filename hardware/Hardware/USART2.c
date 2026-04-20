#include "USART2.h"

/*
 * USART2 硬件引脚定义：
 * TX -> PA2
 * RX -> PA3
 * 本模块专用于 ESP8266 通信。
 */
#define USART2_ESP8266_PORT         USART2
#define USART2_ESP8266_USART_CLK    RCC_APB1Periph_USART2
#define USART2_ESP8266_GPIO_CLK     (RCC_APB2Periph_GPIOA | RCC_APB2Periph_AFIO)
#define USART2_ESP8266_TX_PORT      GPIOA
#define USART2_ESP8266_TX_PIN       GPIO_Pin_2
#define USART2_ESP8266_RX_PORT      GPIOA
#define USART2_ESP8266_RX_PIN       GPIO_Pin_3

/* 中断接收环形缓冲区的状态变量。 */
static volatile uint8_t USART2_ESP8266_RxBuffer[USART2_ESP8266_RX_BUFFER_SIZE];
static volatile uint16_t USART2_ESP8266_RxHead;
static volatile uint16_t USART2_ESP8266_RxTail;
static volatile uint16_t USART2_ESP8266_RxCount;
static volatile uint8_t USART2_ESP8266_RxFlag;
static volatile uint8_t USART2_ESP8266_RxOverflowFlag;

static void USART2_ESP8266_GPIO_Init(void);
static void USART2_ESP8266_Config(void);
static void USART2_ESP8266_SendByteBlocking(uint8_t Byte);
static uint32_t USART2_EnterCritical(void);
static void USART2_ExitCritical(uint32_t Primask);

/* 初始化 ESP8266 通信所需的 GPIO、USART2 和接收中断。 */
void USART2_ESP8266_Init(void)
{
    NVIC_InitTypeDef NVIC_InitStructure;

    RCC_APB2PeriphClockCmd(USART2_ESP8266_GPIO_CLK, ENABLE);
    RCC_APB1PeriphClockCmd(USART2_ESP8266_USART_CLK, ENABLE);

    USART2_ESP8266_GPIO_Init();
    USART2_ESP8266_ClearRxBuffer();
    USART2_ESP8266_Config();

    USART_ITConfig(USART2_ESP8266_PORT, USART_IT_RXNE, ENABLE);

    NVIC_InitStructure.NVIC_IRQChannel = USART2_IRQn;
    NVIC_InitStructure.NVIC_IRQChannelPreemptionPriority = 1;
    NVIC_InitStructure.NVIC_IRQChannelSubPriority = 1;
    NVIC_InitStructure.NVIC_IRQChannelCmd = ENABLE;
    NVIC_Init(&NVIC_InitStructure);
}

/* 向 ESP8266 发送 1 个字节。 */
void USART2_ESP8266_SendByte(uint8_t Byte)
{
    USART2_ESP8266_SendByteBlocking(Byte);
}

/* 向 ESP8266 发送一段字节缓冲区。 */
void USART2_ESP8266_SendBuffer(const uint8_t *Buffer, uint16_t Length)
{
    uint16_t i;

    if ((Buffer == 0) || (Length == 0))
    {
        return;
    }

    for (i = 0; i < Length; i++)
    {
        USART2_ESP8266_SendByteBlocking(Buffer[i]);
    }
}

/* 向 ESP8266 发送以 \0 结尾的字符串。 */
void USART2_ESP8266_SendString(const char *String)
{
    if (String == 0)
    {
        return;
    }

    while (*String != '\0')
    {
        USART2_ESP8266_SendByteBlocking((uint8_t)*String);
        String++;
    }
}

/* 从中断驱动的环形缓冲区中读取 1 个字节。 */
uint8_t USART2_ESP8266_ReadByte(uint8_t *Byte)
{
    uint32_t Primask;

    if (Byte == 0)
    {
        return 0;
    }

    Primask = USART2_EnterCritical();

    if (USART2_ESP8266_RxCount == 0)
    {
        USART2_ExitCritical(Primask);
        return 0;
    }

    *Byte = USART2_ESP8266_RxBuffer[USART2_ESP8266_RxTail];
    USART2_ESP8266_RxTail++;
    if (USART2_ESP8266_RxTail >= USART2_ESP8266_RX_BUFFER_SIZE)
    {
        USART2_ESP8266_RxTail = 0;
    }
    USART2_ESP8266_RxCount--;

    USART2_ExitCritical(Primask);
    return 1;
}

/* 按给定长度上限尽可能多地读取接收数据。 */
uint16_t USART2_ESP8266_ReadBuffer(uint8_t *Buffer, uint16_t BufferSize)
{
    uint16_t Count = 0;

    if ((Buffer == 0) || (BufferSize == 0))
    {
        return 0;
    }

    while ((Count < BufferSize) && USART2_ESP8266_ReadByte(&Buffer[Count]))
    {
        Count++;
    }

    return Count;
}

/* 查询当前接收缓冲区中尚未读取的字节数。 */
uint16_t USART2_ESP8266_GetRxCount(void)
{
    uint16_t Count;
    uint32_t Primask = USART2_EnterCritical();

    Count = USART2_ESP8266_RxCount;

    USART2_ExitCritical(Primask);
    return Count;
}

/* 查询自上次清除标志后是否收到过新数据。 */
uint8_t USART2_ESP8266_GetRxFlag(void)
{
    uint8_t Flag;
    uint32_t Primask = USART2_EnterCritical();

    Flag = USART2_ESP8266_RxFlag;

    USART2_ExitCritical(Primask);
    return Flag;
}

/* 清除接收完成标志，不影响已缓存的数据。 */
void USART2_ESP8266_ClearRxFlag(void)
{
    uint32_t Primask = USART2_EnterCritical();

    USART2_ESP8266_RxFlag = 0;

    USART2_ExitCritical(Primask);
}

/* 查询是否因缓冲区满而发生过数据丢失。 */
uint8_t USART2_ESP8266_GetOverflowFlag(void)
{
    uint8_t Flag;
    uint32_t Primask = USART2_EnterCritical();

    Flag = USART2_ESP8266_RxOverflowFlag;

    USART2_ExitCritical(Primask);
    return Flag;
}

/* 清除接收溢出标志。 */
void USART2_ESP8266_ClearOverflowFlag(void)
{
    uint32_t Primask = USART2_EnterCritical();

    USART2_ESP8266_RxOverflowFlag = 0;

    USART2_ExitCritical(Primask);
}

/* 清空整个接收环形缓冲区状态。 */
void USART2_ESP8266_ClearRxBuffer(void)
{
    uint32_t Primask = USART2_EnterCritical();

    USART2_ESP8266_RxHead = 0;
    USART2_ESP8266_RxTail = 0;
    USART2_ESP8266_RxCount = 0;
    USART2_ESP8266_RxFlag = 0;
    USART2_ESP8266_RxOverflowFlag = 0;

    USART2_ExitCritical(Primask);
}

/* USART2 中断服务函数的实际处理逻辑。 */
void USART2_ESP8266_IRQHandler(void)
{
    uint16_t Status = USART2_ESP8266_PORT->SR;

    if ((Status & (USART_SR_RXNE | USART_SR_ORE | USART_SR_NE | USART_SR_FE | USART_SR_PE)) != 0U)
    {
        uint8_t Data = (uint8_t)(USART2_ESP8266_PORT->DR & 0x00FFU);

        if ((Status & USART_SR_RXNE) != 0U)
        {
            if (USART2_ESP8266_RxCount < USART2_ESP8266_RX_BUFFER_SIZE)
            {
                USART2_ESP8266_RxBuffer[USART2_ESP8266_RxHead] = Data;
                USART2_ESP8266_RxHead++;
                if (USART2_ESP8266_RxHead >= USART2_ESP8266_RX_BUFFER_SIZE)
                {
                    USART2_ESP8266_RxHead = 0;
                }
                USART2_ESP8266_RxCount++;
                USART2_ESP8266_RxFlag = 1;
            }
            else
            {
                USART2_ESP8266_RxOverflowFlag = 1;
            }
        }
    }
}

/* 将 PA2 配置为 TX，将 PA3 配置为 RX。 */
static void USART2_ESP8266_GPIO_Init(void)
{
    GPIO_InitTypeDef GPIO_InitStructure;

    GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;

    GPIO_InitStructure.GPIO_Mode = GPIO_Mode_AF_PP;
    GPIO_InitStructure.GPIO_Pin = USART2_ESP8266_TX_PIN;
    GPIO_Init(USART2_ESP8266_TX_PORT, &GPIO_InitStructure);

    GPIO_InitStructure.GPIO_Mode = GPIO_Mode_IN_FLOATING;
    GPIO_InitStructure.GPIO_Pin = USART2_ESP8266_RX_PIN;
    GPIO_Init(USART2_ESP8266_RX_PORT, &GPIO_InitStructure);
}

/* 按统一的 115200、8 位数据位、1 位停止位、无校验进行配置。 */
static void USART2_ESP8266_Config(void)
{
    USART_InitTypeDef USART_InitStructure;

    USART_StructInit(&USART_InitStructure);
    USART_InitStructure.USART_BaudRate = USART2_ESP8266_BAUDRATE;
    USART_InitStructure.USART_WordLength = USART_WordLength_8b;
    USART_InitStructure.USART_StopBits = USART_StopBits_1;
    USART_InitStructure.USART_Parity = USART_Parity_No;
    USART_InitStructure.USART_HardwareFlowControl = USART_HardwareFlowControl_None;
    USART_InitStructure.USART_Mode = USART_Mode_Tx | USART_Mode_Rx;
    USART_Init(USART2_ESP8266_PORT, &USART_InitStructure);

    USART_Cmd(USART2_ESP8266_PORT, ENABLE);
}

/* 底层阻塞发送辅助函数。 */
static void USART2_ESP8266_SendByteBlocking(uint8_t Byte)
{
    while (USART_GetFlagStatus(USART2_ESP8266_PORT, USART_FLAG_TXE) == RESET)
    {
    }

    USART_SendData(USART2_ESP8266_PORT, Byte);
}

/* 在访问环形缓冲区状态时进入临界区。 */
static uint32_t USART2_EnterCritical(void)
{
    uint32_t Primask = __get_PRIMASK();

    __disable_irq();

    return Primask;
}

/* 恢复进入临界区之前的中断屏蔽状态。 */
static void USART2_ExitCritical(uint32_t Primask)
{
    __set_PRIMASK(Primask);
}
