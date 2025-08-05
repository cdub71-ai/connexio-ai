#!/bin/bash

# Connexio.ai Development Setup Script
# Sets up Little Horse with Docker for local development

set -e

echo "🚀 Starting Connexio.ai Development Setup..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if Docker is running
check_docker() {
    echo -e "${BLUE}Checking Docker...${NC}"
    if ! docker info > /dev/null 2>&1; then
        echo -e "${RED}❌ Docker is not running. Please start Docker Desktop and try again.${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Docker is running${NC}"
}

# Check if .env file exists
check_env() {
    echo -e "${BLUE}Checking environment configuration...${NC}"
    if [ ! -f .env ]; then
        echo -e "${YELLOW}⚠️  .env file not found. Creating from .env.example...${NC}"
        cp .env.example .env
        echo -e "${YELLOW}📝 Please edit .env file with your API keys before continuing.${NC}"
        echo -e "${YELLOW}   Required: SLACK_BOT_TOKEN, ANTHROPIC_API_KEY, SURESHOT_API_KEY${NC}"
        read -p "Press Enter to continue once you've configured .env..."
    fi
    echo -e "${GREEN}✅ Environment file exists${NC}"
}

# Start Little Horse stack
start_littlehorse() {
    echo -e "${BLUE}Starting Little Horse stack...${NC}"
    
    # Stop any existing containers
    echo "Stopping existing containers..."
    docker-compose down --remove-orphans
    
    # Start Kafka first
    echo "Starting Kafka..."
    docker-compose up -d kafka
    
    # Wait for Kafka to be ready
    echo "Waiting for Kafka to be ready..."
    sleep 30
    
    # Start Little Horse
    echo "Starting Little Horse..."
    docker-compose up -d littlehorse
    
    # Wait for Little Horse to be ready
    echo "Waiting for Little Horse to be ready..."
    for i in {1..60}; do
        if curl -f http://localhost:9090/health > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Little Horse is ready!${NC}"
            break
        fi
        if [ $i -eq 60 ]; then
            echo -e "${RED}❌ Little Horse failed to start${NC}"
            echo "Check logs with: docker-compose logs littlehorse"
            exit 1
        fi
        echo "Waiting... ($i/60)"
        sleep 2
    done
}

# Start additional services
start_services() {
    echo -e "${BLUE}Starting additional services...${NC}"
    
    # Start Kafka UI for debugging
    docker-compose up -d kafka-ui
    
    echo -e "${GREEN}✅ All services started${NC}"
}

# Show status
show_status() {
    echo -e "${BLUE}Service Status:${NC}"
    echo "===================="
    docker-compose ps
    echo ""
    echo -e "${GREEN}🎉 Development environment is ready!${NC}"
    echo ""
    echo "Available services:"
    echo "• Little Horse API: http://localhost:2023"
    echo "• Little Horse Health: http://localhost:9090/health"
    echo "• Kafka UI: http://localhost:8080"
    echo "• Connexio App: http://localhost:3000 (when started)"
    echo ""
    echo "Useful commands:"
    echo "• Start app: npm run dev"
    echo "• View logs: docker-compose logs [service]"
    echo "• Stop all: docker-compose down"
    echo "• Restart LH: docker-compose restart littlehorse"
}

# Install lhctl (Little Horse CLI)
install_lhctl() {
    echo -e "${BLUE}Installing lhctl (Little Horse CLI)...${NC}"
    
    if command -v lhctl &> /dev/null; then
        echo -e "${GREEN}✅ lhctl already installed${NC}"
        return
    fi
    
    # Download lhctl based on OS
    OS=$(uname -s | tr '[:upper:]' '[:lower:]')
    ARCH=$(uname -m)
    
    case $ARCH in
        x86_64) ARCH="amd64" ;;
        arm64|aarch64) ARCH="arm64" ;;
    esac
    
    LH_VERSION="0.10.0"
    LHCTL_URL="https://github.com/littlehorse-enterprises/littlehorse/releases/download/${LH_VERSION}/lhctl-${OS}-${ARCH}"
    
    echo "Downloading lhctl for ${OS}-${ARCH}..."
    curl -L -o ./lhctl "$LHCTL_URL"
    chmod +x ./lhctl
    
    echo -e "${GREEN}✅ lhctl downloaded to ./lhctl${NC}"
    echo -e "${YELLOW}💡 Add to PATH: sudo mv ./lhctl /usr/local/bin/lhctl${NC}"
}

# Main execution
main() {
    echo -e "${BLUE}Connexio.ai Development Setup${NC}"
    echo "=============================="
    
    check_docker
    check_env
    install_lhctl
    start_littlehorse
    start_services
    show_status
    
    echo -e "${GREEN}🎯 Setup complete! Ready for development.${NC}"
}

# Handle script arguments
case "${1:-}" in
    "clean")
        echo "🧹 Cleaning up Docker resources..."
        docker-compose down --volumes --remove-orphans
        docker system prune -f
        echo "✅ Cleanup complete"
        ;;
    "logs")
        docker-compose logs -f "${2:-littlehorse}"
        ;;
    "restart")
        echo "🔄 Restarting Little Horse..."
        docker-compose restart littlehorse
        ;;
    "status")
        show_status
        ;;
    *)
        main
        ;;
esac