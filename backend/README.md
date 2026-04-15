## 项目结构说明

完整代码已按模块拆分到以下文件中：

- **server.js**  
  负责创建 Express 应用、挂载路由、启动服务监听以及实现优雅关闭逻辑。

- **config/index.js**  
  统一管理环境变量、数据库配置、服务运行参数以及全局消息文案。

- **routes/parcelRoutes.js**  
  定义所有路由规则。

- **controllers/parcelController.js**  
  仅处理请求（req）与响应（res），不包含业务逻辑。

- **services/lockerService.js**  
  提供 `createLockerService` 及全部核心业务逻辑。

- **models/db.js**  
  封装 MySQL 连接池、建库建表操作以及连接关闭方法。

- **utils/phone.js**  
  提供手机号相关的校验与处理工具。

- **utils/format.js**  
  负责数据格式化与柜体状态组装。

- **utils/common.js**  
  包含 `AppError`、`asyncHandler`、CORS 跨域配置及其他通用工具函数。

- **middleware/errorHandler.js**  
  实现统一的错误处理中间件。