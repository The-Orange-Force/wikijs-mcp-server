#!/bin/bash

# Start the WikiJS MCP server (TypeScript compiled version)
# Equivalent to start_http.sh -- both now launch the same Fastify server

# Get absolute path to project directory (one level up from scripts)
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Change to project directory
cd "$PROJECT_DIR"

# Kill existing server process if running
pkill -f "node dist/server.js" || true

# Load environment variables from .env file
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
    echo "Loaded environment variables from .env file"
else
    echo ".env file not found. Please create one based on example.env"
fi

# Set defaults if variables are not set
export PORT=${PORT:-3200}
export WIKIJS_BASE_URL=${WIKIJS_BASE_URL:-http://localhost:3000}

# Check for required variables
if [ -z "$WIKIJS_TOKEN" ]; then
    echo "Error: WIKIJS_TOKEN is not set. Create a .env file based on example.env"
    exit 1
fi

# Ensure TypeScript is compiled
if [ ! -f "dist/server.js" ]; then
    echo "TypeScript not compiled. Running build..."
    npm run build
fi

# Start the server
echo "Starting WikiJS MCP server on port $PORT with base URL $WIKIJS_BASE_URL"
node dist/server.js > server.log 2>&1 &

# Save PID
echo $! > server.pid
echo "WikiJS MCP server started, PID: $(cat server.pid)"

# Check API availability after 2 seconds
sleep 2
if curl -s http://localhost:$PORT/health > /dev/null; then
  echo "API available, server running correctly"
  curl -s http://localhost:$PORT/health
else
  echo "Error: API unavailable"
  cat server.log
fi
