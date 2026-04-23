# 单柜快递柜联调说明

## 1. 业务流程

1. 用户在小程序输入手机号发起存件。
2. 后端写入 `parcel_order` 订单并生成 6 位取件码，订单状态为 `1-待确认存件`。
3. 用户放入快递后，调用确认存件接口，订单状态更新为 `2-待取件`。
4. 用户可通过手机号查询是否存在待取件订单。
5. 用户在柜体键盘输入取件码，后端校验成功后返回开锁指令，同时把订单状态更新为 `3-已取件`。
6. 所有数据保留，不删除订单，只更新状态和设备日志。

## 2. 当前数据库

- `cabinet`
  - 柜子编号 `code`
  - 柜子状态 `status`
- `parcel_order`
  - 手机号 `phone`
  - 取件码 `pickup_code`
  - 订单状态 `status`
  - 创建时间 `create_time`
  - 更新时间 `update_time`
- `device_log`
  - 订单 ID `order_id`
  - 操作类型 `type`
  - 时间 `create_time`

## 3. 接口链路

### 存件

- `POST /api/parcels/store`
  - body:

```json
{
  "phone": "13800138000"
}
```

- `POST /api/parcels/store/confirm`
  - body:

```json
{
  "pickupCode": "123456",
  "source": "miniapp"
}
```

### 取件

- `POST /api/parcels/take`
  - body:

```json
{
  "phone": "13800138000"
}
```

- `POST /api/parcels/verify-pickup`
  - body:

```json
{
  "pickupCode": "123456",
  "source": "hardware"
}
```

- 兼容说明：
  旧的 `/api/hardware/*` 路径仍可访问，但正式联调与后续前后端对接统一使用 `/api/parcels/*`。

## 4. 硬件说明

- STM32 通过 TTP229 输入 6 位取件码。
- ESP8266 联网后调用 `/api/parcels/verify-pickup`。
- 后端校验成功后返回 `openDoor: true` 与 `durationMs`。
- 当前固件已改为“验码成功即视为取件完成”，不再额外等待取件确认。

## 5. 适合答辩的讲法

- 本系统采用单柜模型，只维护一个柜子。
- 数据库只保留 3 张表，结构简单，适合毕业设计演示。
- 订单状态使用 `1/2/3` 三个数字完成完整流转。
- 取件后订单不删除，方便演示历史数据和状态追踪。
