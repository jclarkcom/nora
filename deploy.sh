#!/bin/bash
#
# Nora Video Call - Deployment Script
# Deploys latest changes to production server and restarts the service
#

set -e  # Exit on error

# Configuration
SERVER="nora.jonathanclark.com"
SSH_KEY="../digital_ocean/id_rsa_digitalocean"
DEPLOY_PATH="/home/deploy/nora"
SERVICE_NAME="nora-server"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Nora Video Call - Deployment${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if there are uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo -e "${YELLOW}⚠️  Warning: You have uncommitted changes${NC}"
    echo ""
    git status --short
    echo ""
    read -p "Do you want to commit these changes? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Enter commit message: " commit_msg
        git add -A
        git commit -m "$commit_msg

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
        echo -e "${GREEN}✓ Changes committed${NC}"
    else
        echo -e "${RED}✗ Deployment cancelled - commit your changes first${NC}"
        exit 1
    fi
fi

# Push to GitHub
echo -e "${BLUE}📤 Pushing to GitHub...${NC}"
if git push; then
    echo -e "${GREEN}✓ Pushed to GitHub${NC}"
else
    echo -e "${RED}✗ Failed to push to GitHub${NC}"
    exit 1
fi

# Deploy to server
echo ""
echo -e "${BLUE}🚀 Deploying to ${SERVER}...${NC}"
echo ""

ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no root@${SERVER} << 'ENDSSH'
    set -e

    echo "📥 Pulling latest code..."
    cd /home/deploy/nora
    git pull

    echo ""
    echo "🔄 Restarting server..."
    systemctl restart nora-server

    echo ""
    echo "⏳ Waiting for server to start..."
    sleep 3

    echo ""
    echo "📊 Server status:"
    systemctl status nora-server --no-pager | head -15
ENDSSH

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  ✓ Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "🌐 Visit: ${BLUE}https://${SERVER}${NC}"
echo ""
