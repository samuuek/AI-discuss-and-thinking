# 思屿 DeepSeek API Key 安全配置设计

日期：2026-08-21

## 1. 目标

让思屿的唯一用户直接在网站“对话服务”中填写、测试、保存和删除 DeepSeek API Key，不再为了模型密钥进入 Vercel。保存后的 Key 可供网页版和通过同一后端访问的小程序使用，并且不会以明文进入浏览器存储、Neon、接口响应、日志、Git 或本地归档。

第一版只支持 DeepSeek。豆包、千问和自定义 OpenAI 兼容接口仍显示为“待配置”，不在本次范围内。

## 2. 已选方案

采用“服务端加密凭据库”：浏览器只在用户输入和提交时短暂持有 Key；Vercel Function 使用 AES-256-GCM 加密后把密文保存到 Neon；模型请求发生时在服务端内存中临时解密。

加密根密钥由现有高强度 `SIYU_PRIVATE_ACCESS_TOKEN` 通过 HKDF-SHA256 派生，因此不需要新增 Vercel 环境变量。这个选择符合“不再手动配置 Vercel”的要求，同时保留服务端加密和多设备共享。

未选择的方案：

- 浏览器本地保存：无法安全同步到其他设备，且 XSS 风险更高。
- 新增独立主密钥环境变量：密钥职责分离更理想，但仍要求手动进入 Vercel，违背本次主要目标。

## 3. 安全边界

- `SIYU_PRIVATE_ACCESS_TOKEN` 继续负责整个私人空间的访问认证，同时作为凭据加密根材料；它不通过任何接口返回。
- DeepSeek Key 只在密码输入框、一次 HTTPS 请求、Vercel Function 内存和发往 DeepSeek 的 HTTPS 请求中出现明文。
- 浏览器不得把 DeepSeek Key 写入 `localStorage`、`sessionStorage`、URL、错误信息或分析事件。
- Neon 只保存密文、随机 IV、认证标签、版本、模型 ID 和更新时间。
- 读取配置状态时只返回“是否已保存、模型 ID、更新时间”；不返回 Key、尾号或任何可用于猜测 Key 的片段。
- 第一版固定 DeepSeek 官方 Base URL `https://api.deepseek.com`，不允许用户编辑，避免把服务器变成任意地址请求器。
- 所有配置接口沿用私人 Bearer 认证并返回 `Cache-Control: no-store`。

## 4. 加密格式

使用 Node.js `crypto`：

1. HKDF-SHA256：输入为规范化后的 `SIYU_PRIVATE_ACCESS_TOKEN`，固定 salt 为 `siyu-model-credential-v1`，info 为 `deepseek`，派生 32 字节密钥。
2. AES-256-GCM：每次保存生成新的 12 字节随机 IV。
3. 附加认证数据为 `siyu:model-credential:deepseek:v1`。
4. 密文、IV 和认证标签使用 base64url 编码；记录 `key_version = 1`。
5. 解密认证失败时不暴露底层异常，只返回“凭据需要重新保存”。

即使同一个 Key 重复保存，随机 IV 也应产生不同密文。篡改密文、IV、标签或附加认证数据必须导致解密失败。

如果以后直接轮换 `SIYU_PRIVATE_ACCESS_TOKEN`，旧凭据无法解密；页面应显示需要重新填写 DeepSeek Key。第一版不实现自动重包裹，因为当前口令轮换流程不提供旧值和新值同时可用的事务窗口。

## 5. 数据模型

Neon 和本地 SQLite 都增加同构表：

```sql
CREATE TABLE IF NOT EXISTS model_credentials (
  provider TEXT PRIMARY KEY,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  key_version INTEGER NOT NULL,
  model_id TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

SQLite 使用等价的 `TEXT` 时间字段。服务层只接受 `provider = 'deepseek'`。数据库存储层提供读取状态、读取加密记录、原子 upsert 和删除方法，不负责加解密。

迁移先于应用部署执行。`CREATE TABLE IF NOT EXISTS` 是向前兼容变更；回滚旧应用时多出的表不会影响现有议题、对话、周报或知识库。

## 6. 服务端接口

### `GET /api/model-configs/deepseek`

返回：

```json
{ "configured": true, "modelId": "...", "updatedAt": "..." }
```

没有保存时返回 `configured: false`。接口永不返回加密字段。

### `POST /api/model-configs/deepseek/test`

请求仅包含 `apiKey`。服务端对长度和格式做边界检查，然后使用该 Key 调用 DeepSeek 官方 `GET /models`。成功时返回经过筛选的模型 ID 列表。测试请求不保存 Key，也不调用生成接口，因此不产生对话生成 Token。

### `PUT /api/model-configs/deepseek`

请求包含 `apiKey` 和 `modelId`。服务端再次调用 `GET /models`，确认 Key 有效且模型存在；随后加密并原子保存。不能仅凭浏览器先前的测试结果跳过服务端复验。

### `DELETE /api/model-configs/deepseek`

删除 DeepSeek 加密记录，返回 `{ "deleted": true }`。删除后 `/api/models` 立即把 DeepSeek API 标记为不可用，但免费网页版不受影响。

### 现有模型接口调整

- `GET /api/models`：DeepSeek 的 `available` 在“Neon 中存在可解密凭据”或环境变量 `DEEPSEEK_API_KEY` 存在时为真。
- `POST /api/chat`：DeepSeek 优先使用加密凭据；没有加密凭据时保留环境变量回退，确保兼容旧部署。
- 解密出的 Key 只作为函数局部变量存在，不缓存到模块全局状态。

## 7. DeepSeek 连接适配器

DeepSeek 适配器固定官方域名，并集中实现：

- 列出模型；
- 把 401/403 映射为“API Key 无效或无权限”；
- 把余额、限流和服务异常映射为不含上游响应正文的中文错误；
- 对外只返回白名单字段，绝不透传响应头、请求对象或供应商原始错误正文；
- 设置连接与响应超时，失败后不保存凭据。

聊天继续使用官方 `/chat/completions`，模型 ID 使用用户测试后选择并保存的当前 ID，避免硬编码已过期模型名称。

## 8. 网站界面

“对话服务 → API 高级配置 → DeepSeek”展开后显示：

- 当前状态：“未配置”或“已安全保存”；
- `type="password"` 的 API Key 输入框，不回填旧 Key；
- “测试连接”按钮；
- 测试成功后出现由官方 `/models` 返回的模型下拉框；
- “保存配置”按钮，只有当前输入测试成功并选择模型后可用；
- 已配置状态下的“删除配置”按钮和二次确认；
- 提示“测试只读取模型列表，不生成对话内容；实际对话可能产生 DeepSeek API 费用”。

关闭弹窗、保存成功或删除后立即清空输入框和内存中的 Key。失败信息只说明无效、超时、余额/限流或服务异常，不展示 Key 和上游正文。

保存成功后刷新模型列表，思考空间中的 DeepSeek API 选项变为可选。DeepSeek 免费网页版继续保留并与 API 入口清楚区分。

## 9. 错误处理与恢复

- 未设置 `SIYU_PRIVATE_ACCESS_TOKEN`：拒绝保存并提示先启用私人访问保护。
- Key 无效或模型不存在：不保存，保留输入框供用户修改。
- Neon 写入失败：不改变旧凭据，返回“保存失败，请重试”。
- 密文损坏或口令已轮换：不尝试猜测或回退明文，标记为需要重新保存。
- DeepSeek 暂时不可用：保留已保存凭据，不自动删除；聊天可切换到免费网页版。
- 删除请求失败：界面仍显示原配置状态，不能伪装成已经删除。

## 10. 测试策略

先写失败测试，再实现：

- 加密单元测试：往返、随机 IV、篡改检测、错误脱敏、缺少根密钥。
- SQLite/Postgres 存储测试：upsert、读取状态、删除、旧数据不受影响。
- DeepSeek 适配器测试：模型列表白名单、认证失败、超时、上游正文不泄漏。
- HTTP 测试：所有配置接口需要私人认证；测试不持久化；保存会复验并只写密文；读取不返回 Key；删除生效；聊天使用解密凭据并保留环境变量回退。
- React 测试：密码输入不回填、不进入本地存储；测试成功才允许保存；关闭后清空；删除确认；中文错误可见。
- 回归测试：现有网页测试、类型检查、构建，小程序测试、云函数测试和构建全部通过。
- 安全扫描：Git、归档、日志和接口响应中没有真实 Key、`.env` 或连接串。

## 11. 部署与验收

1. 在 Neon 执行只新增 `model_credentials` 表的迁移并核验现有 6 张表不变、新表存在。
2. 推送预览分支，等待 Vercel Preview `Ready`。
3. 在 Preview 中完成：输入测试 Key、列出模型、保存、刷新仍显示已配置、发起一次对话、删除、确认不可用。
4. 不在自动化输出或截图中暴露用户真实 Key；真实 Key 只能由用户在浏览器中输入，或者从用户明确授权的本机安全环境读入进程内存。
5. 推送 `main` 并等待 Production `Ready`。
6. Production 验证健康检查、私人访问、保存状态跨刷新、DeepSeek 对话、删除与免费网页版回退。
7. 更新 `D:\AI思屿` 使用指导、AI 接续说明、源码快照和 SHA-256 清单。

验收标准：用户无需进入 Vercel 即可在思屿网站完成 DeepSeek Key 的测试、加密保存、跨刷新读取状态、真实对话和删除；任何浏览器读取接口、日志、Git 或归档都不能得到明文 Key。
