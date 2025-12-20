#!/bin/bash

# Kubiq Dashboard - Initialization Script
# This script sets up the project for first-time use

set -e

echo "🚀 Initializing Kubiq Dashboard..."
echo ""

# Check Node.js version
echo "📋 Checking Node.js version..."
node_version=$(node -v)
echo "   Node.js version: $node_version"

if [[ ! "$node_version" =~ v1[89]|v2[0-9] ]]; then
  echo "⚠️  Warning: Node.js 18+ recommended. Current version: $node_version"
fi

# Install root dependencies
echo ""
echo "📦 Installing root dependencies..."
npm install

# Install backend dependencies
echo ""
echo "📦 Installing backend dependencies..."
cd backend
npm install

# Setup backend config
if [ ! -f .env ]; then
  echo "⚙️  Creating backend .env file..."
  cp .env.example .env
  echo "   ✅ Created backend/.env (please edit with your settings)"
else
  echo "   ⏭️  backend/.env already exists, skipping"
fi

# Create services config if not exists
if [ ! -f config/services.txt ]; then
  echo "⚙️  Creating services configuration..."
  mkdir -p config
  cat > config/services.txt << EOF
# Add your services here in the format:
# service-name=http://service-url:port/health-endpoint

# Example:
# api-gateway=http://localhost:3000/api/health
# database=http://localhost:5432/health
EOF
  echo "   ✅ Created backend/config/services.txt (please add your services)"
else
  echo "   ⏭️  backend/config/services.txt already exists, skipping"
fi

# Create data directory
mkdir -p data
echo "   ✅ Created backend/data directory"

cd ..

# Install frontend dependencies
echo ""
echo "📦 Installing frontend dependencies..."
cd frontend
npm install

# Setup frontend config
if [ ! -f .env ]; then
  echo "⚙️  Creating frontend .env file..."
  cp .env.example .env
  echo "   ✅ Created frontend/.env"
else
  echo "   ⏭️  frontend/.env already exists, skipping"
fi

cd ..

# Summary
echo ""
echo "✅ Initialization complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Edit backend/.env with your configuration"
echo "   2. Add services to backend/config/services.txt"
echo "   3. (Optional) Configure Keycloak authentication"
echo "   4. Run 'npm run dev' to start the development servers"
echo ""
echo "🌐 URLs:"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:3001"
echo ""
echo "📚 Documentation:"
echo "   Setup Guide:    ./SETUP.md"
echo "   Architecture:   ./docs/ARCHITECTURE.md"
echo "   API Reference:  ./docs/API.md"
echo ""
echo "Happy monitoring! 🎉"
