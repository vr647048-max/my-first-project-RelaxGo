@echo off
setlocal
cd /d "%~dp0"

echo ================================================
echo TherapyOnWay - Local Server
echo ================================================
echo.

where python >nul 2>&1
if errorlevel 1 (
  echo Python is not installed or not available in PATH.
  echo Please install Python 3 and run this file again.
  pause
  exit /b 1
)

for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /C:"IPv4 Address"') do set "IP=%%A"
set "IP=%IP: =%"

echo Computer local IP: %IP%
echo.
echo Customer website:  http://%IP%:8000/
echo Provider dashboard: http://%IP%:8000/admin.html
echo Tracking page:      http://%IP%:8000/track.html
echo.
echo IMPORTANT: Keep this black window open while testing.
echo For mobile GPS, use the public HTTPS version of the site; normal
echo http://192.168.x.x addresses are not secure origins for mobile GPS.
echo.

python -m http.server 8000 --bind 0.0.0.0

pause
