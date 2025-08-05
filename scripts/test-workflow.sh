#!/bin/bash

# Connexio.ai Workflow Testing Script
# Tests the marketing campaign workflow with sample data

set -e

echo "🧪 Testing Connexio.ai Marketing Campaign Workflow..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

LH_HOST=${LITTLEHORSE_API_HOST:-localhost}
LH_PORT=${LITTLEHORSE_API_PORT:-2023}

# Check if lhctl is available
check_lhctl() {
    echo -e "${BLUE}Checking lhctl availability...${NC}"
    
    if ! command -v lhctl &> /dev/null; then
        if [ -f "./lhctl" ]; then
            echo -e "${YELLOW}Using local lhctl${NC}"
            LHCTL="./lhctl"
        else
            echo -e "${RED}❌ lhctl not found. Run dev-setup.sh first${NC}"
            exit 1
        fi
    else
        LHCTL="lhctl"
    fi
    
    echo -e "${GREEN}✅ lhctl available${NC}"
}

# Check Little Horse connection
check_connection() {
    echo -e "${BLUE}Checking Little Horse connection...${NC}"
    
    if ! curl -f "http://${LH_HOST}:9090/health" > /dev/null 2>&1; then
        echo -e "${RED}❌ Little Horse not running or not healthy${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Little Horse connection OK${NC}"
}

# Check if workflow is deployed
check_workflow() {
    echo -e "${BLUE}Checking workflow deployment...${NC}"
    
    $LHCTL get wfSpec marketing-campaign-workflow > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Workflow is deployed${NC}"
    else
        echo -e "${RED}❌ Workflow not deployed. Run deploy-workflows.sh first${NC}"
        exit 1
    fi
}

# Test email campaign creation
test_email_campaign() {
    echo -e "${BLUE}Testing email campaign creation...${NC}"
    
    cat > /tmp/email_campaign_test.json << EOF
{
  "slackCommand": {
    "command": "/connexio",
    "text": "create email campaign for product launch",
    "user_id": "U123TEST",
    "user_name": "test-user",
    "channel_id": "C123TEST",
    "channel_name": "test-channel",
    "team_id": "T123TEST",
    "team_domain": "test-domain",
    "trigger_id": "123.456.test"
  },
  "slackChannelId": "C123TEST",
  "slackUserId": "U123TEST",
  "slackResponseUrl": "https://hooks.slack.com/commands/test"
}
EOF

    echo "Running email campaign workflow..."
    WORKFLOW_ID=$($LHCTL run marketing-campaign-workflow /tmp/email_campaign_test.json | grep "workflow run id" | awk '{print $4}')
    
    if [ -n "$WORKFLOW_ID" ]; then
        echo -e "${GREEN}✅ Email campaign workflow started: $WORKFLOW_ID${NC}"
        monitor_workflow $WORKFLOW_ID
    else
        echo -e "${RED}❌ Failed to start email campaign workflow${NC}"
        exit 1
    fi
}

# Test SMS campaign creation
test_sms_campaign() {
    echo -e "${BLUE}Testing SMS campaign creation...${NC}"
    
    cat > /tmp/sms_campaign_test.json << EOF
{
  "slackCommand": {
    "command": "/connexio",
    "text": "create sms campaign holiday sale 50% off",
    "user_id": "U123TEST",
    "user_name": "test-user",
    "channel_id": "C123TEST",
    "channel_name": "test-channel",
    "team_id": "T123TEST",
    "team_domain": "test-domain",
    "trigger_id": "123.456.test"
  },
  "slackChannelId": "C123TEST",
  "slackUserId": "U123TEST",
  "slackResponseUrl": "https://hooks.slack.com/commands/test"
}
EOF

    echo "Running SMS campaign workflow..."
    WORKFLOW_ID=$($LHCTL run marketing-campaign-workflow /tmp/sms_campaign_test.json | grep "workflow run id" | awk '{print $4}')
    
    if [ -n "$WORKFLOW_ID" ]; then
        echo -e "${GREEN}✅ SMS campaign workflow started: $WORKFLOW_ID${NC}"
        monitor_workflow $WORKFLOW_ID
    else
        echo -e "${RED}❌ Failed to start SMS campaign workflow${NC}"
        exit 1
    fi
}

# Test help command
test_help_command() {
    echo -e "${BLUE}Testing help command...${NC}"
    
    cat > /tmp/help_test.json << EOF
{
  "slackCommand": {
    "command": "/connexio",
    "text": "help",
    "user_id": "U123TEST",
    "user_name": "test-user",
    "channel_id": "C123TEST",
    "channel_name": "test-channel",
    "team_id": "T123TEST",
    "team_domain": "test-domain",
    "trigger_id": "123.456.test"
  },
  "slackChannelId": "C123TEST",
  "slackUserId": "U123TEST",
  "slackResponseUrl": "https://hooks.slack.com/commands/test"
}
EOF

    echo "Running help workflow..."
    WORKFLOW_ID=$($LHCTL run marketing-campaign-workflow /tmp/help_test.json | grep "workflow run id" | awk '{print $4}')
    
    if [ -n "$WORKFLOW_ID" ]; then
        echo -e "${GREEN}✅ Help workflow started: $WORKFLOW_ID${NC}"
        monitor_workflow $WORKFLOW_ID
    else
        echo -e "${RED}❌ Failed to start help workflow${NC}"
        exit 1
    fi
}

# Monitor workflow execution
monitor_workflow() {
    local workflow_id=$1
    echo -e "${BLUE}Monitoring workflow: $workflow_id${NC}"
    
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        local status=$($LHCTL get wfRun $workflow_id --output json | jq -r '.status' 2>/dev/null || echo "UNKNOWN")
        
        case $status in
            "COMPLETED")
                echo -e "${GREEN}✅ Workflow completed successfully${NC}"
                $LHCTL get wfRun $workflow_id
                return 0
                ;;
            "FAILED")
                echo -e "${RED}❌ Workflow failed${NC}"
                $LHCTL get wfRun $workflow_id
                return 1
                ;;
            "RUNNING")
                echo -e "${YELLOW}⏳ Workflow running... (attempt $((attempt+1))/$max_attempts)${NC}"
                ;;
            "UNKNOWN")
                echo -e "${YELLOW}❓ Unknown status (attempt $((attempt+1))/$max_attempts)${NC}"
                ;;
            *)
                echo -e "${BLUE}📊 Status: $status (attempt $((attempt+1))/$max_attempts)${NC}"
                ;;
        esac
        
        sleep 2
        attempt=$((attempt+1))
    done
    
    echo -e "${YELLOW}⚠️  Workflow monitoring timed out${NC}"
    $LHCTL get wfRun $workflow_id
    return 1
}

# List recent workflow runs
list_recent_runs() {
    echo -e "${BLUE}Recent workflow runs:${NC}"
    $LHCTL search wfRun --workflowSpecName marketing-campaign-workflow --limit 10
}

# Show task worker status
show_worker_status() {
    echo -e "${BLUE}Task workers status:${NC}"
    echo "===================="
    
    # Check if workers are running
    if pgrep -f "connexio-workflows" > /dev/null; then
        echo -e "${GREEN}✅ Task workers are running${NC}"
        echo "PID: $(pgrep -f 'connexio-workflows')"
    else
        echo -e "${RED}❌ Task workers not running${NC}"
        echo -e "${YELLOW}💡 Start with: ./scripts/deploy-workflows.sh${NC}"
    fi
}

# Run specific test
run_test() {
    local test_name=$1
    
    case $test_name in
        "email")
            test_email_campaign
            ;;
        "sms") 
            test_sms_campaign
            ;;
        "help")
            test_help_command
            ;;
        "all")
            test_email_campaign
            echo ""
            test_sms_campaign  
            echo ""
            test_help_command
            ;;
        *)
            echo -e "${RED}❌ Unknown test: $test_name${NC}"
            echo "Available tests: email, sms, help, all"
            exit 1
            ;;
    esac
}

# Cleanup test files
cleanup() {
    rm -f /tmp/email_campaign_test.json
    rm -f /tmp/sms_campaign_test.json
    rm -f /tmp/help_test.json
}

# Main execution
main() {
    echo -e "${BLUE}Connexio.ai Workflow Testing${NC}"
    echo "============================="
    
    check_lhctl
    check_connection
    check_workflow
    show_worker_status
    
    echo ""
    
    if [ $# -eq 0 ]; then
        echo "Running all tests..."
        run_test "all"
    else
        run_test $1
    fi
    
    echo ""
    list_recent_runs
    cleanup
    
    echo -e "${GREEN}🎉 Testing completed!${NC}"
}

# Handle script arguments
case "${1:-}" in
    "status")
        check_lhctl
        check_connection
        check_workflow
        show_worker_status
        ;;
    "list")
        check_lhctl
        list_recent_runs
        ;;
    "monitor")
        if [ -z "$2" ]; then
            echo "Usage: $0 monitor <workflow-id>"
            exit 1
        fi
        check_lhctl
        monitor_workflow $2
        ;;
    *)
        main "$@"
        ;;
esac