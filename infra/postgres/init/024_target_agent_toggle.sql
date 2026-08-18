-- 求职目标 Agent 独立开关；仍受 AI 总开关约束。
ALTER TABLE ai_model_config ADD COLUMN IF NOT EXISTS target_agent_enabled boolean NOT NULL DEFAULT true;
