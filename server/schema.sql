-- SCM 云端同步 · Aiven MySQL 表结构
-- 整份前端数据块（scm_db_v3）作为一行 JSON 存储，id 固定为 'main'。
-- 在 Aiven MySQL 控制台 / 任意 MySQL 客户端执行一次即可。

CREATE TABLE IF NOT EXISTS scm_state (
  id          VARCHAR(32)  NOT NULL,
  data        JSON         NULL,
  updated_at  TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 初始占位行（可选：让首次 GET 直接返回空，而非 404）
INSERT INTO scm_state (id, data) VALUES ('main', NULL)
ON DUPLICATE KEY UPDATE id = id;
