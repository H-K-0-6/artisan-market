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

rem --- 1. Database (embedded Postgres on 5432) ---------------------------------
call :listening 5432
if errorlevel 1 (
  echo Starting database...
  start "Artisan Market - database" /min cmd /k "npm run db"
  call :waitfor 5432 60 || goto :fail
) else (
  echo Database already running.
)

rem --- 2. Wait until Postgres accepts connections, then migrate -----------------
rem The port opens a moment before Postgres is ready (longer after a crash), and the
rem server exits if its first DB connection fails, so this doubles as a readiness check.
set /a "_tries=30"
:migrate
call npx prisma migrate deploy >nul 2>&1
if not errorlevel 1 goto :migrated
set /a "_tries-=1"
if %_tries% leq 0 (
  echo Database is not accepting connections. See the database window.
  goto :fail
)
call :sleep 2
goto :migrate
:migrated

rem --- 3. App server ------------------------------------------------------------
call :listening %PORT%
if errorlevel 1 (
  echo Starting app server...
  start "Artisan Market - server" cmd /k "npm run dev"
  call :waitfor %PORT% 120 || goto :fail
) else (
  echo App server already running.
)

rem --- 4. Stripe webhooks (optional, needs the Stripe CLI) ----------------------
where stripe >nul 2>&1
if not errorlevel 1 (
  tasklist /fi "imagename eq stripe.exe" | find /i "stripe.exe" >nul
  if errorlevel 1 (
    echo Starting Stripe webhook forwarding...
    start "Artisan Market - Stripe webhooks" /min cmd /k "stripe listen --forward-to localhost:%PORT%/api/webhooks/stripe"
  )
)

rem --- 5. Open the browser ------------------------------------------------------
echo Opening %URL%
start "" "%URL%"
echo.
echo Demo logins (password Password123!): admin@demo.test, artisan@demo.test, buyer@demo.test
echo To stop: close the "Artisan Market" windows.
call :sleep 5
exit /b 0

rem ===========================================================================
:listening
rem errorlevel 0 if something is listening on port %1
netstat -ano | findstr /r /c:":%1 .*LISTENING" >nul
exit /b %errorlevel%

:waitfor
rem wait up to %2 seconds for port %1
set /a "_tries=%2/2"
:waitloop
call :listening %1
if not errorlevel 1 exit /b 0
set /a "_tries-=1"
if %_tries% leq 0 (
  echo Timed out waiting for port %1.
  exit /b 1
)
call :sleep 2
goto :waitloop

:sleep
rem pause %1 seconds (ping works without an interactive console, unlike timeout)
ping -n %1 127.0.0.1 >nul
exit /b 0

:fail
echo.
echo Something went wrong. Check the other Artisan Market windows for errors.
pause
exit /b 1
