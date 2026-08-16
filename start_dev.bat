@echo off
setlocal

cd /d "%~dp0"

if not defined PORT set "PORT=4173"
set "NODE_ENV=development"
set "REDIS_URL="
set "DISABLE_FIDELITY_PREVIEW=true"
rem 本地开发专用口令（仅绑定 127.0.0.1；compose 校验需要）
if not defined POSTGRES_USER set "POSTGRES_USER=resume"
if not defined POSTGRES_PASSWORD set "POSTGRES_PASSWORD=resume"
if not defined REDIS_PASSWORD set "REDIS_PASSWORD=resume"
if not defined SEED_ADMIN_PASSWORD set "SEED_ADMIN_PASSWORD=admin123"
if not defined SEED_USER_PASSWORD set "SEED_USER_PASSWORD=user1234"
if not defined DATABASE_URL set "DATABASE_URL=postgres://%POSTGRES_USER%:%POSTGRES_PASSWORD%@127.0.0.1:55432/resume_editor"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or later is required. Install Node.js and try again.
  pause
  exit /b 1
)

if not defined AI_CONFIG_ENC_KEY (
  for /f "usebackq delims=" %%k in (`node scripts\ensure-ai-key.mjs`) do set "AI_CONFIG_ENC_KEY=%%k"
)

where docker >nul 2>nul
if errorlevel 1 (
  echo Docker Desktop is required for the development PostgreSQL database.
  pause
  exit /b 1
)

set "COMPOSE_CMD=docker compose"
docker compose version >nul 2>nul
if errorlevel 1 set "COMPOSE_CMD=docker-compose"

echo Using compose command: %COMPOSE_CMD%
echo Preparing the development database...
%COMPOSE_CMD% stop app document-worker redis >nul 2>nul
%COMPOSE_CMD% up -d --no-deps --wait --wait-timeout 120 postgres
if errorlevel 1 (
  echo Failed to start PostgreSQL. Make sure Docker Desktop is running.
  pause
  exit /b 1
)

echo Applying database migrations...
call npm run db:migrate
if errorlevel 1 (
  echo Database migration failed. Check DATABASE_URL and that PostgreSQL is healthy.
  pause
  exit /b 1
)

echo Ensuring test accounts exist (admin@example.com / user@example.com)...
call npm run seed
if errorlevel 1 (
  echo Warning: test account seeding failed. You can create accounts by registering in the app.
)

echo Starting Resume Editor in lightweight development mode.
echo URL: http://127.0.0.1:%PORT%
echo Redis, document worker, and fidelity preview are disabled.
echo Database: %DATABASE_URL%
echo.

node server.mjs
echo.
echo Server process ended. Check the message above, then press any key to close.
pause
