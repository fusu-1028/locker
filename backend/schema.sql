CREATE DATABASE IF NOT EXISTS smart_locker
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE smart_locker;

DROP TABLE IF EXISTS device_log;
DROP TABLE IF EXISTS parcel_order;
DROP TABLE IF EXISTS cabinet;

CREATE TABLE cabinet (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  code VARCHAR(32) NOT NULL COMMENT '柜子编号',
  status TINYINT NOT NULL DEFAULT 1 COMMENT '柜子状态：1正常，0故障',
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='柜子表';

CREATE TABLE parcel_order (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  phone VARCHAR(20) NOT NULL COMMENT '用户手机号',
  pickup_code VARCHAR(20) NOT NULL COMMENT '取件码',
  status TINYINT NOT NULL DEFAULT 1 COMMENT '订单状态：1待确认存件，2待取件，3已取件',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  INDEX idx_parcel_order_phone (phone),
  INDEX idx_parcel_order_pickup_code (pickup_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单表';

CREATE TABLE device_log (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  order_id INT UNSIGNED NULL COMMENT '订单ID，可为空',
  type VARCHAR(20) NOT NULL COMMENT '操作类型，例如：CONFIRM / OPEN / FAIL',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '时间',
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='设备日志表';

INSERT INTO cabinet (code, status)
VALUES ('CAB001', 1);

INSERT INTO parcel_order (phone, pickup_code, status)
VALUES ('13800138000', '123456', 1);

INSERT INTO device_log (order_id, type)
VALUES (1, 'CREATE');

-- 常用 SQL 示例（按需执行）

-- 1. 插入订单（存件）
-- INSERT INTO parcel_order (phone, pickup_code, status)
-- VALUES ('13900001111', '654321', 1);

-- 2. 更新为“已确认存件（待取件）”
-- UPDATE parcel_order
-- SET status = 2, update_time = NOW()
-- WHERE pickup_code = '654321' AND status = 1;

-- 3. 根据手机号查询订单
-- SELECT id, phone, pickup_code, status, create_time, update_time
-- FROM parcel_order
-- WHERE phone = '13900001111'
-- ORDER BY id DESC;

-- 4. 根据取件码查询订单
-- SELECT id, phone, pickup_code, status, create_time, update_time
-- FROM parcel_order
-- WHERE pickup_code = '654321'
-- ORDER BY id DESC
-- LIMIT 1;

-- 5. 更新为“已取件”
-- UPDATE parcel_order
-- SET status = 3, update_time = NOW()
-- WHERE pickup_code = '654321' AND status = 2;

-- 6. 插入日志记录
-- INSERT INTO device_log (order_id, type)
-- VALUES (1, 'CONFIRM');
