-- AI 优化（编辑器内按指令修改简历）：独立开关，默认开启；受 ai_model_config.enabled 总开关约束。
ALTER TABLE ai_model_config ADD COLUMN IF NOT EXISTS optimize_enabled boolean NOT NULL DEFAULT true;
