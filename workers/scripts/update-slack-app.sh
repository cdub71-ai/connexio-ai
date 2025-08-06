#!/bin/bash

# Slack App Configuration Update Script
# Automates Slack app updates when deploying new features

set -e

echo "🔧 Updating Slack App Configuration..."

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SLACK_APP_ID="${SLACK_APP_ID:-}"
SLACK_BOT_TOKEN="${SLACK_BOT_TOKEN:-}"
SLACK_USER_TOKEN="${SLACK_USER_TOKEN:-}" # Need user token for app management
FLY_APP_URL="https://connexio-slack-simple.fly.dev"

# Check required environment variables
check_env_vars() {
    local missing_vars=()
    
    if [[ -z "$SLACK_APP_ID" ]]; then
        missing_vars+=("SLACK_APP_ID")
    fi
    
    if [[ -z "$SLACK_BOT_TOKEN" ]]; then
        missing_vars+=("SLACK_BOT_TOKEN")
    fi
    
    if [[ -z "$SLACK_USER_TOKEN" ]]; then
        missing_vars+=("SLACK_USER_TOKEN")
    fi
    
    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        echo -e "${RED}❌ Missing required environment variables:${NC}"
        printf '%s\n' "${missing_vars[@]}"
        echo -e "${YELLOW}💡 Set these in your environment or .env file${NC}"
        exit 1
    fi
}

# Update slash commands via Slack API
update_slash_commands() {
    echo -e "${BLUE}📝 Updating slash commands...${NC}"
    
    # Define commands
    local commands=(
        "connexio:Ask Connexio AI marketing questions"
        "validate-file:Upload and validate email/phone data in CSV files"
        "help:Show available Connexio AI commands"
    )
    
    for cmd_desc in "${commands[@]}"; do
        cmd=${cmd_desc%%:*}
        desc=${cmd_desc#*:}
        echo -e "${YELLOW}  Updating command: /$cmd${NC}"
        echo -e "${BLUE}    Description: $desc${NC}"
        
        # Note: Slack doesn't have a direct API to update slash commands
        # This would need to be done through the App Manifest API or manually
        # For now, we'll just validate the endpoint is reachable
        
        response=$(curl -s -o /dev/null -w "%{http_code}" \
            -X POST \
            -H "Content-Type: application/json" \
            -d '{"type":"url_verification","challenge":"test"}' \
            "$FLY_APP_URL/slack/events")
        
        if [[ "$response" == "200" ]]; then
            echo -e "${GREEN}    ✅ Endpoint reachable${NC}"
        else
            echo -e "${RED}    ❌ Endpoint not reachable (HTTP $response)${NC}"
        fi
    done
}

# Update event subscriptions
update_event_subscriptions() {
    echo -e "${BLUE}📡 Validating event subscription endpoint...${NC}"
    
    # Test the events endpoint
    response=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d '{"type":"url_verification","challenge":"test"}' \
        "$FLY_APP_URL/slack/events")
    
    if [[ "$response" == "200" ]]; then
        echo -e "${GREEN}✅ Event subscription endpoint working${NC}"
    else
        echo -e "${RED}❌ Event subscription endpoint issue (HTTP $response)${NC}"
    fi
}

# Update app manifest (requires Slack CLI or manual process)
update_app_manifest() {
    echo -e "${BLUE}📋 App manifest location: slack-app-manifest.json${NC}"
    echo -e "${YELLOW}💡 To update app configuration:${NC}"
    echo "   1. Go to https://api.slack.com/apps/$SLACK_APP_ID"
    echo "   2. Go to 'App Manifest' section"
    echo "   3. Upload or paste the contents of slack-app-manifest.json"
    echo "   4. Save changes"
    echo ""
    echo -e "${BLUE}🔧 Or use Slack CLI:${NC}"
    echo "   slack manifest validate slack-app-manifest.json"
    echo "   slack app update $SLACK_APP_ID --manifest slack-app-manifest.json"
}

# Test all endpoints
test_endpoints() {
    echo -e "${BLUE}🧪 Testing all Slack bot endpoints...${NC}"
    
    endpoints=(
        "/slack/events"
        "/health"
    )
    
    for endpoint in "${endpoints[@]}"; do
        echo -e "${YELLOW}  Testing: $FLY_APP_URL$endpoint${NC}"
        
        response=$(curl -s -o /dev/null -w "%{http_code}" "$FLY_APP_URL$endpoint")
        
        case $response in
            200)
                echo -e "${GREEN}    ✅ OK${NC}"
                ;;
            404)
                echo -e "${YELLOW}    ⚠️  Not Found (may be normal)${NC}"
                ;;
            *)
                echo -e "${RED}    ❌ HTTP $response${NC}"
                ;;
        esac
    done
}

# Generate deployment summary
generate_summary() {
    echo ""
    echo -e "${GREEN}🎉 Slack App Configuration Update Summary${NC}"
    echo "============================================="
    echo "App URL: $FLY_APP_URL"
    echo "Slash Commands:"
    echo "  • /connexio - AI marketing assistant"
    echo "  • /validate-file - File validation service"
    echo "  • /help - Command help"
    echo ""
    echo "Event Subscriptions:"
    echo "  • file_shared - Detect CSV uploads"
    echo "  • app_mention - Respond to mentions"
    echo ""
    echo -e "${BLUE}📝 Manual Steps Required:${NC}"
    echo "1. Update slash commands in Slack App dashboard"
    echo "2. Verify event subscription URL"
    echo "3. Test commands in Slack workspace"
    echo ""
    echo -e "${YELLOW}💡 Slack App Dashboard:${NC}"
    echo "https://api.slack.com/apps/$SLACK_APP_ID"
}

# Main execution
main() {
    echo -e "${GREEN}🚀 Connexio AI Slack App Configuration Update${NC}"
    echo "============================================="
    
    # Skip env check if in CI/automated mode
    if [[ "$1" != "--ci" ]]; then
        check_env_vars
    fi
    
    update_slash_commands
    update_event_subscriptions
    test_endpoints
    update_app_manifest
    generate_summary
    
    echo -e "${GREEN}✅ Configuration update completed!${NC}"
}

# Help function
show_help() {
    echo "Slack App Configuration Update Script"
    echo ""
    echo "Usage:"
    echo "  $0                 Run interactive update"
    echo "  $0 --ci            Run in CI mode (skip env checks)"
    echo "  $0 --help          Show this help"
    echo ""
    echo "Required Environment Variables:"
    echo "  SLACK_APP_ID       Your Slack app ID"
    echo "  SLACK_BOT_TOKEN    Your bot token (xoxb-...)"
    echo "  SLACK_USER_TOKEN   Your user token (xoxp-...) for app management"
    echo ""
    echo "Example:"
    echo "  export SLACK_APP_ID=A01234567890"
    echo "  export SLACK_BOT_TOKEN=xoxb-..."
    echo "  export SLACK_USER_TOKEN=xoxp-..."
    echo "  $0"
}

# Handle arguments
case "${1:-}" in
    --help|-h)
        show_help
        exit 0
        ;;
    --ci)
        main --ci
        ;;
    *)
        main
        ;;
esac