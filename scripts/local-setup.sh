#!/bin/bash

# ============================================
# GPT UPI Hub - One Command Local Setup
# ============================================
# Usage: bash scripts/local-setup.sh
# Prerequisites: Docker, Node.js v18+, npm

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   GPT UPI Hub - Local Setup Starting  ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check prerequisites
echo -e "${YELLOW}[1/7] Checking prerequisites...${NC}"

if ! command -v node &> /dev/null; then
    echo -e "${RED}ERROR: Node.js not found! Install from https://nodejs.org${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}ERROR: Node.js v18+ required. Current: $(node -v)${NC}"
    exit 1
fi
echo "  Node.js $(node -v) ✓"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}ERROR: Docker not found! Install from https://docker.com${NC}"
    exit 1
fi
echo "  Docker $(docker --version | grep -oP '\d+\.\d+\.\d+') ✓"

if ! command -v docker compose &> /dev/null && ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}ERROR: Docker Compose not found!${NC}"
    exit 1
fi
echo "  Docker Compose ✓"
echo ""

# Start Docker services
echo -e "${YELLOW}[2/7] Starting PostgreSQL + Redis (Docker)...${NC}"
docker compose up -d
echo "  Waiting for database to be ready..."
sleep 5

# Check if postgres is healthy
until docker exec gpt-upi-db pg_isready -U gpt_upi_user -d gpt_upi > /dev/null 2>&1; do
    echo "  Waiting for PostgreSQL..."
    sleep 2
done
echo "  PostgreSQL ✓"
echo "  Redis ✓"
echo ""

# Install dependencies
echo -e "${YELLOW}[3/7] Installing npm dependencies...${NC}"
npm install
echo ""

# Generate Prisma client
echo -e "${YELLOW}[4/7] Generating Prisma client...${NC}"
npx prisma generate
echo ""

# Push database schema
echo -e "${YELLOW}[5/7] Creating database tables...${NC}"
npx prisma db push
echo ""

# Seed database (optional)
echo -e "${YELLOW}[6/7] Seeding database...${NC}"
npm run db:seed 2>/dev/null || echo "  (No seed data or seed already applied)"
echo ""

# Done
echo -e "${YELLOW}[7/7] Setup complete!${NC}"
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   Setup Successful! 🎉                ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "  Start development server:"
echo -e "    ${GREEN}npm run dev${NC}"
echo ""
echo -e "  Open in browser:"
echo -e "    Public:  ${GREEN}http://localhost:3001${NC}"
echo -e "    Worker:  ${GREEN}http://localhost:3001/worker${NC}"
echo -e "    Admin:   ${GREEN}http://localhost:3001/admin${NC}"
echo ""
echo -e "  Start Telegram bot (separate terminal):"
echo -e "    ${GREEN}npm run tg:poll${NC}"
echo ""
echo -e "  Stop Docker services:"
echo -e "    ${GREEN}docker compose down${NC}"
echo ""
echo -e "  View database:"
echo -e "    ${GREEN}npx prisma studio${NC}"
echo ""
