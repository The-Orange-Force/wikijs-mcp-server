#!/bin/bash

# Stop all WikiJS MCP server processes

# Get absolute path to project directory (one level up from scripts)
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Change to project directory
cd "$PROJECT_DIR"

echo "Stopping WikiJS MCP servers..."

# Stop by PID file if it exists
if [ -f server.pid ]; then
    PID=$(cat server.pid)
    if ps -p $PID > /dev/null 2>&1; then
        echo "Stopping process with PID: $PID"
        kill $PID
        sleep 2
        # Force stop if process is still running
        if ps -p $PID > /dev/null 2>&1; then
            echo "Force stopping process $PID"
            kill -9 $PID
        fi
    else
        echo "Process with PID $PID is not running"
    fi
    rm -f server.pid
    echo "Removed server.pid file"
fi

# Stop all MCP server processes by name
echo "Stopping all MCP server processes..."
pkill -f "dist/server.js" && echo "Stopped dist/server.js" || echo "dist/server.js not running"

# Wait for processes to terminate
sleep 1

# Check for remaining processes
RUNNING_PROCESSES=$(ps aux | grep -E "dist/server\.js" | grep -v grep | wc -l)

if [ $RUNNING_PROCESSES -eq 0 ]; then
    echo "All MCP servers stopped successfully"
else
    echo "WARNING: Some MCP processes are still running:"
    ps aux | grep -E "dist/server\.js" | grep -v grep
    echo ""
    echo "To force stop, run:"
    echo "pkill -9 -f 'dist/server.js'"
fi

# Remove log files if they exist
if [ -f server.log ]; then
    rm -f server.log
    echo "Removed server.log"
fi

echo "Stop complete"
