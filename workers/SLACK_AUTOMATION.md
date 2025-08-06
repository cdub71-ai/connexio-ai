# 🤖 Slack App Configuration Automation

This directory contains tools to automate Slack app configuration updates when deploying new features.

## 🚀 Quick Start

### Option 1: Manual Script (Recommended)
```bash
# Set your environment variables
export SLACK_APP_ID="A01234567890"
export SLACK_BOT_TOKEN="xoxb-your-bot-token"

# Run the update script
./scripts/update-slack-app.sh
```

### Option 2: Node.js Script
```bash
# Install dependencies (if needed)
npm install @slack/web-api

# Run the validation script
node scripts/quick-slack-update.js
```

### Option 3: GitHub Actions (Automated)
The GitHub Actions workflow automatically:
- Deploys to Fly.io
- Validates Slack endpoints
- Provides update instructions
- Notifies deployment status

## 📋 Required Environment Variables

```bash
# Slack App Configuration
SLACK_APP_ID=A01234567890          # Your Slack app ID
SLACK_BOT_TOKEN=xoxb-...           # Bot token (starts with xoxb-)
SLACK_USER_TOKEN=xoxp-...          # User token for app management (optional)

# Deployment
FLY_API_TOKEN=fly_token            # Fly.io API token (for CI/CD)
SLACK_WEBHOOK_URL=https://...      # Slack webhook for notifications (optional)
```

## 🔧 What Gets Automated

### ✅ Automated
- **Endpoint Validation**: Tests if your bot endpoints are reachable
- **Health Checks**: Verifies the deployment is working
- **Configuration Generation**: Creates proper Slack app manifest
- **Deployment Notifications**: Alerts when deployments complete

### 🔄 Semi-Automated (Requires Manual Confirmation)
- **Slash Command URLs**: Script generates correct URLs, you paste them
- **Event Subscription URLs**: Script validates, you confirm in dashboard
- **OAuth Scopes**: Script lists required scopes, you verify

### 📝 Manual Steps Still Required
1. **Slash Commands**: Update URLs in Slack App dashboard
2. **Event Subscriptions**: Set request URL and bot events
3. **OAuth Scopes**: Verify required permissions
4. **Testing**: Test commands in your Slack workspace

## 📊 Current Configuration

### Slash Commands
- `/connexio` → AI marketing assistant
- `/validate-file` → File validation service  
- `/help` → Command help

**Request URL**: `https://connexio-slack-simple.fly.dev/slack/events`

### Event Subscriptions
- `file_shared` → Detect CSV file uploads
- `app_mention` → Respond to @mentions

**Request URL**: `https://connexio-slack-simple.fly.dev/slack/events`

### Required OAuth Scopes
- `commands` → Slash command access
- `chat:write` → Send messages
- `files:read` → Access uploaded files
- `channels:history` → Read message history
- `app_mentions:read` → Receive mentions

## 🛠️ Manual Update Process

1. **Go to Slack App Dashboard**:
   ```
   https://api.slack.com/apps/YOUR_APP_ID
   ```

2. **Update Slash Commands**:
   - Go to "Slash Commands"
   - For each command, set Request URL to:
     ```
     https://connexio-slack-simple.fly.dev/slack/events
     ```

3. **Update Event Subscriptions**:
   - Go to "Event Subscriptions"
   - Set Request URL to:
     ```
     https://connexio-slack-simple.fly.dev/slack/events
     ```
   - Subscribe to bot events: `file_shared`, `app_mention`

4. **Verify OAuth Scopes**:
   - Go to "OAuth & Permissions"
   - Ensure all required scopes are enabled

5. **Test in Slack**:
   - Try `/connexio` command
   - Upload a CSV file
   - Test file validation workflow

## 🔍 Troubleshooting

### Common Issues

**❌ "dispatch_failed" errors**:
- Check that Request URLs point to the correct endpoint
- Verify the bot is deployed and accessible

**❌ Commands not appearing**:
- Reinstall the app to your workspace
- Check OAuth scopes are correct

**❌ File detection not working**:
- Verify `file_shared` event is subscribed
- Check `files:read` permission is granted

### Debug Commands

```bash
# Test endpoint health
curl https://connexio-slack-simple.fly.dev/health

# Test Slack events endpoint
curl -X POST https://connexio-slack-simple.fly.dev/slack/events \
  -H "Content-Type: application/json" \
  -d '{"type":"url_verification","challenge":"test"}'

# Check deployment status
flyctl status --app connexio-slack-simple
```

## 🚀 Future Automation Ideas

- **Slack CLI Integration**: Use official Slack CLI for full automation
- **Terraform Provider**: Manage Slack apps as infrastructure
- **App Manifest API**: Programmatically update app configuration
- **Continuous Testing**: Automated Slack command testing

## 📚 Resources

- [Slack App Manifest](https://api.slack.com/reference/manifests)
- [Slack CLI](https://api.slack.com/automation/cli)
- [Fly.io Deployment](https://fly.io/docs/)
- [GitHub Actions](https://docs.github.com/en/actions)