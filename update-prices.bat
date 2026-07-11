@echo off
setlocal
cd /d "%~dp0"

echo(
echo ===================================================
echo     PowerLine  -  Update Prices from Excel
echo ===================================================
echo(
echo This reads your edits from the pricing folder:
echo     pricing\RMU-Pricing.xlsx
echo     pricing\LV-Pricing.xlsx
echo and updates the app with your new prices.
echo(
echo Make sure you SAVED and CLOSED the Excel files first.
echo(
pause

echo(
echo Syncing your prices...
echo ---------------------------------------------------
node tools\pricing-import.cjs all
if errorlevel 1 (
  echo(
  echo *** PROBLEM - nothing was changed. ***
  echo Read the messages above, fix the Excel, and run this again.
  echo Or just send the Excel file to Claude and it will handle it.
  echo(
  pause
  exit /b 1
)

echo ---------------------------------------------------
echo(
echo  Prices updated inside the app.  ^(Not on the live site yet.^)
echo(
set /p PUB="Publish to the LIVE website now?  (Y = yes / N = later): "
if /i not "%PUB%"=="Y" (
  echo(
  echo OK - saved on this computer only.
  echo Run this again and press Y when you want it live, or ask Claude.
  echo(
  pause
  exit /b 0
)

echo(
echo Publishing to the live website...
git add pricing backend/src/data frontend/src/lv/data
git commit -m "pricing: update from Excel master"
if errorlevel 1 (
  echo(
  echo Nothing new to publish. If you did change a price and expected
  echo an update, ask Claude to check it.
  echo(
  pause
  exit /b 0
)
git push origin main
if errorlevel 1 (
  echo(
  echo *** Could not publish automatically. ***
  echo Your changes ARE saved on this computer - just ask Claude to push.
  echo(
  pause
  exit /b 1
)

echo(
echo ===================================================
echo   DONE!  The live website updates in about a minute.
echo ===================================================
echo(
pause
