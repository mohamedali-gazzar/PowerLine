@echo off
title PowerLine launcher
cd /d "%~dp0"

echo ============================================
echo   PowerLine - starting locally
echo ============================================

REM --- First-run setup (only if missing) ---
if not exist backend\node_modules (
  echo [setup] Installing backend dependencies...
  pushd backend && call npm install && popd
)
if not exist frontend\node_modules (
  echo [setup] Installing frontend dependencies...
  pushd frontend && call npm install && popd
)
if not exist backend\prisma\dev.db (
  echo [setup] Creating local database...
  pushd backend && call npx prisma migrate deploy && call npx prisma generate && call npm run db:seed && popd
)

echo Starting the two servers in separate windows...
start "PowerLine Backend"  cmd /k "cd backend && npm run dev"
start "PowerLine Frontend" cmd /k "cd frontend && npm run dev"

echo Waiting for the app to come up...
timeout /t 7 /nobreak >nul
start "" http://localhost:5173

echo.
echo   App:     http://localhost:5173
echo   Backend: http://localhost:4000
echo.
echo   The app runs in the two windows that just opened.
echo   To stop it, close those two windows (or run stop-app.bat).
echo.
pause
