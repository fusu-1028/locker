#ifndef __TTP229_H
#define __TTP229_H

#include "stm32f10x.h"

#define TTP229_KEY_COUNT        16U

void TTP229_Init(void);
void TTP229_SDO_Output(void);
void TTP229_SDO_Input(void);
uint16_t TTP229_ReadRaw(void);
void TTP229_Scan(void);
uint16_t TTP229_GetKey(void);
uint16_t TTP229_GetNewPress(void);

#endif
