#include "USART1.h"
#include <stdio.h>

/*
 * USART1 硬件引脚定义：
 * TX -> PA9
 * RX -> PA10
 * 本模块专用于电脑调试输出。
 */
#define USART1_DEBUG_PORT            USART1
#define USART1_DEBUG_USART_CLK       RCC_APB2Periph_USART1
#define USART1_DEBUG_GPIO_CLK        (RCC_APB2Periph_GPIOA | RCC_APB2Periph_AFIO)
#define USART1_DEBUG_TX_PORT         GPIOA
#define USART1_DEBUG_TX_PIN          GPIO_Pin_9
#define USART1_DEBUG_RX_PORT         GPIOA
#define USART1_DEBUG_RX_PIN          GPIO_Pin_10

static void USART1_DebugGPIO_Init(void);
static void USART1_DebugConfig(void);
static void USART1_SendByteBlocking(uint8_t Byte);

/* 配置电脑调试串口对应的 GPIO 和 USART 寄存器。 */
void USART1_DebugInit(void)
{
    RCC_APB2PeriphClockCmd(USART1_DEBUG_GPIO_CLK, ENABLE);
    RCC_APB2PeriphClockCmd(USART1_DEBUG_USART_CLK, ENABLE);

    USART1_DebugGPIO_Init();
    USART1_DebugConfig();
}

/* 以阻塞方式通过 USART1 发送 1 个字节。 */
void USART1_DebugSendByte(uint8_t Byte)
{
    USART1_SendByteBlocking(Byte);
}

/* 通过 USART1 发送一段字节缓冲区。 */
void USART1_DebugSendBuffer(const uint8_t *Buffer, uint16_t Length)
{
    uint16_t i;

    if ((Buffer == 0) || (Length == 0))
    {
        return;
    }

    for (i = 0; i < Length; i++)
    {
        USART1_SendByteBlocking(Buffer[i]);
    }
}

/* 通过 USART1 发送以 \0 结尾的字符串。 */
void USART1_DebugSendString(const char *String)
{
    if (String == 0)
    {
        return;
    }

    while (*String != '\0')
    {
        USART1_SendByteBlocking((uint8_t)*String);
        String++;
    }
}

/* 当接收寄存器非空时，读取 1 个字节。 */
uint8_t USART1_DebugReadByte(uint8_t *Byte)
{
    if ((Byte == 0) || (USART_GetFlagStatus(USART1_DEBUG_PORT, USART_FLAG_RXNE) == RESET))
    {
        return 0;
    }

    *Byte = (uint8_t)USART_ReceiveData(USART1_DEBUG_PORT);
    return 1;
}

/* 将 PA9 配置为 TX，将 PA10 配置为 RX。 */
static void USART1_DebugGPIO_Init(void)
{
    GPIO_InitTypeDef GPIO_InitStructure;

    GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;

    GPIO_InitStructure.GPIO_Mode = GPIO_Mode_AF_PP;
    GPIO_InitStructure.GPIO_Pin = USART1_DEBUG_TX_PIN;
    GPIO_Init(USART1_DEBUG_TX_PORT, &GPIO_InitStructure);

    GPIO_InitStructure.GPIO_Mode = GPIO_Mode_IN_FLOATING;
    GPIO_InitStructure.GPIO_Pin = USART1_DEBUG_RX_PIN;
    GPIO_Init(USART1_DEBUG_RX_PORT, &GPIO_InitStructure);
}

/* 按统一的 115200、8 位数据位、1 位停止位、无校验进行配置。 */
static void USART1_DebugConfig(void)
{
    USART_InitTypeDef USART_InitStructure;

    USART_StructInit(&USART_InitStructure);
    USART_InitStructure.USART_BaudRate = USART1_DEBUG_BAUDRATE;
    USART_InitStructure.USART_WordLength = USART_WordLength_8b;
    USART_InitStructure.USART_StopBits = USART_StopBits_1;
    USART_InitStructure.USART_Parity = USART_Parity_No;
    USART_InitStructure.USART_HardwareFlowControl = USART_HardwareFlowControl_None;
    USART_InitStructure.USART_Mode = USART_Mode_Tx | USART_Mode_Rx;
    USART_Init(USART1_DEBUG_PORT, &USART_InitStructure);

    USART_Cmd(USART1_DEBUG_PORT, ENABLE);
}

/* 底层阻塞发送辅助函数。 */
static void USART1_SendByteBlocking(uint8_t Byte)
{
    while (USART_GetFlagStatus(USART1_DEBUG_PORT, USART_FLAG_TXE) == RESET)
    {
    }

    USART_SendData(USART1_DEBUG_PORT, Byte);
}

#if defined(__CC_ARM)
#pragma import(__use_no_semihosting_swi)

struct __FILE
{
    int handle;
};

FILE __stdout;
FILE __stdin;

/*
 * 将 printf/scanf 重定向到 USART1。
 * 这样在文件拆分后仍能保持原有调试输出行为不变。
 */
int fputc(int ch, FILE *f)
{
    (void)f;

    if (ch == '\n')
    {
        USART1_DebugSendByte('\r');
    }

    USART1_DebugSendByte((uint8_t)ch);

    return ch;
}

int fgetc(FILE *f)
{
    uint8_t Data;

    (void)f;

    while (USART1_DebugReadByte(&Data) == 0)
    {
    }

    return Data;
}

void _sys_exit(int x)
{
    (void)x;
}

void _ttywrch(int ch)
{
    USART1_DebugSendByte((uint8_t)ch);
}
#endif
