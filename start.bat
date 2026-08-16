@echo off
setlocal

cd /d "%~dp0"

if not defined PORT set "PORT=4173"
rem 本地开发专用口令（仅绑定 127.0.0.1）；compose 与宿主进程需保持一致
if not defined POSTGRES_USER set "POSTGRES_USER=resume"
if not defined POSTGRES_PASSWORD set "POSTGRES_PASSWORD=resume"
if not defined REDIS_PASSWORD set "REDIS_PASSWORD=resume"
if not defined SEED_ADMIN_PASSWORD set "SEED_ADMIN_PASSWORD=admin123"
if not defined SEED_USER_PASSWORD set "SEED_USER_PASSWORD=user1234"
if not defined DATABASE_URL set "DATABASE_URL=postgres://%POSTGRES_USER%:%POSTGRES_PASSWORD%@127.0.0.1:55432/resume_editor"
if not defined REDIS_URL set "REDIS_URL=redis://:%REDIS_PASSWORD%@127.0.0.1:6379"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or later is required. Install Node.js and try again.
  exit /b 1
)

if not defined AI_CONFIG_ENC_KEY (
  for /f "usebackq delims=" %%k in (`node scripts\ensure-ai-key.mjs`) do set "AI_CONFIG_ENC_KEY=%%k"
)

where docker >nul 2>nul
if errorlevel 1 (
  echo Docker Desktop is required to run the document worker and fidelity preview.
  echo For lightweight local editing without DOCX preview, use start_dev.bat instead.
  exit /b 1
)

set "COMPOSE_CMD=docker compose"
docker compose version >nul 2>nul
if errorlevel 1 set "COMPOSE_CMD=docker-compose"

echo Using compose command: %COMPOSE_CMD%
echo Starting PostgreSQL, Redis and the document worker (LibreOffice/Poppler)...
echo First run builds the document-worker image, which can take several minutes.
%COMPOSE_CMD% stop app >nul 2>nul
%COMPOSE_CMD% up -d --build --wait --wait-timeout 180 postgres redis document-worker
if errorlevel 1 (
  echo Failed to start Docker services. Make sure Docker Desktop is running.
  echo Inspect with: %COMPOSE_CMD% ps
  exit /b 1
)

echo Applying database migrations...
call npm run db:migrate
if errorlevel 1 (
  echo Database migration failed. Check DATABASE_URL and that PostgreSQL is healthy.
  exit /b 1
)

echo Ensuring test accounts exist (admin@example.com / user@example.com)...
call npm run seed
if errorlevel 1 (
  echo Warning: test account seeding failed. You can create accounts by registering in the app.
)

echo.
echo Starting Resume Editor at http://127.0.0.1:%PORT%
echo Database: PostgreSQL at 127.0.0.1:55432
echo Worker:   document-worker (LibreOffice/Poppler) via Redis at 127.0.0.1:6379
echo Fidelity preview and DOCX export are handled by the Docker worker.
echo.

node server.mjs
