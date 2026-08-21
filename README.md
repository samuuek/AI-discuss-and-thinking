# 思屿：AI 讨论与思考空间

思屿是一个中文个人思考工作台：保存议题、对话、旁注和纪要，并汇集最近 7 天的 AI 官方动态。它既可以完全在本机运行，也可以部署到 Vercel，并用 Neon Postgres 保存云端数据。

## 功能概览

- 议题、思考空间与对话记录持久化
- DeepSeek 免费网页版问答往返，无需 API Key
- DeepSeek API 可在网站中测试、加密保存和停用；豆包、通义千问及 OpenAI 兼容 API 仍可选接入
- 从 OpenAI、Anthropic、Google DeepMind、Microsoft、Meta AI 和 Hugging Face 官方页面获取最近 7 天的消息
- 把同一份周报材料交给 DeepSeek、通义千问和 Kimi 网页版分析，并在导入至少两份结果后生成交叉对照

## 本地运行：SQLite 模式

需要 Node.js 22。

```bash
npm install
npm run dev
```

打开终端显示的前端地址。开发模式会同时启动前端和本地 API；前端把 `/api` 请求转发到 `http://127.0.0.1:8787`。

未设置 `DATABASE_URL` 时，服务默认使用 `data/siyu.db`。该目录已被 Git 忽略，不会随代码提交。可以通过 `SIYU_DATABASE` 指定另一个 SQLite 文件：

```dotenv
SIYU_DATABASE=data/siyu.db
```

本机仍兼容从 `.env` 读取 API 模型配置。DeepSeek 也可以在网页右上角“服务 → API 高级配置”中测试并保存：服务端必须先配置私人访问口令和独立的 32 字节 base64url 凭据主密钥。两者用途不同，禁止复用。`.env` 和 `.env.local` 都已加入忽略规则；不要把真实密钥提交到 Git。

## 免费网页模型如何工作

选择“DeepSeek · 免费网页版”后，思屿会把当前议题、最近对话和新问题整理成提示词并复制到剪贴板，然后打开 DeepSeek 官网。你在自己的账号中完成对话，再把回答粘贴回思屿保存。

AI 周报使用相同的安全往返方式：思屿只把页面中列出的官方公开材料整理为带编号的提示词，分别打开 DeepSeek、通义千问或 Kimi。模型账号、密码和登录状态不会交给思屿，也不会被项目读取。网页服务的免费额度、登录要求和可用性由各服务商决定。

## 云端运行：Vercel + Neon

云端函数要求配置 `DATABASE_URL`；未配置时 API 会返回“数据库服务未配置”，不会退回临时内存存储。

### 当前试用环境

- Vercel 项目：[`temporary-prompt-ridge-2fk9bxn`](https://temporary-prompt-ridge-2fk9bxn.vercel.app)
- GitHub 仓库：[`samuuek/AI-discuss-and-thinking`](https://github.com/samuuek/AI-discuss-and-thinking)
- Neon 项目：`soft-voice-01969649`；数据库：`neondb`；分支：`br-shiny-thunder-af2oq7ij`
- 数据库结构：7 张业务表和索引（含加密模型凭据表；线上迁移状态以部署核验结果为准）
- 部署方式：已连接 GitHub，`main` 分支推送会创建 Production 源码部署，其他分支会创建 Preview 部署
- 访问保护：`SIYU_PRIVATE_ACCESS_TOKEN` 已在 Production 和 Preview 中保存为 Sensitive；Preview 还受 Vercel 登录保护
- 资源状态：仅使用 Vercel 与 Neon 免费资源，没有启用付费资源或自定义域名；剩余额度以两个服务控制台的实时 Usage 页面为准

### 1. 创建 Neon 数据库

1. 在 Neon 创建一个 Postgres 项目和数据库。
2. 在 Neon SQL Editor 中执行 [`server/schema.sql`](server/schema.sql)。该脚本可重复执行，会创建 7 张业务表、索引和初始议题。已有数据库只需执行具名迁移 [`server/migrations/2026-08-21-model-credentials.sql`](server/migrations/2026-08-21-model-credentials.sql)。
3. 从 Neon 获取连接字符串，但不要写入仓库中的任何文件。

### 2. 部署到 Vercel

1. 在 Vercel 导入本 GitHub 仓库，Framework Preset 选择 Vite。仓库中的 `vercel.json` 已配置构建目录、API 路由和单页应用回退。
2. 在项目的 **Settings → Environment Variables** 中配置 `DATABASE_URL`、`SIYU_PRIVATE_ACCESS_TOKEN`，并为凭据保险箱独立生成 `SIYU_CREDENTIAL_MASTER_KEY`（32 字节 base64url）。
3. 将三个变量设为 Sensitive。共享同一数据库的 Production 与 Preview 必须使用同一凭据主密钥；不要在构建日志、Issue 或截图中显示变量值。
4. 保存后向已连接的 GitHub 分支推送一次提交。Vercel 会运行 `npm run build`，部署地址以项目 Deployments 页面显示的 URL 为准。环境变量轮换后必须创建新部署，运行中的旧部署不会自动读取新值。

每个 Vercel 环境都应连接到预期的 Neon 数据库或分支。测试预览建议使用独立的 Neon 分支，避免测试数据进入正式库。

### 3. 上线检查

- 打开 `/api/health`，应返回 `{"ok":true,"database":"ready"}`，用于确认云端函数已读取数据库配置；它本身不会查询 Neon。
- 打开首页，新建一个测试议题，刷新页面后确认仍然存在。
- 打开“AI 周报”，获取官方消息并检查原文链接。
- 完成检查后删除测试数据，或回滚测试用 Neon 分支。

## 安全与回滚

- 个人使用时可在 Vercel 中把 `SIYU_PRIVATE_ACCESS_TOKEN` 保存为 Sensitive。启用后，网页会要求在当前设备输入口令，口令只保存在浏览器本地；健康检查仍保持公开且不会返回口令。
- DeepSeek Key 只以 AES-256-GCM 密文保存，读取接口不会返回明文；网页备份、Git 和小程序归档都排除模型凭据。删除网站配置后，旧环境变量不会静默重新启用它。
- 回滚应用代码时，在 Vercel Deployments 中选择上一个正常部署并 Promote/Redeploy。
- 数据库结构不会随代码回滚。变更 schema 前应先创建 Neon 分支或快照；需要回退时切回原分支/恢复备份，并同步更新 Vercel 的 `DATABASE_URL` 后重新部署。
- 删除 Vercel 项目不会自动删除 Neon 数据，删除 Neon 项目也不会自动移除 Vercel 环境变量，需要分别处理。

## 验证命令

```bash
npm test
npm run typecheck
npm run build
```

这些命令分别运行自动化测试、TypeScript 检查和生产构建。

## 微信小程序

微信测试版位于 [`miniapp`](miniapp)，使用 Taro + React 构建，与网站共用数据。编译、微信开发者工具导入和安卓手机预览步骤见 [`miniapp/README.md`](miniapp/README.md)。

日常使用、备份和故障排查见 [`docs/使用指导.md`](docs/使用指导.md)。后续使用新的 AI 账号接手维护时，先阅读 [`docs/AI接续说明.md`](docs/AI接续说明.md)。
