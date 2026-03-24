#!/bin/bash

# Initial setup script for WikiJS MCP Server project

# Get absolute path to project directory (one level up from scripts)
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Change to project directory
cd "$PROJECT_DIR"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== WikiJS MCP Server Setup ===${NC}\n"

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}[ERROR] Node.js is not installed. Please install Node.js before continuing.${NC}"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${YELLOW}[WARNING] Node.js version 18 or higher is recommended. Current version: $(node -v)${NC}"
fi

echo -e "${GREEN}[STEP 1] Installing project dependencies...${NC}"
npm install

# Check for .env file
if [ ! -f .env ]; then
    echo -e "${GREEN}[STEP 2] Creating .env configuration file...${NC}"
    cp example.env .env
    echo -e "${YELLOW}[NOTE] Created .env file. Please edit it with your Wiki.js connection settings.${NC}"
else
    echo -e "${GREEN}[STEP 2] .env file already exists. Skipping...${NC}"
fi

echo -e "${GREEN}[STEP 3] Building project...${NC}"
npm run build

echo -e "\n${GREEN}=== Setup complete! ===${NC}"
echo -e "${YELLOW}To start the MCP HTTP server:${NC} ./scripts/start_http.sh"
echo -e "${YELLOW}To start the STDIO server:${NC} npm run server:stdio"
echo -e "\n${YELLOW}Make sure you have configured your .env file with Wiki.js connection settings.${NC}"
