-- 217之家 · 站内消息：私信与游戏邀请
-- 只新增表与索引；消息只对收发双方可见，站长没有读取接口。

CREATE TABLE app.inbox_messages (
  id uuid PRIMARY KEY,
  sender_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  kind text NOT NULL,
  body text,
  payload jsonb,
  read_at timestamptz,
  sender_deleted boolean NOT NULL,
  recipient_deleted boolean NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE INDEX inbox_recipient_idx ON app.inbox_messages (recipient_id, created_at);
CREATE INDEX inbox_sender_idx ON app.inbox_messages (sender_id, created_at);
