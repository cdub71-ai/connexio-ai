# Connexio AI Fly.io Deployment

This directory contains all the configuration and scripts needed to deploy Connexio AI to Fly.io.

## Overview

The deployment consists of multiple interconnected services:

- **Little Horse Kernel** (`connexio-ai-littlehorse`) - Main workflow orchestration engine
- **Main Workers** (`connexio-ai-workers`) - General task processing workers
- **Enrichment Workers** (`connexio-ai-enrichment-workers`) - Data enrichment processing
- **Orchestration Workers** (`connexio-ai-orchestration-workers`) - Campaign orchestration
- **PostgreSQL** (`connexio-ai-postgres`) - Primary database
- **Redis** (`connexio-ai-redis`) - Cache and session storage
- **Auto-scaling Service** (`connexio-ai-autoscaling`) - Intelligent scaling management

## Quick Start

### Prerequisites

1. Install flyctl: `curl -L https://fly.io/install.sh | sh`
2. Authenticate: `flyctl auth login`
3. Install Docker
4. Ensure you're in the project root directory

### Deploy Everything

```bash
# Full deployment
./deploy/deploy.sh production

# Dry run to see what would be deployed
DRY_RUN=true ./deploy/deploy.sh production

# Skip tests for faster deployment
SKIP_TESTS=true ./deploy/deploy.sh production
```

## Configuration Files

### Fly.io Configurations

- `fly.toml` - Little Horse Kernel configuration
- `workers/fly.toml` - Main workers configuration
- `workers/fly-enrichment.toml` - Enrichment workers configuration
- `workers/fly-orchestration.toml` - Orchestration workers configuration
- `postgres-fly.toml` - PostgreSQL database configuration
- `redis-fly.toml` - Redis cache configuration
- `fly-autoscaling.toml` - Auto-scaling service configuration

### Environment Management

- `env-management.sh` - Script to set up environment variables and secrets
- `.env.production` - Production environment variables (create this file)
- `.env.secrets` - Generated secrets (created automatically, keep secure)

### Deployment Scripts

- `deploy.sh` - Main deployment orchestration script
- `maintenance.sh` - System maintenance and operations script
- `scaling-cli.js` - Auto-scaling management CLI tool

### Monitoring and Health

- `health-monitoring.js` - Health monitoring service with alerting
- `autoscaling-config.js` - Auto-scaling logic and configuration
- `autoscaling-server.js` - Auto-scaling API server

## Environment Variables

### Required Variables

Create a `.env.production` file with these variables:

```bash
# Database
POSTGRES_PASSWORD=your_postgres_password
POSTGRES_REPLICATION_PASSWORD=your_replication_password

# Redis
REDIS_PASSWORD=your_redis_password

# API Keys
ANTHROPIC_API_KEY=your_anthropic_key
SLACK_BOT_TOKEN=your_slack_bot_token
SLACK_SIGNING_SECRET=your_slack_signing_secret
SLACK_APP_TOKEN=your_slack_app_token
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_MESSAGING_SERVICE_SID=your_messaging_service_sid
SURESHOT_API_KEY=your_sureshot_key
SURESHOT_ELOQUA_INSTANCE=your_eloqua_instance
SURESHOT_ELOQUA_USER=your_eloqua_user
SURESHOT_ELOQUA_PASSWORD=your_eloqua_password
MICROSOFT_APP_ID=your_microsoft_app_id
MICROSOFT_APP_PASSWORD=your_microsoft_app_password
MICROSOFT_APP_TENANT_ID=your_tenant_id

# Data Enrichment
APOLLO_API_KEY=your_apollo_key
LEADSPACE_API_KEY=your_leadspace_key
LEADSPACE_CUSTOMER_ID=your_leadspace_customer_id

# Monitoring (optional)
SLACK_WEBHOOK_URL=your_slack_webhook
PAGERDUTY_INTEGRATION_KEY=your_pagerduty_key
```

### Auto-Generated Variables

The deployment script will automatically generate these if not provided:
- `JWT_SECRET`
- `ENCRYPTION_KEY`
- `ADMIN_PASSWORD`

## Scaling Configuration

### Auto-scaling Targets

Each service has different scaling parameters:

**Little Horse Kernel:**
- Min: 2, Max: 8 machines
- Scales on: CPU (70%), Memory (80%), Active Workflows (100)

**Main Workers:**
- Min: 2, Max: 15 machines
- Scales on: CPU (65%), Memory (75%), Queue Depth (50)

**Enrichment Workers:**
- Min: 2, Max: 20 machines
- Scales on: CPU (60%), Memory (70%), Queue Depth (100), API Rate Limits (80%)

**Orchestration Workers:**
- Min: 3, Max: 12 machines
- Scales on: CPU (65%), Memory (70%), Active Campaigns (30)

### Managing Auto-scaling

```bash
# Check scaling status
./deploy/scaling-cli.js status

# View current metrics
./deploy/scaling-cli.js metrics

# Manual scaling
./deploy/scaling-cli.js scale workers up 5

# Run analysis
./deploy/scaling-cli.js analyze

# View configuration
./deploy/scaling-cli.js config
```

## Maintenance Operations

### Daily Operations

```bash
# Check system health
./deploy/maintenance.sh health

# View logs
./deploy/maintenance.sh logs
./deploy/maintenance.sh logs workers true  # Follow worker logs

# Restart services
./deploy/maintenance.sh restart workers

# Monitor performance
./deploy/maintenance.sh monitor 300  # 5 minutes
```

### Regular Maintenance

```bash
# Database maintenance
./deploy/maintenance.sh db-maintenance

# Create backups
./deploy/maintenance.sh backup

# System cleanup
./deploy/maintenance.sh cleanup

# Scale services
./deploy/maintenance.sh scale workers 5
```

## Monitoring

### Health Endpoints

- Main system: `https://connexio-ai-littlehorse.fly.dev/health`
- Workers: `https://connexio-ai-workers.fly.dev/health`
- Auto-scaling: `https://connexio-ai-autoscaling.fly.dev/health`

### Metrics

Prometheus metrics are available at:
- `/metrics` on each service
- Auto-scaling metrics: `https://connexio-ai-autoscaling.fly.dev/metrics`

### Alerting

Configure Slack and PagerDuty webhooks for alerting:
1. Set `SLACK_WEBHOOK_URL` for Slack notifications
2. Set `PAGERDUTY_INTEGRATION_KEY` for critical alerts

## CI/CD Pipeline

### GitHub Actions

The repository includes comprehensive CI/CD workflows:

**Deploy Workflow** (`.github/workflows/deploy.yml`):
- Runs tests and security scans
- Builds applications
- Deploys to staging and production
- Includes rollback capabilities

**Maintenance Workflow** (`.github/workflows/maintenance.yml`):
- Daily health checks and backups
- Database maintenance
- Performance monitoring
- Security audits

### Required Secrets

Configure these secrets in your GitHub repository:

```
FLY_API_TOKEN=your_fly_api_token
SLACK_WEBHOOK_URL=your_slack_webhook
```

Plus all the environment variables from `.env.production`.

## Troubleshooting

### Common Issues

1. **Deployment fails with authentication error**
   - Ensure `FLY_API_TOKEN` is set correctly
   - Run `flyctl auth login` to re-authenticate

2. **Services won't start**
   - Check environment variables are set: `flyctl secrets list -a app-name`
   - View logs: `flyctl logs -a app-name`
   - Check machine status: `flyctl status -a app-name`

3. **Database connection issues**
   - Verify PostgreSQL is running: `flyctl status -a connexio-ai-postgres`
   - Check internal networking between services
   - Verify database credentials

4. **Auto-scaling not working**
   - Check auto-scaling service health: `./deploy/scaling-cli.js health`
   - View scaling logs: `flyctl logs -a connexio-ai-autoscaling`
   - Verify metrics collection: `./deploy/scaling-cli.js metrics`

### Getting Help

1. Check service logs: `./deploy/maintenance.sh logs [service]`
2. Run health check: `./deploy/maintenance.sh health`
3. View system status: `./deploy/maintenance.sh status`
4. Check auto-scaling: `./deploy/scaling-cli.js status`

### Emergency Procedures

**Rollback Deployment:**
```bash
./deploy/deploy.sh production --rollback
```

**Emergency Scale Down:**
```bash
./deploy/scaling-cli.js scale workers down 1
./deploy/scaling-cli.js scale enrichment down 2
```

**Service Restart:**
```bash
./deploy/maintenance.sh restart all
```

## Architecture

### Service Dependencies

```
┌─────────────────┐    ┌──────────────────┐
│   PostgreSQL    │    │      Redis       │
└─────────────────┘    └──────────────────┘
         │                       │
         └───────────────────────┼───────────────┐
                                 │               │
         ┌─────────────────────────────────────────┐
         │         Little Horse Kernel             │
         └─────────────────────────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────┐
         │                       │                   │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Main Workers   │    │ Enrichment      │    │ Orchestration   │
│                 │    │ Workers         │    │ Workers         │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                 │
                       ┌─────────────────┐
                       │  Auto-scaling   │
                       │  Service        │
                       └─────────────────┘
```

### Data Flow

1. **Workflow Execution**: Little Horse Kernel orchestrates workflows
2. **Task Processing**: Workers process tasks from queues
3. **Data Enrichment**: Enrichment workers handle API integrations
4. **Campaign Management**: Orchestration workers manage multi-channel campaigns
5. **Auto-scaling**: Monitors all services and adjusts capacity

## Security

### Best Practices

1. **Secrets Management**: All sensitive data stored as Fly.io secrets
2. **Network Isolation**: Services communicate via internal Fly.io network
3. **Database Security**: PostgreSQL with TLS and restricted access
4. **Regular Updates**: Automated security audits via CI/CD
5. **Monitoring**: Comprehensive logging and alerting

### Compliance

- **Data Protection**: Encryption at rest and in transit
- **Access Control**: Role-based access with audit trails
- **Backup & Recovery**: Automated backups with retention policies
- **Monitoring**: Real-time security monitoring and alerting

## Support

For deployment issues:
1. Check this README
2. Review logs and metrics
3. Use maintenance scripts for common operations
4. Check GitHub Actions for CI/CD issues

Remember to keep secrets secure and never commit sensitive information to version control.