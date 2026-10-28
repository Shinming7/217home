-- 217之家 · 住户个人密码（PBKDF2 加盐记录）
-- 可空：旧住户第一次带个人密码回来时再补绑定。

ALTER TABLE app.members ADD COLUMN password jsonb;
