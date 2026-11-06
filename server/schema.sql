-- SCM 云端同步 · 表结构（整份前端数据块 scm_db_v3 存为一行 JSON，id 固定 'main'）
-- ⚠️ 通常【不需要手动执行】：后端首次访问 /api 时会自动 CREATE TABLE IF NOT EXISTS。
--    此文件仅作参考 / 排错用。

-- ===== PostgreSQL（当前默认，Aiven Free plan 选 PostgreSQL）=====
CREATE TABLE IF NOT EXISTS scm_state (
  id          VARCHAR(32) PRIMARY KEY,
  data        JSONB        NULL,
  updated_at  TIMESTAMPTZ  NULL DEFAULT now()
);

INSERT INTO scm_state (id, data) VALUES ('main', NULL)
ON CONFLICT (id) DO NOTHING;

-- ===== MySQL（仅当设了 DB_DRIVER=mysql 才用；两段二选一，不要都执行）=====
-- CREATE TABLE IF NOT EXISTS scm_state (
--   id          VARCHAR(32)  NOT NULL,
--   data        JSON         NULL,
--   updated_at  TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
--   PRIMARY KEY (id)
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- INSERT IGNORE INTO scm_state (id, data) VALUES ('main', NULL);
