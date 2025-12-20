@echo off
REM Kubiq Dashboard - Initialization Script for Windows
REM This script sets up the project for first-time use

echo.
echo 🚀 Initializing Kubiq Dashboard...
echo.

REM Check Node.js version
echo 📋 Checking Node.js version...
node -v
echo.

REM Install root dependencies
echo 📦 Installing root dependencies...
call npm install
echo.

REM Install backend dependencies
echo 📦 Installing backend dependencies...
cd backend
call npm install

REM Setup backend config
if not exist .env (
  echo ⚙️  Creating backend .env file...
  copy .env.example .env
  echo    ✅ Created backend\.env (please edit with your settings)
) else (
  echo    ⏭️  backend\.env already exists, skipping
)

REM Create services config if not exists
if not exist config\services.txt (
  echo ⚙️  Creating services configuration...
  if not exist config mkdir config
  (
    echo # Add your services here in the format:
    echo # service-name=http://service-url:port/health-endpoint
    echo.
    echo # Example:
    echo # api-gateway=http://localhost:3000/api/health
    echo # database=http://localhost:5432/health
  ) > config\services.txt
  echo    ✅ Created backend\config\services.txt (please add your services)
) else (
  echo    ⏭️  backend\config\services.txt already exists, skipping
)

REM Create data directory
if not exist data mkdir data
echo    ✅ Created backend\data directory

cd ..

REM Install frontend dependencies
echo.
echo 📦 Installing frontend dependencies...
cd frontend
call npm install

REM Setup frontend config
if not exist .env (
  echo ⚙️  Creating frontend .env file...
  copy .env.example .env
  echo    ✅ Created frontend\.env
) else (
  echo    ⏭️  frontend\.env already exists, skipping
)

cd ..

REM Summary
echo.
echo ✅ Initialization complete!
echo.
echo 📝 Next steps:
echo    1. Edit backend\.env with your configuration
echo    2. Add services to backend\config\services.txt
echo    3. (Optional) Configure Keycloak authentication
echo    4. Run 'npm run dev' to start the development servers
echo.
echo 🌐 URLs:
echo    Frontend: http://localhost:3000
echo    Backend:  http://localhost:3001
echo.
echo 📚 Documentation:
echo    Setup Guide:    .\SETUP.md
echo    Architecture:   .\docs\ARCHITECTURE.md
echo    API Reference:  .\docs\API.md
echo.
echo Happy monitoring! 🎉
echo.
pause
