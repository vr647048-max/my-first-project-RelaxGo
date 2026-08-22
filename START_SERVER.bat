@echo off
setlocal
cd /d "%~dp0"

echo ================================================
echo TherapyOnWay - Local Server
echo ================================================
echo.

echo PUBLIC HTTPS WEBSITE (recommended for GPS):
echo Customer: https://vr647048-max.github.io/my-first-project-RelaxGo/
echo Provider: https://vr647048-max.github.io/my-first-project-RelaxGo/admin.html
echo Tracking: https://vr647048-max.github.io/my-first-project-RelaxGo/track.html
echo.
where python >nul 2>&1
if errorlevel 1 (
  echo Python is not installed or not available in PATH.
  echo The public HTTPS website above does not need this local server.
  pause
  exit /b 1
)

for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /C:"IPv4 Address"') do set "IP=%%A"
set "IP=%IP: =%"

echo LOCAL COMPUTER TEST:
echo Customer: http://%IP%:8000/
echo Provider: http://%IP%:8000/admin.html
echo Tracking: http://%IP%:8000/track.html
echo.
echo IMPORTANT:
echo - Keep this black window open only for local computer testing.
echo - For phone GPS and Share Live Location, use the PUBLIC HTTPS Provider URL.
echo - The provider must share GPS from the phone/device that is actually moving.
echo.
python -m http.server 8000 --bind 0.0.0.0
pause
