-- 完整简历 JSON 对推理模型的旧默认预算不足。
-- 只升级仍使用旧默认值的配置，保留管理员已经手工调整的值。
UPDATE ai_model_config
SET max_output_tokens = 4000,
    updated_at = now()
WHERE id = 1 AND max_output_tokens = 1600;

UPDATE ai_model_config
SET timeout_ms = 60000,
    updated_at = now()
WHERE id = 1 AND timeout_ms = 30000;
