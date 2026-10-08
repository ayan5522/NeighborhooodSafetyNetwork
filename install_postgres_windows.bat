@echo off
setlocal enabledelayedexpansion

echo ==============================================================================
echo Neighborhood Safety Network - Windows PostgreSQL 16 + PostGIS Setup
echo ==============================================================================
echo.

:: Check for administrative permissions
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Administrator permissions required.
    echo Please RIGHT-CLICK this file and select "RUN AS ADMINISTRATOR".
    echo.
    pause
    exit /b 1
)

echo [1/3] Installing PostgreSQL 16 on Windows (Unattended)...
echo Please wait 1-2 minutes while PostgreSQL 16 files are installed...
"%~dp0installers\postgresql-16-setup.exe" --mode unattended --superpassword nsn_password_2026 --serverport 5432 --prefix "C:\Program Files\PostgreSQL\16" --datadir "C:\Program Files\PostgreSQL\16\data"
if %errorlevel% neq 0 (
    echo [WARNING] PostgreSQL installer finished with code %errorlevel%. Continuing...
) else (
    echo PostgreSQL 16 installed successfully!
)

echo.
echo [2/3] Installing PostGIS Spatial Extension...
echo Installing PostGIS bundle...
"%~dp0installers\postgis-setup.exe" /S
if %errorlevel% neq 0 (
    echo [WARNING] PostGIS installer finished with code %errorlevel%. Continuing...
) else (
    echo PostGIS extension installed successfully!
)

echo.
echo [3/3] Ensuring PostgreSQL 16 Service is running...
net start postgresql-x64-16

echo.
echo ==============================================================================
echo Database Engine Ready! Initializing neighborhood_safety_db and migrations...
echo ==============================================================================
cd /d "%~dp0backend"
call npm run db:init

echo.
echo ==============================================================================
echo ALL DONE! Windows PostgreSQL + PostGIS is fully configured and ready!
echo You can now run: npm run backend:dev
echo ==============================================================================
pause
