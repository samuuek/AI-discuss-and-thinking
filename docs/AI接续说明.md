# 思屿 AI 接续说明

> 新的 AI 账号或新的维护任务开始后，先完整阅读本文件，再运行任何修改、部署或账号操作。

最后核验：2026-08-21

## 1. 项目定位

思屿是一个个人思考与知识沉淀系统，包含网页端和微信小程序端：

```text
网页 / 微信小程序
        │
        ├─ 网页：Vercel API ───────────────┐
        └─ 小程序：微信云函数 siyuApi ─────┤
                                           ▼
                                      Neon Postgres
```

网页和小程序共享议题、思考空间、对话、周报和知识库。小程序不在客户端保存网站口令，而由微信云函数使用加密环境变量访问 Vercel API。

## 2. 关键位置

- 当前实现工作树：`C:\Users\76518\Documents\ChatGPT\wangzhan\.worktrees\vercel-neon-preview`
- 当前开发分支：`codex/vercel-neon-preview`
- GitHub 远端名：`siyu`
- GitHub 仓库：<https://github.com/samuuek/AI-discuss-and-thinking>
- 本地总归档：`D:\AI思屿`
- 网页源码：仓库根目录的 `src`、`server`、`api`
- 微信小程序：`miniapp`
- 云函数：`miniapp/cloudfunctions/siyuApi`
- 数据库 schema：`server/schema.sql`

## 3. 在线资源

- Production：<https://temporary-prompt-ridge-2fk9bxn.vercel.app>
- Vercel 项目：`temporary-prompt-ridge-2fk9bxn`
- Vercel Project ID：`prj_cPHoVgxo6Sgwpa8Q8yV0pvPNEcnj`
- Vercel Team ID：`team_Wvaex201KZ5Tx15ncHrWvwsg`
- Neon 项目：`soft-voice-01969649`
- Neon 数据库：`neondb`
- Neon 分支：`br-shiny-thunder-af2oq7ij`
- 已核验 schema：6 张业务表及索引
- 资源约束：只使用免费资源；未启用付费资源和自定义域名

Preview 部署受 Vercel 登录保护，不能把 Preview URL 当作公开生产入口。最新地址以 Vercel Deployments 页面为准。

## 4. 密钥与隐私红线

无论用户是否授权账号操作，都不得在回复、终端输出、Git、截图、归档或日志中显示以下值：

- `DATABASE_URL`
- `SIYU_PRIVATE_ACCESS_TOKEN`
- `.env`、`.env.local` 的内容
- 微信云函数加密环境变量值
- Neon 连接字符串

允许记录变量名、保存位置、是否存在和是否生效，但不记录值。禁止归档或上传 `.env`、`.env.local`、`data`、`.vercel`、`exports`、`output`。本机 `.env.local` 只在用户明确授权的任务中读入进程内存，验证时只输出 HTTP 状态和记录数。

## 5. 已验证状态

2026-08-21 的本地证据：

- 网页 Vitest：18 个测试文件、78 项测试通过。
- 小程序 Vitest：10 个测试文件、27 项测试通过。
- 小程序归档工具：4 项 Node 测试通过。
- 微信云函数：24 项 Node 测试通过。
- 网页 TypeScript/生产构建通过。
- 小程序 TypeScript 检查与 Taro 微信构建通过。
- Production `/api/health` 返回 `ok=true`、`database=ready`。
- 使用本地保存的口令访问 Production `/api/models` 返回 HTTP 200；议题和周报读取成功。

不要把本节当作永久状态。每次宣称“可用”“测试通过”或“已部署”前，必须重新运行相应检查。

## 6. 新任务的标准开始步骤

1. 运行 `git status --short --branch`，先识别并保留用户已有修改。
2. 运行 `git fetch siyu`，比较 `codex/vercel-neon-preview`、`siyu/main` 和远端 Preview 分支；禁止 force push。
3. 阅读 `README.md`、`docs/使用指导.md`、`miniapp/README.md` 和与任务相关的测试。
4. 只检查密钥是否存在，不打印值。
5. 修改前运行基线测试；修改后重新运行完整测试、类型检查和构建。
6. 部署前核对 Git diff，确认敏感目录与生成物没有进入提交。
7. 外部网页或账号操作只使用用户明确授权的目标；涉及密钥传输时，在动作发生前再次确认具体值的类型和目标平台。

## 7. 关键验证命令

网页：

```powershell
cd "C:\Users\76518\Documents\ChatGPT\wangzhan\.worktrees\vercel-neon-preview"
npm test
npm run typecheck
npm run build
```

小程序：

```powershell
cd "C:\Users\76518\Documents\ChatGPT\wangzhan\.worktrees\vercel-neon-preview\miniapp"
npm test
npm run test:cloud
npm run typecheck
npm run build:weapp
```

Git 安全检查：

```powershell
git status --short
git diff --check
git ls-files | Select-String -Pattern '(^|/)(\.env|\.env\.local|data|\.vercel|exports|output)(/|$)'
```

## 8. 已知边界

- Vercel 免费域名在中国大陆网络可能偶发不可达，没有备案或可用性承诺。
- 微信小程序调用超时通常表示云环境未开通、`siyuApi` 未部署或云函数环境变量缺失。
- 首个成功调用云函数的微信账号会成为私人空间所有者；更换微信账号不是普通登录切换，需要先评估数据归属和重置方式。
- “免费网页版 AI”是提示词复制、外部网站对话、结果粘贴回思屿的人工往返，不应尝试读取或自动化用户的第三方账号密码。
- Preview 受 Vercel SSO 保护；Production 由思屿自己的私人访问口令保护。

## 9. 本地归档结构

```text
D:\AI思屿
├─ 00-文档
├─ 01-当前源码
├─ 02-微信小程序历史包
├─ 03-网页历史上传包
├─ 04-设计资料
├─ 05-图标与快捷方式
└─ 06-校验记录
```

`06-校验记录\SHA256SUMS.txt` 用于核对归档文件是否被意外修改。历史 ZIP 只用于追溯；继续开发应以 Git 远端和 `01-当前源码` 的安全快照为准。
