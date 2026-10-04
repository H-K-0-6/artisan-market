@echo off
setlocal
title Artisan Market - stop
cd /d "%~dp0"

echo Stopping Artisan Market...

rem App server: only stop it if the process on port 3000 is this app.
curl.exe -s -f -o nul --max-time 5 "http://localhost:3000/api/health" >nul 2>&1
if not errorlevel 1 (
  for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":3000 .*LISTENING"') do taskkill /PID %%p /T /F >nul 2>&1
  echo - app server stopped
)

rem Database: clean shutdown, plus any leftover processes and stale lock file.
call npx tsx scripts/db.ts stop

rem Close the windows start.bat opened (they carry an ARTISAN_WINDOW marker).
powershell -NoProfile -NonInteractive -Command "Get-CimInstance Win32_Process -Filter \"Name='cmd.exe'\" | Where-Object { $_.CommandLine -like '*ARTISAN_WINDOW=*' } | ForEach-Object { taskkill /PID $_.ProcessId /T /F | Out-Null }"
echo - launcher windows closed

echo Done.
ping -n 3 127.0.0.1 >nul
