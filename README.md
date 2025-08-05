# Connexio.ai

AI Marketing Ops Agent that executes marketing campaigns through Slack and Microsoft Teams commands.

## Architecture

- **Little Horse**: Workflow orchestration for campaign execution
- **Claude API**: Natural language processing and content generation
- **Sureshot**: Marketing campaign execution (Eloqua, Twilio, etc.)
- **Slack/Teams**: Chat interfaces for command execution

## Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your API keys and configuration
   ```

3. **Start the application**:
   ```bash
   npm run dev
   ```

## Environment Variables

### Slack Configuration
- `SLACK_BOT_TOKEN`: Bot user OAuth token
- `SLACK_SIGNING_SECRET`: Signing secret from Slack app
- `SLACK_APP_TOKEN`: App-level token for Socket Mode

### Microsoft Teams Configuration
- `MICROSOFT_APP_ID`: Bot app ID from Azure
- `MICROSOFT_APP_PASSWORD`: Bot app password
- `MICROSOFT_APP_TENANT_ID`: Azure tenant ID

### Anthropic Claude API
- `ANTHROPIC_API_KEY`: Claude API key

### Little Horse Configuration
- `LITTLEHORSE_API_HOST`: Little Horse server host
- `LITTLEHORSE_API_PORT`: Little Horse server port
- `LITTLEHORSE_CLIENT_ID`: Client ID for authentication
- `LITTLEHORSE_CLIENT_SECRET`: Client secret for authentication

### Sureshot Configuration
- `SURESHOT_API_KEY`: Sureshot API key
- `SURESHOT_BASE_URL`: Sureshot API base URL
- `SURESHOT_WORKSPACE_ID`: Workspace identifier

## Available Commands

### Slack Commands
- `/connexio [message]` - Chat with AI agent
- `/create-campaign` - Create marketing campaigns
- `/campaign-status [id]` - Check campaign status

### Teams Commands
- `/connexio [message]` - Chat with AI agent
- `/create-campaign` - Create marketing campaigns
- `/campaign-status [id]` - Check campaign status

## Project Structure

```
connexio-ai/
├── src/
│   ├── bots/
│   │   ├── slack-bot.js       # Slack bot implementation
│   │   └── teams-bot.js       # Teams bot implementation
│   ├── services/
│   │   ├── anthropic.js       # Claude API integration
│   │   ├── sureshot.js        # Sureshot API integration
│   │   └── littlehorse.js     # Workflow orchestration
│   ├── utils/
│   │   └── logger.js          # Winston logging configuration
│   └── index.js               # Application entry point
├── config/
│   └── index.js               # Configuration management
├── workflows/                 # Little Horse workflow definitions
├── workers/                   # Little Horse task workers
├── tests/                     # Test files
└── docs/                      # Documentation
```

## Development

1. **Start in development mode**:
   ```bash
   npm run dev
   ```

2. **Run tests**:
   ```bash
   npm test
   ```

3. **Lint code**:
   ```bash
   npm run lint
   ```

4. **Format code**:
   ```bash
   npm run format
   ```

## Deployment

The application supports both Slack (Socket Mode) and Teams (webhook) simultaneously:

- **Slack**: Uses Socket Mode for real-time communication
- **Teams**: Receives webhooks at `/api/messages` endpoint
- **Health Check**: Available at `/health` endpoint

## Workflows

Little Horse orchestrates campaign execution through predefined workflows:

1. **Email Campaign Workflow**: Content generation → Campaign creation → Notification
2. **SMS Campaign Workflow**: Content generation → Campaign creation → Notification  
3. **Analytics Workflow**: Data fetching → Report generation → Delivery

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request