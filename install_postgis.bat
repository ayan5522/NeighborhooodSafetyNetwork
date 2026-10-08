@echo off
echo ==============================================================================
echo Installing PostGIS into PostgreSQL 18...
echo ==============================================================================

:: Check for administrative permissions
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Administrator permissions required.
    echo Please RIGHT-CLICK this file and select "RUN AS ADMINISTRATOR".
    echo.
    pause
    exit /b 1
)

echo [1/3] Copying PostGIS files to C:\Program Files\PostgreSQL\18...
robocopy "%TEMP%\postgis-bundle-pg18-3.6.2x64\bin" "C:\Program Files\PostgreSQL\18\bin" *.* /E /IS /IT /NC /NS /NP
robocopy "%TEMP%\postgis-bundle-pg18-3.6.2x64\lib" "C:\Program Files\PostgreSQL\18\lib" *.* /E /IS /IT /NC /NS /NP
robocopy "%TEMP%\postgis-bundle-pg18-3.6.2x64\share" "C:\Program Files\PostgreSQL\18\share" *.* /E /IS /IT /NC /NS /NP
robocopy "%TEMP%\postgis-bundle-pg18-3.6.2x64\gdal-data" "C:\Program Files\PostgreSQL\18\gdal-data" *.* /E /IS /IT /NC /NS /NP

echo.
echo [2/3] PostGIS files copied! Restarting PostgreSQL 18 service...
net stop postgresql-x64-18
net start postgresql-x64-18

echo.
echo [3/3] Enabling PostGIS in neighborhood_safety_db...
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h 127.0.0.1 -p 5432 -d neighborhood_safety_db -c "CREATE EXTENSION IF NOT EXISTS postgis;"
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h 127.0.0.1 -p 5432 -d neighborhood_safety_db -c "SELECT postgis_full_version();"

echo.
echo ==============================================================================
echo SUCCESS! PostGIS is installed and enabled!
echo ==============================================================================
pause
