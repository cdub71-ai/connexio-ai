# Connexio AI Monitoring System

Comprehensive production-ready monitoring and observability system for the Connexio AI platform.

## Overview

The monitoring system provides complete visibility into:

- **Application Metrics** - Performance, resource usage, and custom business metrics
- **Workflow Monitoring** - Little Horse workflow execution tracking and health
- **Worker Health** - Task worker status, queue depths, and performance metrics
- **API Integration Monitoring** - External API usage, rate limits, and circuit breakers
- **Cost Tracking** - Real-time cost monitoring with budget alerts
- **Alert Management** - Intelligent alerting with escalation policies
- **System Dashboard** - Real-time web dashboard with visualizations

## Architecture

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│   Metrics           │    │   Workflow          │    │   Worker Health     │
│   Collector         │    │   Monitor           │    │   Monitor           │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
           │                          │                          │
           └──────────────────────────┼──────────────────────────┘
                                      │
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│   API Integration   │    │     Alert           │    │   Cost              │
│   Monitor           │────│     Manager         │    │   Tracker           │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
                                      │
                          ┌─────────────────────┐
                          │   Dashboard         │
                          │   Server            │
                          └─────────────────────┘
```

## Quick Start

### 1. Initialize Monitoring System

```javascript
import { monitoringSystem } from './monitoring/monitoring-setup.js';

// Initialize all monitoring components
await monitoringSystem.initialize();

// The system is now collecting metrics and monitoring all components
```

### 2. Integrate with Express Applications

```javascript
import express from 'express';
import { monitoringSystem } from './monitoring/monitoring-setup.js';

const app = express();
const middleware = monitoringSystem.createExpressMiddleware();

// Add monitoring middleware
app.use(middleware.metrics);
app.use(middleware.correlation);

// Your routes here
app.get('/api/example', (req, res) => {
  res.json({ message: 'Hello World' });
});
```

### 3. Track Workflows

```javascript
import { monitoringSystem } from './monitoring/monitoring-setup.js';

const workflow = monitoringSystem.createWorkflowHelpers();

// Start workflow tracking
const workflowId = 'campaign-123';
workflow.start(workflowId, 'email-campaign', '1.0', {
  campaignType: 'promotional',
  targetAudience: 'premium-users'
});

// Track task execution
workflow.taskStart(workflowId, 'task-1', 'send-emails');
// ... task execution ...
workflow.taskComplete(workflowId, 'task-1', 'completed', { emailsSent: 1000 });

// Complete workflow
workflow.complete(workflowId, 'completed');
```

### 4. Track Worker Tasks

```javascript
import { workerHealthMonitor } from './monitoring/worker-health-monitor.js';

// Register a queue
workerHealthMonitor.registerQueue('email-processing', {
  type: 'fifo',
  maxDepth: 1000
});

// Track task execution
const taskId = 'task-456';
workerHealthMonitor.trackTaskStart(taskId, 'process-email', 'email-processing');

try {
  // Process task
  const result = await processEmail(emailData);
  workerHealthMonitor.trackTaskComplete(taskId, 'completed', result);
} catch (error) {
  workerHealthMonitor.trackTaskComplete(taskId, 'failed', null, error);
}
```

### 5. Monitor API Calls

```javascript
import { apiIntegrationMonitor } from './monitoring/api-integration-monitor.js';

// Check if API call is allowed
const canCall = apiIntegrationMonitor.canMakeRequest('anthropic', '/v1/messages');
if (!canCall.allowed) {
  console.log('API call blocked:', canCall.reason);
  return;
}

// Make API call
const startTime = Date.now();
try {
  const response = await fetch('https://api.anthropic.com/v1/messages', options);
  
  // Record successful API call
  await apiIntegrationMonitor.recordRequest(
    'anthropic',
    '/v1/messages',
    'POST',
    startTime,
    Date.now(),
    response.status,
    response.headers.get('content-length'),
    1000, // tokens used
    0.02  // cost
  );
} catch (error) {
  // Record failed API call
  await apiIntegrationMonitor.recordRequest(
    'anthropic',
    '/v1/messages',
    'POST',
    startTime,
    Date.now(),
    500,
    0,
    0,
    0,
    error
  );
}
```

### 6. Track Costs

```javascript
import { costTracker } from './monitoring/cost-tracker.js';

// Record API usage and cost
costTracker.recordUsage('anthropic', {
  model: 'claude-3-5-sonnet-20241022',
  input_tokens: 1000,
  output_tokens: 500,
  operation: 'chat_completion'
});

// Get cost summary
const summary = costTracker.getCostSummary('anthropic');
console.log('Anthropic costs:', summary);
```

## Components

### Metrics Collector

Collects system and application metrics in Prometheus format.

**Key Features:**
- HTTP request metrics (duration, count, status codes)
- System resource metrics (CPU, memory, disk)
- Custom business metrics
- Prometheus-compatible metrics endpoint

**Metrics Available:**
- `connexio_ai_http_request_duration_seconds`
- `connexio_ai_http_requests_total`
- `connexio_ai_workflows_total`
- `connexio_ai_tasks_total`
- `connexio_ai_api_requests_total`
- `connexio_ai_api_costs_total`

### Workflow Monitor

Tracks Little Horse workflow execution and performance.

**Key Features:**
- Workflow lifecycle tracking
- Task execution monitoring
- Performance metrics and statistics
- Stuck workflow detection
- Error rate monitoring

**Events:**
- `workflow:started`
- `workflow:completed`
- `workflow:error`
- `workflow:stuck`

### Worker Health Monitor

Monitors task worker health and performance.

**Key Features:**
- Worker health status tracking
- Queue depth monitoring
- Task execution metrics
- Resource usage tracking
- Consecutive failure detection

**Health Checks:**
- CPU and memory usage
- Error rates
- Queue depths
- Response times
- Consecutive failures

### API Integration Monitor

Monitors external API integrations with rate limiting and circuit breakers.

**Key Features:**
- Rate limiting enforcement
- Circuit breaker pattern
- Quota tracking
- Request/response monitoring
- Provider health assessment

**Supported Providers:**
- Anthropic Claude
- Slack API
- Twilio
- Apollo.io
- Leadspace
- Sureshot
- Microsoft Graph

### Cost Tracker

Tracks and manages API costs with budget monitoring.

**Key Features:**
- Real-time cost calculation
- Budget tracking with alerts
- Cost projection and trends
- Provider cost breakdown
- Usage optimization insights

**Budget Alerts:**
- Warning (75% of budget)
- Critical (90% of budget)
- Emergency (95% of budget)

### Alert Manager

Comprehensive alerting system with intelligent routing.

**Key Features:**
- Rule-based alerting
- Escalation policies
- Multiple notification channels
- Alert suppression
- Maintenance windows

**Notification Channels:**
- Slack webhooks
- PagerDuty integration
- Email notifications
- Generic webhooks

**Alert Categories:**
- System health
- Workflow issues
- Worker problems
- API failures
- Cost overruns
- Security events

### Dashboard Server

Real-time web dashboard with system overview and metrics.

**Key Features:**
- Real-time data updates via WebSocket
- System health overview
- Interactive charts and graphs
- Alert management interface
- Historical data visualization

**Access:**
- Web UI: `http://localhost:3004`
- API endpoints: `http://localhost:3004/api/*`
- Metrics: `http://localhost:3004/metrics`

## Configuration

### Environment Variables

```bash
# Dashboard
DASHBOARD_PORT=3004
DASHBOARD_CORS_ORIGIN=*

# Logging
LOG_LEVEL=info
NODE_ENV=production

# Alert Channels
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
PAGERDUTY_INTEGRATION_KEY=your-integration-key
ALERT_WEBHOOK_URL=https://your-webhook-endpoint.com
ALERT_EMAIL_RECIPIENTS=admin@company.com,ops@company.com

# API Keys (for cost tracking and monitoring)
ANTHROPIC_API_KEY=your-key
SLACK_BOT_TOKEN=your-token
TWILIO_AUTH_TOKEN=your-token
APOLLO_API_KEY=your-key
LEADSPACE_API_KEY=your-key
SURESHOT_API_KEY=your-key
MICROSOFT_APP_PASSWORD=your-password
```

### Alert Rules Configuration

Alert rules are defined in `alert-manager.js` and can be customized:

```javascript
{
  'system.cpu.high': {
    name: 'High CPU Usage',
    category: 'system',
    severity: 'warning',
    threshold: 85,
    duration: 300000, // 5 minutes
    condition: (metrics) => metrics.cpu > 85
  }
}
```

### Budget Configuration

Cost budgets are configured in `cost-tracker.js`:

```javascript
{
  anthropic: {
    daily: 50.00,
    monthly: 1000.00,
    yearly: 10000.00,
    alerts: {
      warning: 0.75,
      critical: 0.90,
      emergency: 0.95
    }
  }
}
```

## API Reference

### Metrics Endpoints

- `GET /metrics` - Prometheus metrics
- `GET /api/overview` - System overview
- `GET /api/workflows` - Workflow statistics
- `GET /api/workers` - Worker health data
- `GET /api/integrations` - API integration status
- `GET /api/costs` - Cost tracking data
- `GET /api/alerts` - Alert information

### Management Endpoints

- `POST /api/actions/resolve-alert/:alertId` - Resolve alert
- `POST /api/actions/create-suppression` - Create alert suppression
- `POST /api/actions/maintenance-window` - Create maintenance window

## Integration Examples

### Express Application

```javascript
import express from 'express';
import { monitoringSystem } from './monitoring/monitoring-setup.js';

const app = express();

// Initialize monitoring
await monitoringSystem.initialize();

// Add middleware
const middleware = monitoringSystem.createExpressMiddleware();
app.use(middleware.metrics);
app.use(middleware.correlation);

// Error handling with monitoring
app.use((error, req, res, next) => {
  // Error is automatically logged and tracked
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(3000);
```

### Little Horse Workflow

```javascript
import { LHTaskWorker } from 'littlehorse-client';
import { monitoringSystem } from './monitoring/monitoring-setup.js';

const workflow = monitoringSystem.createWorkflowHelpers();

const worker = new LHTaskWorker('email-task', 'localhost:2023', {
  taskFunction: async (input) => {
    const workflowId = input.workflowId;
    const taskId = input.taskId;
    
    // Track task start
    workflow.taskStart(workflowId, taskId, 'send-email', input);
    
    try {
      const result = await sendEmail(input.emailData);
      
      // Track successful completion
      workflow.taskComplete(workflowId, taskId, 'completed', result);
      
      return result;
    } catch (error) {
      // Track failure
      workflow.taskComplete(workflowId, taskId, 'failed', null);
      throw error;
    }
  }
});

worker.start();
```

### Cost-Aware API Client

```javascript
import { apiIntegrationMonitor, costTracker } from './monitoring/index.js';

class AnthropicClient {
  async sendMessage(messages, model = 'claude-3-5-sonnet-20241022') {
    // Check if we can make the request
    const canCall = apiIntegrationMonitor.canMakeRequest('anthropic', '/v1/messages');
    if (!canCall.allowed) {
      throw new Error(`API call blocked: ${canCall.reason}`);
    }
    
    const startTime = Date.now();
    
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.ANTHROPIC_API_KEY
        },
        body: JSON.stringify({ messages, model })
      });
      
      const data = await response.json();
      
      // Record API usage and cost
      const cost = costTracker.recordUsage('anthropic', {
        model,
        input_tokens: data.usage.input_tokens,
        output_tokens: data.usage.output_tokens,
        operation: 'chat_completion'
      });
      
      // Record API call metrics
      await apiIntegrationMonitor.recordRequest(
        'anthropic',
        '/v1/messages',
        'POST',
        startTime,
        Date.now(),
        response.status,
        JSON.stringify(data).length,
        data.usage.input_tokens + data.usage.output_tokens,
        cost
      );
      
      return data;
      
    } catch (error) {
      // Record failed API call
      await apiIntegrationMonitor.recordRequest(
        'anthropic',
        '/v1/messages',
        'POST',
        startTime,
        Date.now(),
        500,
        0,
        0,
        0,
        error
      );
      
      throw error;
    }
  }
}
```

## Troubleshooting

### Common Issues

1. **High Memory Usage**
   - Check metrics retention settings
   - Verify cleanup intervals are running
   - Monitor for memory leaks in custom metrics

2. **Missing Metrics**
   - Ensure monitoring system is initialized
   - Check middleware is properly configured
   - Verify component health status

3. **Alerts Not Firing**
   - Check alert rule conditions
   - Verify alert channels are configured
   - Review alert suppression settings

4. **Dashboard Not Loading**
   - Check dashboard server is running
   - Verify WebSocket connections
   - Check browser console for errors

### Debug Mode

Enable debug logging:

```bash
LOG_LEVEL=debug NODE_ENV=development npm start
```

### Health Checks

Check system health:

```bash
curl http://localhost:3004/health
curl http://localhost:3004/api/overview
```

## Performance

### Resource Usage

- **CPU**: ~2-5% baseline, scales with activity
- **Memory**: ~100-200MB baseline, grows with metrics history
- **Network**: Minimal, only dashboard WebSocket and API calls
- **Storage**: Log files and metrics history (configurable retention)

### Scaling Considerations

- Metrics are stored in memory with configurable retention
- Alert history is automatically cleaned up
- Dashboard supports multiple concurrent connections
- Components can be run on separate processes if needed

## Security

### Data Protection

- No sensitive data is logged or stored in metrics
- API keys and secrets are never exposed in metrics
- WebSocket connections can be restricted by CORS
- Dashboard can be secured with authentication (custom implementation)

### Network Security

- Internal monitoring traffic uses private networks
- External notifications use HTTPS/TLS
- Rate limiting prevents abuse
- Circuit breakers protect against cascading failures

## Contributing

To add new monitoring capabilities:

1. Create new monitoring component in `monitoring/`
2. Register component in `monitoring-setup.js`
3. Add event handlers for cross-component integration
4. Add dashboard visualization if needed
5. Update documentation

### Adding New Alert Rules

```javascript
// In alert-manager.js
this.alertRules.set('custom.rule', {
  name: 'Custom Alert',
  description: 'Custom alert description',
  category: 'custom',
  severity: 'warning',
  threshold: 100,
  condition: (data) => data.value > 100,
  tags: ['custom', 'business']
});
```

### Adding New Cost Providers

```javascript
// In cost-tracker.js
this.costRules.set('new-provider', {
  provider: 'New Provider',
  currency: 'USD',
  billing: 'request-based',
  rates: {
    api_call: 0.001
  },
  calculateCost: (usage) => {
    return usage.requests * 0.001;
  }
});
```

## License

This monitoring system is part of the Connexio AI platform and follows the same licensing terms.