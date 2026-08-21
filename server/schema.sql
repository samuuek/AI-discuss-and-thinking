CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'green',
  status TEXT NOT NULL DEFAULT '讨论中',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  topic_id TEXT PRIMARY KEY REFERENCES topics(id) ON DELETE CASCADE,
  note TEXT NOT NULL DEFAULT '',
  reflection TEXT NOT NULL DEFAULT '',
  resources TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  mind_map TEXT NOT NULL DEFAULT '',
  selected_model TEXT NOT NULL DEFAULT 'siyu-demo',
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  sequence BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  model_id TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS messages_topic_sequence
  ON messages (topic_id, sequence);

CREATE TABLE IF NOT EXISTS weekly_items (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  organization TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  category TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  significance TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS weekly_items_published
  ON weekly_items (published_at DESC);

CREATE TABLE IF NOT EXISTS weekly_source_status (
  source_id TEXT PRIMARY KEY,
  last_success_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  error TEXT
);

CREATE TABLE IF NOT EXISTS weekly_analyses (
  analyst_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  markdown TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (analyst_id, fingerprint)
);

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

INSERT INTO topics (
  id, kind, title, summary, reason, source, color, status, created_at, updated_at
)
VALUES
  (
    'ai-memory',
    '热点',
    '当 AI 开始替我们记忆，我们会失去什么？',
    '从便利、认知外包与个人叙事三个角度，重新审视人与记忆工具的关系。',
    '与你近期关注的 AI 与独立思考相关',
    '2 个来源 · 更新于今天 08:30',
    'blue',
    '讨论中',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'slow-thinking',
    '为你推荐',
    '什么样的慢，反而能让思考更快？',
    '讨论信息密度、留白与深度判断之间的关系，并形成可实践的方法。',
    '延续你尚未解决的「信息过载」议题',
    '基于已授权的议题摘要',
    'green',
    '讨论中',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'certainty',
    '随机思想',
    '如果答案不再稀缺，我们还需要追求确定吗？',
    '从学习、选择与创造三个场景，探索“不确定”是否也是一种能力。',
    '随机思想题 · 近 30 天未出现相似主题',
    '思想题库 · 今日抽取',
    'amber',
    '讨论中',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO workspaces (topic_id, updated_at)
SELECT topic_id, CURRENT_TIMESTAMP
FROM (VALUES ('ai-memory'), ('slow-thinking'), ('certainty')) AS seed_topics(topic_id)
ON CONFLICT (topic_id) DO NOTHING;
