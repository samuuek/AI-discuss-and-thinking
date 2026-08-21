# 思屿日记微信小程序

这是“思屿日记”的微信小程序客户端，通过微信云函数安全连接现有 Vercel API 和 Neon 数据，因此网页与小程序共用议题、对话、周报和知识库。`project.config.json` 已配置正式 AppID。

## 本地编译

1. 在本目录运行 `npm install`。
2. 运行 `npm run dev:weapp`，持续生成 `dist` 目录。
3. 打开微信开发者工具，导入本 `miniapp` 目录；`project.config.json` 已使用正式 AppID。
4. 开发者工具中关闭“ES6 转 ES5”“上传代码时样式自动补全”和“上传时压缩代码”。本地预览阶段可保持“不校验合法域名”开启。
5. 点击“预览”，使用安卓手机微信扫码打开。

## 首次开通微信云开发

1. 在微信开发者工具中打开本项目，点击工具栏“云开发”，创建或选择一个免费环境。
2. 如需固定环境，在编译前设置 `TARO_APP_CLOUD_ENV_ID`；不设置时使用该小程序的默认云环境。
3. 在云环境中创建并部署 `siyuApi` 云函数，选择“云端安装依赖”。
4. 为 `siyuApi` 配置两个加密环境变量：`SIYU_WEB_API_BASE_URL` 和 `SIYU_PRIVATE_ACCESS_TOKEN`。值只在微信云开发和 Vercel 后台录入，不写入代码或归档。
5. 再次编译并预览。首次成功访问的微信账号会成为此私人空间的唯一账号。

小程序端通过微信云函数通信，不依赖客户端直接请求 Vercel；公众平台中已有的 `request` 合法域名可保留，但不是该架构的必要条件。

## 私人访问

网页版继续使用私人访问口令。小程序不要求用户输入该口令，口令只作为云函数访问网页版数据的加密环境变量；小程序通过微信账号身份锁定私人空间。

## 验证

```powershell
npm test
npm run test:cloud
npm run typecheck
npm run build:weapp
```

创建不含本地密钥、缓存和依赖目录的可导入归档：

```powershell
npm run archive -- "C:\目标目录\思屿日记-小程序.zip"
```

不要把 `project.private.config.json`、本地环境文件、口令或数据库连接信息提交到 Git。只有将来改回“小程序客户端直连 Vercel”时，才需要维护公众平台的 `request` 合法域名。
