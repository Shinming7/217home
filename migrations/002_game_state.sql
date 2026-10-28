-- 217之家 · 联机牌局与联机对打的共享状态表
-- 单行 JSON 状态 + 整数版本号，服务端用版本号做乐观并发控制。

CREATE TABLE app.game_state (
  key text PRIMARY KEY,
  state jsonb NOT NULL,
  version integer NOT NULL,
  updated_at timestamptz NOT NULL
);
