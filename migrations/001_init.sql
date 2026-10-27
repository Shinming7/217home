-- 217之家 · 初始表结构
-- ID 与时间均由 Function 生成，不使用默认值/触发器/CHECK。

CREATE TABLE app.members (
  id uuid PRIMARY KEY,
  nickname text NOT NULL,
  role text NOT NULL,
  avatar jsonb,
  cosmetics jsonb,
  intro text,
  tags jsonb,
  last_x integer,
  last_y integer,
  last_dir text,
  last_seen timestamptz,
  created_at timestamptz NOT NULL
);

CREATE TABLE app.sessions (
  id uuid PRIMARY KEY,
  member_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz
);
CREATE INDEX sessions_member_idx ON app.sessions (member_id);

CREATE TABLE app.settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE app.photos (
  id uuid PRIMARY KEY,
  member_id uuid NOT NULL,
  orig_key text NOT NULL,
  pixel_key text NOT NULL,
  caption text,
  created_at timestamptz NOT NULL
);
CREATE INDEX photos_created_idx ON app.photos (created_at);
CREATE INDEX photos_member_idx ON app.photos (member_id);

CREATE TABLE app.messages (
  id uuid PRIMARY KEY,
  member_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE INDEX messages_created_idx ON app.messages (created_at);
CREATE INDEX messages_member_idx ON app.messages (member_id);

CREATE TABLE app.affinity (
  id uuid PRIMARY KEY,
  member_id uuid NOT NULL,
  target_id uuid NOT NULL,
  day text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (member_id, target_id, day)
);
CREATE INDEX affinity_target_idx ON app.affinity (target_id);

CREATE TABLE app.game_records (
  id uuid PRIMARY KEY,
  member_id uuid NOT NULL,
  game text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE INDEX game_records_member_idx ON app.game_records (member_id, game, created_at);

CREATE TABLE app.fish_collection (
  id uuid PRIMARY KEY,
  member_id uuid NOT NULL,
  fish_id text NOT NULL,
  cnt integer NOT NULL,
  first_at timestamptz NOT NULL,
  last_at timestamptz NOT NULL,
  UNIQUE (member_id, fish_id)
);
