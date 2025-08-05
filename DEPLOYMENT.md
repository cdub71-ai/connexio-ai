# 🚀 Connexio AI Deployment Guide - Fly.io

This guide walks you through deploying the complete Connexio AI marketing automation system with Little Horse workflow orchestration to Fly.io.

## 📋 Prerequisites

### Required Tools
```bash
# Install Fly.io CLI
curl -L https://fly.io/install.sh | sh

# Verify installation
flyctl version

# Install Docker (if not already installed)
# macOS: Download from https://docker.com
# Linux: sudo apt-get install docker.io
# Windows: Download Docker Desktop
```

### Required Accounts & API Keys
- **Fly.io Account**: Sign up at [fly.io](https://fly.io)
- **Anthropic API Key**: Get from [console.anthropic.com](https://console.anthropic.com)
- **Slack App**: Create at [api.slack.com](https://api.slack.com)
- **Twilio Account**: Sign up at [twilio.com](https://twilio.com)
- **SureShot API Key**: Get from your SureShot account
- **Apollo API Key**: Get from [apolloapi.com](https://apolloapi.com)
- **Leadspace API Key**: Get from your Leadspace account

## 🏗️ Architecture Overview

The deployment consists of these services on Fly.io:

```
┌─────────────────────────────────────────────────────────────┐
│                    Connexio AI on Fly.io                    │
├─────────────────────────────────────────────────────────────┤
│ 🔧 connexio-ai-postgres          │ PostgreSQL Database      │
│ 📊 connexio-ai-redis             │ Redis Cache & Sessions   │
│ 🐎 connexio-ai-littlehorse       │ Little Horse Kernel      │
│ 👨‍💼 connexio-ai-workers            │ Main Task Workers        │
│ 🔍 connexio-ai-enrichment-workers │ Data Enrichment Workers  │
│ 🎯 connexio-ai-orchestration-workers │ Campaign Orchestration │
│ ⚡ connexio-ai-autoscaling        │ Auto-scaling Service     │
└─────────────────────────────────────────────────────────────┘
```

## 🔧 Step-by-Step Deployment

### Step 1: Prepare Environment

1. **Clone and Navigate to Project**:
   ```bash
   cd /path/to/connexio-ai
   ```

2. **Create Production Environment File**:
   ```bash
   cp .env.production.template .env.production
   ```

3. **Fill in API Keys** (edit `.env.production`):
   ```bash
   # Required API keys - replace with your actual values
   ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
   SLACK_BOT_TOKEN=xoxb-your-token-here
   SLACK_SIGNING_SECRET=your-secret-here
   TWILIO_ACCOUNT_SID=your-sid-here
   TWILIO_AUTH_TOKEN=your-token-here
   SURESHOT_API_KEY=your-key-here
   APOLLO_API_KEY=your-key-here
   LEADSPACE_API_KEY=your-key-here
   ```

### Step 2: Authenticate with Fly.io

```bash
# Login to Fly.io
flyctl auth login

# Create organization (if needed)
flyctl orgs create connexio-ai

# Set organization context
flyctl orgs select connexio-ai
```

### Step 3: Deploy with Automated Script

The project includes a comprehensive deployment script:

```bash
# Quick deployment (with tests)
./deploy/deploy.sh production

# Skip tests for faster deployment
./deploy/deploy.sh production --skip-tests

# Dry run to see what would be deployed
./deploy/deploy.sh production --dry-run

# Skip build if already built
./deploy/deploy.sh production --skip-build
```

### Step 4: Manual Deployment (Alternative)

If you prefer manual control:

#### 4.1 Deploy Databases
```bash
cd deploy
flyctl deploy --config postgres-fly.toml
flyctl deploy --config redis-fly.toml
cd ..
```

#### 4.2 Deploy Little Horse Kernel
```bash
flyctl deploy --config fly.toml
```

#### 4.3 Deploy Workers
```bash
cd workers
flyctl deploy --config fly.toml
flyctl deploy --config fly-enrichment.toml
flyctl deploy --config fly-orchestration.toml
cd ..
```

#### 4.4 Deploy Auto-scaling Service
```bash
cd deploy
flyctl deploy --config fly-autoscaling.toml
cd ..
```

## 🔒 Security & Secrets Management

The deployment automatically handles secrets:

1. **Database passwords**, **JWT secrets**, and **encryption keys** are auto-generated
2. **API keys** must be provided in `.env.production`
3. **Secrets are stored securely** in Fly.io's secret management
4. **Generated secrets** are saved to `.env.secrets` (keep this file secure!)

### Manual Secret Management

```bash
# Set secrets for specific app
flyctl secrets set ANTHROPIC_API_KEY=your-key -a connexio-ai-workers

# List current secrets
flyctl secrets list -a connexio-ai-workers

# Remove a secret
flyctl secrets unset SECRET_NAME -a connexio-ai-workers
```

## 📊 Monitoring & Health Checks

### Health Check Endpoints

- **Little Horse**: `https://connexio-ai-littlehorse.fly.dev/health`
- **Workers**: `https://connexio-ai-workers.fly.dev/health`
- **Enrichment**: `https://connexio-ai-enrichment-workers.fly.dev/health`
- **Orchestration**: `https://connexio-ai-orchestration-workers.fly.dev/health`
- **Auto-scaling**: `https://connexio-ai-autoscaling.fly.dev/health`

### Monitoring Commands

```bash
# View application status
flyctl status -a connexio-ai-littlehorse

# Monitor logs in real-time
flyctl logs -a connexio-ai-workers

# Check scaling metrics
./deploy/scaling-cli.js status

# View detailed metrics
./deploy/scaling-cli.js metrics
```

## 🔧 Configuration & Scaling

### Auto-scaling Configuration

The system automatically scales based on:
- **CPU usage** (target: 70%)
- **Memory usage** (target: 80%)
- **Request rate** (target: 100 req/sec)

### Manual Scaling

```bash
# Scale workers manually
flyctl scale count 5 -a connexio-ai-workers

# Scale up/down specific machine types
flyctl scale memory 4gb -a connexio-ai-littlehorse
flyctl scale cpu 4 -a connexio-ai-littlehorse
```

### Resource Allocation

| Service | CPU | Memory | Min Instances | Max Instances |
|---------|-----|--------|---------------|---------------|
| Little Horse | 4 cores | 8GB | 2 | 5 |
| Workers | 2 cores | 2GB | 1 | 10 |
| Enrichment | 2 cores | 2GB | 1 | 5 |
| Orchestration | 2 cores | 2GB | 1 | 5 |
| Auto-scaling | 1 core | 1GB | 1 | 2 |

## 🐛 Troubleshooting

### Common Issues

1. **Deployment Failed**:
   ```bash
   # Check detailed logs
   flyctl logs -a connexio-ai-littlehorse
   
   # Check app status
   flyctl status -a connexio-ai-littlehorse
   ```

2. **Database Connection Issues**:
   ```bash
   # Check PostgreSQL status
   flyctl status -a connexio-ai-postgres
   
   # Access database console
   flyctl ssh console -a connexio-ai-postgres
   ```

3. **Worker Not Processing Tasks**:
   ```bash
   # Check worker logs
   flyctl logs -a connexio-ai-workers
   
   # Restart workers
   flyctl apps restart connexio-ai-workers
   ```

4. **Little Horse Connectivity Issues**:
   ```bash
   # Check internal networking
   flyctl ssh console -a connexio-ai-workers
   # Inside container: curl connexio-ai-littlehorse.internal:2023/health
   ```

### Rollback Deployment

```bash
# Rollback all services to previous version
./deploy/deploy.sh production --rollback

# Rollback specific service
flyctl releases rollback -a connexio-ai-workers
```

## 🔄 Updates & Maintenance

### Update Application

```bash
# Deploy latest code changes
git pull origin main
./deploy/deploy.sh production --skip-tests

# Deploy with full testing
./deploy/deploy.sh production
```

### Database Migrations

```bash
# Run database migrations
flyctl ssh console -a connexio-ai-postgres
# Inside container: npm run migrate
```

### Update Little Horse Version

1. Update version in `fly.toml`:
   ```toml
   [build]
   image = "littlehorsecorp/littlehorse:0.15.0"  # Update version
   ```

2. Deploy:
   ```bash
   flyctl deploy --config fly.toml
   ```

## 📈 Performance Optimization

### Database Optimization
- **Connection pooling** is enabled by default
- **Read replicas** can be added for high-read workloads
- **Backup strategy** includes daily automated backups

### Caching Strategy
- **Redis** for session storage and frequent queries
- **Application-level caching** for Claude API responses
- **Little Horse** provides built-in workflow state caching

### Network Optimization
- **Internal networking** between services via `.internal` domains
- **CDN integration** available for static assets
- **Health checks** optimized for minimal overhead

## 🎯 Next Steps After Deployment

1. **Configure Slack App**:
   - Update your Slack app's webhook URL to `https://connexio-ai-workers.fly.dev/slack/events`
   
2. **Set up Monitoring Alerts**:
   - Configure webhook URLs in auto-scaling service
   - Set up Slack notifications for system alerts

3. **Test Workflows**:
   ```bash
   # Test basic workflow
   curl -X POST https://connexio-ai-workers.fly.dev/test/workflow \\
        -H "Content-Type: application/json" \\
        -d '{"command": "create email campaign for new users"}'
   ```

4. **Monitor Performance**:
   - Check auto-scaling dashboard
   - Review application metrics
   - Monitor database performance

## 🆘 Support & Resources

- **Fly.io Documentation**: [fly.io/docs](https://fly.io/docs)
- **Little Horse Documentation**: [littlehorse.io/docs](https://littlehorse.io/docs)
- **Project Issues**: Report issues in the project repository
- **Deployment Logs**: Always available via `flyctl logs -a <app-name>`

---

## 🎉 Deployment Complete!

Your Connexio AI marketing automation system is now running on Fly.io with:
- ✅ **High availability** with auto-scaling
- ✅ **Global distribution** via Fly.io's edge network
- ✅ **Secure secret management**
- ✅ **Comprehensive monitoring**
- ✅ **Little Horse workflow orchestration**
- ✅ **Enhanced Claude API integration**

The system is ready to handle marketing campaigns at scale! 🚀