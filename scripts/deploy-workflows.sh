#!/bin/bash

# Connexio.ai Workflow Deployment Script
# Builds and deploys Little Horse workflows for marketing campaigns

set -e

echo "🚀 Deploying Connexio.ai Workflows..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

WORKFLOWS_DIR="workflows/java"
JAR_NAME="connexio-workflows-1.0.0.jar"

# Check if Little Horse is running
check_littlehorse() {
    echo -e "${BLUE}Checking Little Horse connection...${NC}"
    
    LH_HOST=${LITTLEHORSE_API_HOST:-localhost}
    LH_PORT=${LITTLEHORSE_API_PORT:-2023}
    
    if ! curl -f "http://${LH_HOST}:9090/health" > /dev/null 2>&1; then
        echo -e "${RED}❌ Little Horse is not running or not healthy${NC}"
        echo -e "${YELLOW}💡 Start Little Horse with: ./scripts/dev-setup.sh${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Little Horse is healthy${NC}"
}

# Build workflows JAR
build_workflows() {
    echo -e "${BLUE}Building workflows JAR...${NC}"
    
    if [ ! -d "$WORKFLOWS_DIR" ]; then
        echo -e "${RED}❌ Workflows directory not found: $WORKFLOWS_DIR${NC}"
        exit 1
    fi
    
    cd "$WORKFLOWS_DIR"
    
    echo "Compiling Java workflows..."
    mvn clean compile -q
    
    echo "Running tests..."
    mvn test -q
    
    echo "Building JAR..."
    mvn package -q
    
    if [ ! -f "target/$JAR_NAME" ]; then
        echo -e "${RED}❌ JAR build failed${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ JAR built successfully: target/$JAR_NAME${NC}"
    cd - > /dev/null
}

# Deploy workflows
deploy_workflows() {
    echo -e "${BLUE}Deploying workflows to Little Horse...${NC}"
    
    # Set environment variables
    export LITTLEHORSE_API_HOST=${LITTLEHORSE_API_HOST:-localhost}
    export LITTLEHORSE_API_PORT=${LITTLEHORSE_API_PORT:-2023}
    
    # Check configuration
    echo "Checking configuration..."
    java -cp "$WORKFLOWS_DIR/target/$JAR_NAME" ai.connexio.workflows.WorkflowDeployer --check-config
    
    # Deploy workflows (run once to deploy specs)
    echo "Deploying workflow specifications..."
    timeout 30s java -cp "$WORKFLOWS_DIR/target/$JAR_NAME" ai.connexio.workflows.WorkflowDeployer --deploy-only || {
        if [ $? -eq 124 ]; then
            echo -e "${GREEN}✅ Workflows deployed (timed out waiting, which is expected)${NC}"
        else
            echo -e "${RED}❌ Workflow deployment failed${NC}"
            exit 1
        fi
    }
}

# Start workers
start_workers() {
    echo -e "${BLUE}Starting task workers...${NC}"
    
    # Check if workers are already running
    if pgrep -f "connexio-workflows" > /dev/null; then
        echo -e "${YELLOW}⚠️  Workers already running. Stopping existing workers...${NC}"
        pkill -f "connexio-workflows" || true
        sleep 2
    fi
    
    # Start workers in background
    echo "Starting workers in background..."
    nohup java -cp "$WORKFLOWS_DIR/target/$JAR_NAME" ai.connexio.workflows.WorkflowDeployer > logs/workers.log 2>&1 &
    
    WORKER_PID=$!
    echo $WORKER_PID > .worker.pid
    
    # Wait a moment and check if workers started successfully
    sleep 3
    if ps -p $WORKER_PID > /dev/null; then
        echo -e "${GREEN}✅ Task workers started successfully (PID: $WORKER_PID)${NC}"
        echo -e "${BLUE}📋 Logs: tail -f logs/workers.log${NC}"
    else
        echo -e "${RED}❌ Failed to start task workers${NC}"
        cat logs/workers.log
        exit 1
    fi
}

# Show status
show_status() {
    echo -e "${BLUE}Deployment Status:${NC}"
    echo "=================="
    
    # Check Little Horse
    if curl -f "http://localhost:9090/health" > /dev/null 2>&1; then
        echo -e "• Little Horse: ${GREEN}✅ Running${NC}"
    else
        echo -e "• Little Horse: ${RED}❌ Not running${NC}"
    fi
    
    # Check workers
    if [ -f .worker.pid ] && ps -p $(cat .worker.pid) > /dev/null 2>&1; then
        echo -e "• Task Workers: ${GREEN}✅ Running (PID: $(cat .worker.pid))${NC}"
    else
        echo -e "• Task Workers: ${RED}❌ Not running${NC}"
    fi
    
    echo ""
    echo -e "${GREEN}🎉 Connexio.ai workflows are ready!${NC}"
    echo ""
    echo "Available workflows:"
    echo "• marketing-campaign-workflow"
    echo ""
    echo "Task workers:"
    echo "• parse-slack-command"
    echo "• execute-campaign-action"  
    echo "• send-slack-response"
    echo ""
    echo "Useful commands:"
    echo "• Check logs: tail -f logs/workers.log"
    echo "• Stop workers: ./scripts/deploy-workflows.sh stop"
    echo "• Restart: ./scripts/deploy-workflows.sh restart"
}

# Stop workers
stop_workers() {
    echo -e "${BLUE}Stopping task workers...${NC}"
    
    if [ -f .worker.pid ]; then
        PID=$(cat .worker.pid)
        if ps -p $PID > /dev/null 2>&1; then
            echo "Stopping workers (PID: $PID)..."
            kill $PID
            sleep 2
            
            # Force kill if still running
            if ps -p $PID > /dev/null 2>&1; then
                echo "Force stopping..."
                kill -9 $PID
            fi
        fi
        rm -f .worker.pid
    fi
    
    # Kill any remaining processes
    pkill -f "connexio-workflows" || true
    
    echo -e "${GREEN}✅ Task workers stopped${NC}"
}

# Create logs directory
mkdir -p logs

# Handle script arguments
case "${1:-}" in
    "stop")
        stop_workers
        ;;
    "restart")
        echo "🔄 Restarting Connexio.ai workflows..."
        stop_workers
        sleep 2
        build_workflows
        deploy_workflows
        start_workers
        show_status
        ;;
    "build-only")
        build_workflows
        ;;
    "deploy-only")
        check_littlehorse
        deploy_workflows
        ;;
    "workers-only")
        start_workers
        ;;
    "status")
        show_status
        ;;
    *)
        # Full deployment
        check_littlehorse
        build_workflows
        deploy_workflows
        start_workers
        show_status
        ;;
esac