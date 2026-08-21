# 思屿 DeepSeek API Key 安全配置设计（可实施性复核版）

日期：2026-08-21

## 1. 目标与范围

让思屿的唯一用户直接在网站“对话服务”中填写、测试、保存、停用和删除 DeepSeek API Key，不再要求用户手动进入 Vercel。保存后的 Key 仅由服务端使用，不以明文进入浏览器存储、Neon、接口响应、日志、Git 或本地归档。

第一版只支持网页版的 DeepSeek API 对话。小程序继续使用现有网页跳转方案；后续若增加小程序原生对话，可以复用同一后端凭据解析器，但不在本次范围内。豆包、千问和自定义 OpenAI 兼容接口仍显示为“待配置”。

## 2. 已选方案

采用“服务端加密凭据库”：浏览器只在用户输入和提交时短暂持有 Key；Vercel Function 使用 AES-256-GCM 加密后把密文保存到 Neon；模型请求发生时在服务端函数的局部变量中临时解密。

加密根密钥使用独立的 `SIYU_CREDENTIAL_MASTER_KEY`：它必须是随机生成的 32 字节值，以 base64url 形式保存为 Vercel Sensitive 环境变量。该变量由部署流程一次性自动配置，用户不需要进入 Vercel，也不得把它写入 `.env`、`.env.local`、日志、Git、截图或归档。

`SIYU_PRIVATE_ACCESS_TOKEN` 只负责用户访问认证，不再兼任加密密钥。这样即使私人访问口令较短或以后轮换，也不会削弱或破坏已保存的模型凭据。

未选择的方案：

- 浏览器本地保存：无法安全同步到其他设备，且 XSS 风险更高。
- 从私人访问口令派生加密密钥：HKDF 不能增加短口令的熵，同时会把登录口令轮换与凭据解密绑定。
- 明文保存到 Neon：数据库泄露会直接暴露供应商 Key。

## 3. 安全边界与威胁模型

- 所有 `/api/model-configs/*` 接口必须同时满足：已配置非空的 `SIYU_PRIVATE_ACCESS_TOKEN`，且请求携带正确 Bearer Token。即使站点其他接口允许无口令模式，凭据接口也必须失败关闭。
- DeepSeek Key 只会在密码输入框、一次同源 HTTPS 请求、Vercel Function 当前调用的内存，以及发往 DeepSeek 官方域名的 HTTPS 请求中短暂出现明文。
- 浏览器不得把 Key 写入 `localStorage`、`sessionStorage`、URL、错误信息、分析事件或密码回填状态。
- Neon 只保存密文、随机 IV、认证标签、版本、供应商模型 ID、状态和更新时间。
- 读取配置状态时只返回安全状态、来源、模型 ID 和更新时间；不返回 Key、密文、尾号或任何可用于猜测 Key 的片段。
- 第一版固定 DeepSeek 官方 Base URL `https://api.deepseek.com`，不允许用户编辑；请求禁止跟随重定向。
- 所有凭据接口返回 `Cache-Control: no-store`，服务端不得记录请求体、Authorization 或上游原始正文。
- 备份、导出和本地归档必须显式排除 `model_credentials`，即使其中只有密文。

本方案主要防护“仅数据库内容泄露”场景。它不能保护已经控制浏览器脚本的攻击者、同时获得 Bearer Token 与数据库的攻击者、已控制 Vercel 运行时的攻击者，或正在执行中的合法请求。JavaScript 无法保证内存物理清零；这里的承诺是尽量缩短明文生命周期。删除是应用层逻辑删除，不能保证立即清除 Neon 的备份、WAL 或已经运行的请求。

## 4. 加密格式与主密钥

使用 Node.js 22 内置 `crypto`：

1. 启动或首次使用时把 `SIYU_CREDENTIAL_MASTER_KEY` 按 base64url 解码，必须恰好得到 32 字节，否则凭据功能失败关闭。
2. 使用 HKDF-SHA256 从主密钥派生供应商专用密钥：salt 为 `siyu-model-credential-v1`，info 为 `provider:deepseek`，输出 32 字节。
3. 使用 AES-256-GCM；每次保存生成新的 12 字节随机 IV。
4. AAD 使用稳定序列化后的 `provider`、`key_version`、`provider_model_id` 和记录状态，防止数据库写入者替换影响计费或行为的模型元数据。
5. 密文、IV 和认证标签使用 base64url 编码；当前 `key_version = 1`。
6. 解密前校验版本、IV 长度和标签长度；认证失败时只返回“凭据需要重新填写”。

相同 Key 重复保存也必须产生不同密文。篡改密文、IV、标签、模型 ID、版本或 AAD 中的任何字段都必须导致认证失败。

主密钥轮换第一版不自动完成重加密。若主密钥缺失、错误或被替换，页面显示“需要重新填写”，不能静默使用旧环境变量。私人访问口令可以独立轮换，不影响已保存凭据。

## 5. 数据模型与迁移

Neon 和本地 SQLite 增加同构表：

```sql
CREATE TABLE IF NOT EXISTS model_credentials (
  provider TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('ready', 'disabled')),
  ciphertext TEXT,
  iv TEXT,
  auth_tag TEXT,
  key_version INTEGER,
  provider_model_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (status = 'ready' AND ciphertext IS NOT NULL AND iv IS NOT NULL
      AND auth_tag IS NOT NULL AND key_version IS NOT NULL
      AND provider_model_id IS NOT NULL)
    OR
    (status = 'disabled' AND ciphertext IS NULL AND iv IS NULL
      AND auth_tag IS NULL AND key_version IS NULL
      AND provider_model_id IS NULL)
  )
);
```

SQLite 使用等价的 `TEXT` 时间字段。服务层只接受 `provider = 'deepseek'`。数据库存储层只提供读取记录、原子 upsert `ready`、原子 upsert `disabled` 和物理清理测试数据的方法，不负责加解密。

迁移以独立、具名、可重复执行的 SQL 文件提交。部署前记录并核验目标 Neon 项目、分支、数据库、表结构和约束；应用代码只有在迁移门禁通过后才允许推广。旧应用忽略新增表，不影响现有议题、对话、周报和知识库。

若表缺失，凭据接口返回脱敏的 `503 CREDENTIAL_STORE_UNAVAILABLE`；`/api/models` 和私人访问页面仍应正常工作，DeepSeek 只按旧环境变量兼容规则解析，不能让迁移错误锁死整个站点。

## 6. 凭据状态与解析优先级

对外安全状态固定为：

- `unconfigured`：没有凭据记录，也没有可用的旧环境变量。
- `ready`：加密记录可成功解密，或没有记录但旧环境变量完整可用。
- `needs_reentry`：存在 `ready` 记录，但主密钥、密文、版本或认证元数据无效。
- `disabled`：用户已在网站停用 DeepSeek；该状态会抑制旧环境变量回退。

解析矩阵：

| 数据库记录 | 解密结果 | 旧环境变量 | 有效来源 | 对外状态 |
| --- | --- | --- | --- | --- |
| 无 | 不适用 | 完整 | `environment` | `ready` |
| 无 | 不适用 | 不完整/无 | 无 | `unconfigured` |
| `ready` | 成功 | 任意 | `vault` | `ready` |
| `ready` | 失败 | 任意 | 无 | `needs_reentry` |
| `disabled` | 不适用 | 任意 | 无 | `disabled` |

稳定的思屿网关模型 ID 继续使用 `deepseek-chat`，避免破坏已有工作区选择和接口白名单。凭据中保存的字段叫 `providerModelId`，仅用于调用 DeepSeek。旧环境变量回退保留现有的 `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL` 和 `DEEPSEEK_MODEL` 行为；一旦存在保险库记录，固定官方域名和已保存的供应商模型优先。

## 7. 服务端接口

### `GET /api/model-configs/deepseek`

返回安全状态，不读取或返回明文：

```json
{
  "status": "ready",
  "source": "vault",
  "providerModelId": "...",
  "updatedAt": "..."
}
```

`source` 只可能为 `vault`、`environment` 或 `null`。`needs_reentry` 和 `disabled` 不返回模型 ID。

### `POST /api/model-configs/deepseek/test`

请求仅包含 `apiKey`。服务端做长度、字符和请求体边界检查，然后使用该 Key 调用 DeepSeek 官方 `GET /models`。请求禁止重定向，设置超时，并限制上游响应字节数、模型数量和模型 ID 长度。成功只返回去重、筛选后的 `data[].id`。测试不保存 Key，也不调用生成接口，因此不产生对话生成 Token；它只验证认证和模型可见性，不保证账户余额或未来聊天一定成功。

### `PUT /api/model-configs/deepseek`

请求包含 `apiKey` 和 `providerModelId`。服务端再次调用 `GET /models`，确认 Key 有效且模型存在；随后加密并原子 upsert `ready` 记录。不能依赖浏览器先前的测试结果。写入失败不得改变旧记录。

### `DELETE /api/model-configs/deepseek`

原子写入 `disabled` 墓碑并清空原有密文，而不是简单删除整行。这样可以保证旧 `DEEPSEEK_API_KEY` 不会在删除后静默重新启用。返回：

```json
{ "status": "disabled" }
```

下一次成功 `PUT` 会覆盖墓碑并重新启用。

### 现有模型接口调整

- `GET /api/models`：只根据第 6 节解析器设置 DeepSeek 的 `available`，单个凭据损坏不得使整个接口失败。
- `POST /api/chat`：客户端仍提交稳定 ID `deepseek-chat`；服务端解析到保险库的 `providerModelId` 或完整旧环境变量配置。
- 解密出的 Key 只作为当前函数调用的局部变量存在，不放入模块全局缓存。

## 8. DeepSeek 连接适配器

DeepSeek 适配器固定官方域名，并集中实现：

- 列出并验证模型；
- 把 401/403 映射为 `PROVIDER_AUTH_INVALID`；
- 把 402 映射为 `PROVIDER_BALANCE_INSUFFICIENT`；
- 把 429 映射为 `PROVIDER_RATE_LIMITED`；
- 把超时映射为 `PROVIDER_TIMEOUT`；
- 把其他上游异常映射为 `PROVIDER_UNAVAILABLE`；
- 对外只返回白名单字段，不透传响应头、请求对象或供应商原始正文；
- 使用 `AbortController`，禁止重定向并限制响应体；失败后不保存凭据。

聊天继续使用官方 `/chat/completions`。所有内部错误码都有稳定的 HTTP 状态和中文展示文案，测试以内部错误码为准，不依赖易变化的供应商原文。

## 9. 网站界面

“对话服务 → API 高级配置 → DeepSeek”展开后显示：

- 当前状态：“未配置”“已安全保存”“由旧环境配置提供”“需要重新填写”或“已停用”；
- `type="password"` 的 API Key 输入框，设置 `autoComplete="new-password"`，关闭拼写检查和自动大小写，不回填旧 Key；
- “测试连接”按钮；
- 测试成功后显示供应商模型下拉框；
- “保存配置”按钮，只有当前输入值完成测试并选择模型后可用；
- “停用并删除网站配置”按钮和二次确认；
- 提示“测试只读取模型列表，不生成对话内容；实际对话可能产生 DeepSeek API 费用”。

每次输入改变都立即作废此前的测试成功状态。异步请求使用序号或取消信号，输入变化、关闭弹窗和组件卸载后必须忽略旧响应。关闭、保存成功或停用后清空输入框和组件状态。

保存成功后刷新模型列表，思考空间中的 DeepSeek API 选项变为可选。DeepSeek 免费网页版继续保留，并与 API 入口清楚区分。

## 10. 错误处理与恢复

- 缺少私人访问口令：所有凭据接口均返回 `503 PRIVATE_ACCESS_REQUIRED`，不会退化为公开接口。
- Bearer Token 缺失或错误：返回 `401 PRIVATE_ACCESS_UNAUTHORIZED`。
- Key 无效或模型不存在：不保存，输入框保留供用户修改。
- Neon 写入失败：不改变旧凭据，返回 `CREDENTIAL_SAVE_FAILED`。
- 表未迁移：凭据接口返回 `CREDENTIAL_STORE_UNAVAILABLE`，站点其他功能继续可用。
- 密文、元数据或主密钥异常：状态为 `needs_reentry`，不静默回退旧环境 Key。
- DeepSeek 暂时不可用：保留已保存凭据，不自动删除；聊天可切换到免费网页版。
- 停用请求失败：界面保留原状态，不能显示为已经删除。

## 11. 测试策略

先写失败测试，再实现。自动化测试只使用进程内注入的临时 32 字节测试主密钥和虚构 API Key，不创建或归档真实密钥。

- 加密单元测试：往返、随机 IV、元数据篡改、IV/标签长度、未知版本、错误脱敏、缺少或错误主密钥。
- SQLite/Postgres 存储测试：`ready` upsert、`disabled` 墓碑、约束、并发覆盖、读取状态、旧业务数据不受影响。
- 解析器测试：表无记录、环境回退、保险库优先、损坏记录不回退、墓碑抑制回退、稳定网关 ID 与供应商模型 ID 分离。
- DeepSeek 适配器测试：模型列表白名单、重定向拒绝、响应大小和数量上限、认证/余额/限流/超时、上游正文不泄漏。
- HTTP 测试：四个接口在未配置私人口令时全部失败关闭；测试不持久化；保存会复验且只写密文；读取不返回秘密；停用生效。
- React 测试：不回填、不进入浏览器存储；输入改变会使测试失效；关闭后清空；忽略过期响应；删除确认；中文错误可见。
- 迁移测试：具名 SQL 可重复执行、目标分支正确、缺表时安全降级、现有 6 张表内容与约束不受影响。
- 回归测试：现有网页测试、类型检查、构建，小程序测试、云函数测试和构建全部通过。
- 安全扫描：Git、归档、日志、备份导出和接口响应中没有真实 Key、主密钥、`.env` 或数据库连接串。

## 12. Preview、Production 与部署

当前 Preview 与 Production 可能共用同一个 Neon 数据库，因此第一版禁止在共享 Preview 中保存、覆盖或停用真实凭据。安全部署顺序：

1. 自动生成一次 32 字节 `SIYU_CREDENTIAL_MASTER_KEY`，以 Sensitive 方式写入需要读取同一凭据表的 Production 和 Preview 环境；值不出现在命令输出和归档中。配置后创建新部署。
2. 在明确记录的 Neon 项目、分支和数据库上执行具名迁移，核验原有 6 张表和新增表/约束。
3. 推送 Preview，使用虚构无效 Key 验证鉴权、中文错误、无泄露和不持久化路径；自动化测试使用模拟 DeepSeek 与隔离存储完成成功保存/对话/停用全流程。
4. 若以后为 Preview 创建独立 Neon 分支并配置独立 `DATABASE_URL`，才允许在 Preview 做真实写入式验收。不同数据库可以使用不同主密钥；共享数据库必须使用同一个主密钥。
5. Preview 回归通过后推广 Production，等待 `Ready`。
6. 用户只在 Production 浏览器中输入真实 Key，完成：列出模型、保存、刷新仍显示 `ready`、发起一次真实对话；停用测试只有用户明确需要时才执行。
7. 验证健康检查、私人访问、议题/对话/周报/知识库、小程序现有跳转和移动布局。
8. 更新 `D:\AI思屿` 的使用指导、AI 接续说明、源码快照和 SHA-256 清单；所有凭据表内容和秘密继续排除。

## 13. 验收标准

- 用户无需手动进入 Vercel，即可在思屿网站测试、加密保存、跨刷新识别、使用和停用 DeepSeek Key。
- 私人访问口令与凭据主密钥职责分离；轮换访问口令不影响已保存 Key。
- 删除网站凭据后，旧环境变量不会静默重新启用 DeepSeek。
- 迁移缺失、密文损坏或供应商故障只影响 DeepSeek，不锁死整个网站。
- 稳定网关模型 ID 不变，旧环境变量路径兼容，现有业务数据和小程序现有功能不回归。
- 浏览器读取接口、日志、Git、备份导出和本地归档都不能得到 DeepSeek Key 或凭据主密钥明文。

## 14. 可实施性结论

该方案在现有 Node.js 22、Vercel Functions、Neon Postgres、SQLite 本地测试和 React 前端架构上可实施，不需要新增第三方加密库或付费资源。进入编码前唯一需要用户确认的是本复核版设计；确认后先编写逐文件实施计划，再按测试驱动方式实现、迁移和部署。
