# 思屿日记微信小程序

这是“思屿日记”的微信小程序客户端，与现有网站共用 Vercel API 和 Neon 数据。`project.config.json` 已配置正式 AppID；发布前还需在微信公众平台配置合法请求域名。

## 本地编译

1. 在本目录运行 `npm install`。
2. 运行 `npm run dev:weapp`，持续生成 `dist` 目录。
3. 打开微信开发者工具，导入本 `miniapp` 目录；`project.config.json` 已使用正式 AppID。
4. 开发者工具中关闭“ES6 转 ES5”“上传代码时样式自动补全”和“上传时压缩代码”。本地预览阶段可保持“不校验合法域名”开启。
5. 点击“预览”，使用安卓手机微信扫码打开。

## 私人访问

如果线上服务启用了私人访问，小程序首次打开会要求输入口令。口令由用户手动输入，只保存在当前手机的微信本地存储，不在代码、安装包或 GitHub 中保存。

## 验证

```powershell
npm test
npm run typecheck
npm run build:weapp
```

正式发布前，在微信公众平台把 Vercel 的 HTTPS 域名加入 `request` 合法域名。不要把 `project.private.config.json`、本地环境文件、口令或数据库连接信息提交到 Git。
