-- 将内置模板显示名从「清晰单栏」统一改为「极简轻」。
-- 保持幂等，供已有数据库（001_schema.sql 已应用）更新显示名。
UPDATE templates SET name = '极简轻' WHERE slug = 'clean-single' AND name = '清晰单栏';
