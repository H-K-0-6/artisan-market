@echo off
setlocal
title Artisan Market launcher
cd /d "%~dp0"

set "PORT=3000"
set "URL=http://localhost:%PORT%"

if not exist "node_modules" (
  echo Installing dependencies, first run only...
  call npm install || goto :fail
)
if not exist ".env" (
  echo Missing .env file. Copy .env.example to .env and fill in your keys.
  goto :fail
)

rem --- 1. Database ---------------------------------------------------------------
rem A real query, not just "is port 5432 open": a half-dead cluster can hold the port.
call npx tsx scripts/db.ts check >nul 2>&1
if errorlevel 1 (
  echo Starting database...
  start "Artisan Market - database" /min cmd /k "set ARTISAN_WINDOW=db&& npx tsx scripts/db.ts"
  call :waitdb 90 || goto :fail
) else (
  echo Database already running.
)

rem --- 2. Migrations (no-op when up to date) ------------------------------------
call npx prisma migrate deploy >"%TEMP%\artisan-migrate.log" 2>&1
if errorlevel 1 (
  echo Database migrations failed:
  type "%TEMP%\artisan-migrate.log"
  goto :fail
)

rem --- 3. App server ------------------------------------------------------------
call :apphealthy
if errorlevel 1 (
  call :listening %PORT%
  if not errorlevel 1 (
    echo Port %PORT% is in use by another program. Close it, or run stop.bat, then try again.
    goto :fail
  )
  rem Production mode: every page is compiled once up front, so browsing is fast.
  rem Rebuild only when the code changed since the last build, which takes a few minutes.
  rem For live-reload while editing code, run "npm run dev" instead.
  node scripts/build-fresh.mjs
  if errorlevel 1 (
    echo Building the app, this takes a few minutes after code changes...
    call npm run build >"%TEMP%\artisan-build.log" 2>&1
    if errorlevel 1 (
      echo The build failed:
      type "%TEMP%\artisan-build.log"
      goto :fail
    )
  )
  echo Starting app server...
  start "Artisan Market - server" cmd /k "set ARTISAN_WINDOW=server&& npm start"
  call :waitapp 90 || goto :fail
) else (
  echo App server already running.
)

rem --- 4. Open the browser ------------------------------------------------------
echo Opening %URL%
start "" "%URL%"
echo.
echo Demo logins (password Password123!): admin@demo.test, artisan@demo.test, buyer@demo.test
echo To stop everything cleanly, run stop.bat.
call :sleep 5
exit /b 0

rem ===========================================================================
:listening
rem errorlevel 0 if something is listening on port %1
netstat -ano | findstr /r /c:":%1 .*LISTENING" >nul
exit /b %errorlevel%

:apphealthy
rem errorlevel 0 if this app answers its health check
curl.exe -s -f -o nul --max-time 5 "%URL%/api/health" >nul 2>&1
exit /b %errorlevel%

:waitdb
rem wait up to %1 seconds for the database to answer queries
set /a "_tries=%1/3"
:waitdbloop
call npx tsx scripts/db.ts check >nul 2>&1
if not errorlevel 1 exit /b 0
set /a "_tries-=1"
if %_tries% leq 0 (
  echo The database did not start. See the "Artisan Market - database" window for the error.
  exit /b 1
)
call :sleep 2
goto :waitdbloop

:waitapp
rem wait up to %1 seconds for the app's health check
set /a "_tries=%1/3"
:waitapploop
call :apphealthy
if not errorlevel 1 exit /b 0
set /a "_tries-=1"
if %_tries% leq 0 (
  echo The app server did not start. See the "Artisan Market - server" window for the error.
  exit /b 1
)
call :sleep 3
goto :waitapploop

:sleep
rem pause %1 seconds (ping works without an interactive console, unlike timeout)
ping -n %1 127.0.0.1 >nul
exit /b 0

:fail
echo.
echo Something went wrong (details above).
pause
exit /b 1
