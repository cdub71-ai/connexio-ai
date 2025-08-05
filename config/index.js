import dotenv from 'dotenv';

dotenv.config();

export const config = {
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    appToken: process.env.SLACK_APP_TOKEN,
  },
  teams: {
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD,
    tenantId: process.env.MICROSOFT_APP_TENANT_ID,
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  littlehorse: {
    apiHost: process.env.LITTLEHORSE_API_HOST || 'localhost',
    apiPort: process.env.LITTLEHORSE_API_PORT || 2023,
    clientId: process.env.LITTLEHORSE_CLIENT_ID,
    clientSecret: process.env.LITTLEHORSE_CLIENT_SECRET,
  },
  sureshot: {
    apiKey: process.env.SURESHOT_API_KEY,
    baseUrl: process.env.SURESHOT_BASE_URL || 'https://api.sureshot.com',
    workspaceId: process.env.SURESHOT_WORKSPACE_ID,
  },
  app: {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3000,
    logLevel: process.env.LOG_LEVEL || 'info',
  },
};