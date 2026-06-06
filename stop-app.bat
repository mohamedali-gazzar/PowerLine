@echo off
title PowerLine - stop
echo Stopping PowerLine servers (all Node processes)...
taskkill /F /IM node.exe >nul 2>&1
if %errorlevel%==0 (
  echo Stopped.
) else (
  echo Nothing was running.
)
timeout /t 2 >nul
