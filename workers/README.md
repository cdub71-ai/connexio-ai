# Connexio.ai Enhanced Claude API Worker

Advanced Little Horse workflow orchestration for marketing automation with enterprise-grade patterns and comprehensive monitoring.

## Overview

The Enhanced Claude API Worker implements sophisticated Little Horse patterns for high-scale marketing campaign orchestration:

- **Advanced Workflow Patterns** - Saga compensation, cross-workflow coordination, intelligent caching
- **Enterprise Error Recovery** - Circuit breakers, exponential backoff, automatic recovery
- **Comprehensive Monitoring** - Real-time metrics, health checks, performance tracking
- **Production-Ready Architecture** - Graceful shutdown, resource management, scalable design

## Quick Start

### Prerequisites

- Node.js 18.0.0 or higher
- Little Horse server running
- Anthropic API key
- Environment variables configured

### Installation

```bash
cd workers
npm install
```

### Configuration

Set up your environment variables:

```bash
# Little Horse Configuration
LITTLEHORSE_API_HOST=localhost
LITTLEHORSE_API_PORT=2023

# Anthropic Claude API
ANTHROPIC_API_KEY=your-anthropic-api-key
ANTHROPIC_MODEL=claude-3-haiku-20240307
ANTHROPIC_MAX_TOKENS=1024
ANTHROPIC_TEMPERATURE=0.3

# Worker Configuration
WORKER_NAME=connexio-claude-worker
MAX_CONCURRENT_TASKS=10
TASK_TIMEOUT_MS=30000

# Rate Limiting
RATE_LIMIT_MAX_CONCURRENT=5
RATE_LIMIT_INTERVAL_CAP=100
RATE_LIMIT_INTERVAL=60000
```

### Running the Enhanced Worker

```bash
# Start enhanced worker with monitoring
npm run start:enhanced

# Development mode with hot reload
npm run dev:enhanced

# Run tests
npm run test:enhanced

# Watch mode for tests
npm run test:watch:enhanced
```

## Architecture

### Enhanced Claude Worker

The `EnhancedClaudeWorker` implements advanced Little Horse patterns:

```javascript
@LHTaskWorker('parse-marketing-command-enhanced')
async parseMarketingCommandEnhanced(input, lhContext) {
  // Workflow-aware parsing with caching and error recovery
}

@LHTaskWorker('generate-campaign-content-saga')
async generateCampaignContentSaga(campaignRequest, sagaContext) {
  // Saga pattern with compensation handlers
}

@LHTaskWorker('coordinate-cross-workflow')
async coordinateCrossWorkflow(coordinationRequest, lhContext) {
  // Cross-workflow communication and state sync
}
```

### Worker Orchestrator

The `WorkerOrchestrator` manages worker lifecycle:

- **Health Monitoring** - Continuous health checks with automatic recovery
- **Resource Management** - Connection pooling and resource allocation
- **Error Recovery** - Circuit breakers and graceful degradation
- **Metrics Collection** - Comprehensive performance tracking

### Key Features

#### 1. Saga Pattern Implementation

```javascript
// Content generation with compensation
const result = await worker.generateCampaignContentSaga({
  campaignId: 'CAMP-001',
  type: 'email',
  audience: 'premium_customers'
}, {
  sagaId: 'saga-123',
  wfRunId: 'workflow-456'
});

// Automatic compensation on failure
if (error) {
  await worker.compensateContentGeneration(
    result.sagaMetadata.compensationData,
    { sagaId: 'saga-123' }
  );
}
```

#### 2. Intelligent Caching

```javascript
// Automatic response caching based on command similarity
const cacheKey = generateCacheKey(command, context);
const cached = getCachedResponse(cacheKey);

if (cached) {
  return enhanceWithWorkflowContext(cached, workflowContext);
}
```

#### 3. Cross-Workflow Coordination

```javascript
// Coordinate state between workflows
await worker.coordinateCrossWorkflow({
  type: 'state_sync',
  targetWorkflowId: 'target-workflow-123',
  stateData: { status: 'completed', results: {...} }
}, { wfRunId: 'primary-workflow-456' });
```

#### 4. Advanced Error Recovery

```javascript
// Circuit breaker with exponential backoff
const result = await pRetry(
  () => claudeService.parseMarketingCommand(command, context),
  {
    retries: 3,
    factor: 2,
    minTimeout: 1000,
    shouldRetry: (error) => isRetryableError(error)
  }
);
```

## Task Methods

### parse-marketing-command-enhanced

Enhanced marketing command parsing with workflow awareness.

**Input:**
```javascript
{
  command: "Create email campaign for premium customers",
  // or object format
  {
    text: "Create urgent SMS campaign",
    priority: "high"
  }
}
```

**Little Horse Context:**
```javascript
{
  wfRunId: "workflow-123",
  nodeRunId: "node-456", 
  threadRunId: "thread-789"
}
```

**Output:**
```javascript
{
  intent: "create_email_campaign",
  confidence: 0.95,
  parameters: {
    type: "email",
    audience: "premium_customers",
    priority: "medium",
    channels: ["email"]
  },
  workflowEnhancements: {
    workflowId: "workflow-123",
    recommendedNextActions: [...],
    workflowContinuation: {...},
    contextualInsights: [...]
  }
}
```

### generate-campaign-content-saga

Saga-aware campaign content generation with compensation.

**Input:**
```javascript
{
  campaignId: "CAMP-001",
  type: "email",
  audience: "premium_customers",
  channels: ["email"],
  subject: "Special Offer"
}
```

**Saga Context:**
```javascript
{
  wfRunId: "saga-workflow-123",
  sagaId: "saga-456"
}
```

**Output:**
```javascript
{
  generatedContent: {
    subject: "Exclusive 20% Off for Premium Members",
    body: "Dear premium customer..."
  },
  sagaMetadata: {
    sagaId: "saga-456",
    stepName: "content-generation",
    canCompensate: true,
    compensationData: {
      contentIds: ["content-1", "content-2"],
      resourcesUsed: ["template-1", "validator-1"]
    }
  }
}
```

### compensate-content-generation

Compensation handler for rolling back content generation.

**Input:**
```javascript
{
  sagaId: "saga-456",
  contentIds: ["content-1", "content-2"],
  resourcesAllocated: ["template-1"],
  cacheKeys: ["cache-1", "cache-2"]
}
```

**Output:**
```javascript
{
  compensated: true,
  sagaId: "saga-456",
  results: [
    { type: "content", success: true, items: 2 },
    { type: "resources", success: true, items: 1 },
    { type: "cache", success: true, items: 2 }
  ]
}
```

### coordinate-cross-workflow

Cross-workflow coordination and state synchronization.

**Input:**
```javascript
{
  type: "state_sync", // or "event_propagation", "resource_handoff"
  targetWorkflowId: "target-workflow-123",
  stateData: {
    campaignId: "CAMP-001",
    status: "completed",
    metrics: { sent: 1000, opened: 250 }
  }
}
```

**Output:**
```javascript
{
  coordinationSuccessful: true,
  coordinationType: "state_sync",
  primaryWorkflowId: "primary-workflow-456",
  targetWorkflowId: "target-workflow-123",
  result: { success: true, syncedProperties: [...] }
}
```

## Monitoring and Health

### Health Check Endpoint

The enhanced worker provides comprehensive health information:

```javascript
const health = worker.getHealthStatus();
```

**Response:**
```javascript
{
  status: "healthy",
  worker: {
    name: "connexio-claude-worker-enhanced",
    version: "2.0.0",
    capabilities: [
      "advanced-workflow-patterns",
      "saga-compensation", 
      "cross-workflow-coordination",
      "intelligent-caching"
    ],
    successRate: 95.5,
    metrics: {
      totalTasks: 1000,
      successfulTasks: 955,
      averageProcessingTime: 1250,
      cacheHits: 200,
      cacheMisses: 800
    }
  },
  claudeApi: {
    totalRequests: 800,
    successRate: 97.5,
    averageResponseTime: 1100
  },
  cache: {
    utilization: 0.65,
    hitRate: 20.0,
    size: 650
  },
  workflow: {
    activeWorkflows: 15,
    pendingCompensations: 2,
    crossWorkflowCalls: 25
  }
}
```

### Performance Metrics

Key metrics tracked by the enhanced worker:

- **Task Execution**: Success rates, processing times, error types
- **Cache Performance**: Hit rates, utilization, eviction rates  
- **Workflow Operations**: Active workflows, saga compensations, cross-workflow calls
- **Claude API Usage**: Request rates, token consumption, error rates
- **System Resources**: Memory usage, CPU utilization, uptime

## Testing

### Unit Tests

```bash
# Run all enhanced worker tests
npm run test:enhanced

# Watch mode for development
npm run test:watch:enhanced

# Run with coverage
npm run test:enhanced -- --coverage
```

### Test Categories

1. **Enhanced Marketing Command Parsing**
   - Basic and complex command parsing
   - Workflow context integration
   - Caching behavior
   - Input validation

2. **Saga Pattern Integration**
   - Content generation with compensation
   - Rollback and recovery scenarios
   - Saga state management

3. **Cross-Workflow Coordination**
   - State synchronization
   - Event propagation  
   - Resource handoffs

4. **Error Handling and Recovery**
   - Retry logic with backoff
   - Circuit breaker patterns
   - Graceful degradation

5. **Performance and Caching**
   - Cache hit/miss scenarios
   - LRU eviction
   - TTL expiration

### Example Test

```javascript
test('should execute saga with compensation on failure', async () => {
  // Arrange
  const campaignRequest = {
    campaignId: 'CAMP-001',
    type: 'email',
    audience: 'premium_customers'
  };

  const sagaContext = {
    wfRunId: 'saga-workflow-123',
    sagaId: 'saga-456'
  };

  // Mock failure in content generation
  worker._generateContentWithSagaPattern = jest.fn()
    .mockRejectedValue(new Error('Content service unavailable'));

  // Act
  const result = await worker.generateCampaignContentSaga(
    campaignRequest, 
    sagaContext
  );

  // Assert
  expect(result.intent).toBe('saga_step_failed');
  expect(result.sagaMetadata.sagaId).toBe('saga-456');
  expect(result.sagaMetadata.requiresCompensation).toBe(false);
});
```

## Production Deployment

### Environment Configuration

```bash
# Production environment
NODE_ENV=production
LOG_LEVEL=info

# Little Horse production settings  
LITTLEHORSE_API_HOST=lh-prod.company.com
LITTLEHORSE_API_PORT=2023
LITTLEHORSE_CLIENT_ID=prod-client
LITTLEHORSE_CLIENT_SECRET=secret

# Worker scaling
MAX_CONCURRENT_TASKS=20
TASK_TIMEOUT_MS=60000

# Rate limiting for production
RATE_LIMIT_MAX_CONCURRENT=10
RATE_LIMIT_INTERVAL_CAP=500
RATE_LIMIT_INTERVAL=60000

# Error recovery configuration
ERROR_RECOVERY_CIRCUIT_BREAKER_FAILURE_THRESHOLD=10
ERROR_RECOVERY_CIRCUIT_BREAKER_TIMEOUT=300000
ERROR_RECOVERY_RETRY_MAX_RETRIES=5
```

### Process Management

```bash
# Using PM2 for production
pm2 start src/enhanced-index.js --name connexio-claude-worker

# With environment file
pm2 start ecosystem.config.js

# Monitoring
pm2 monit
pm2 logs connexio-claude-worker
```

### Scaling Considerations

1. **Horizontal Scaling**
   - Deploy multiple worker instances
   - Load balancing handled by Little Horse
   - Shared state through Little Horse

2. **Resource Management**
   - Configure appropriate memory limits
   - Monitor CPU usage under load
   - Adjust concurrent task limits

3. **Monitoring Integration**
   - Connect to existing monitoring stack
   - Set up alerting for critical metrics
   - Dashboard for real-time visibility

## Troubleshooting

### Common Issues

1. **Little Horse Connection Errors**
   ```bash
   # Check Little Horse server status
   curl http://localhost:2023/health
   
   # Verify network connectivity
   nc -zv localhost 2023
   ```

2. **Claude API Rate Limits**
   ```javascript
   // Adjust rate limiting configuration
   RATE_LIMIT_MAX_CONCURRENT=3
   RATE_LIMIT_INTERVAL_CAP=50
   ```

3. **Memory Issues**
   ```bash
   # Monitor memory usage
   node --max-old-space-size=4096 src/enhanced-index.js
   
   # Enable garbage collection logging
   node --expose-gc --trace-gc src/enhanced-index.js
   ```

4. **High Error Rates**
   ```bash
   # Check worker health
   curl http://localhost:3000/health
   
   # Review error logs
   grep ERROR logs/connexio-workers.log
   ```

### Debug Mode

```bash
# Enable debug logging
LOG_LEVEL=debug npm run start:enhanced

# Trace specific components
DEBUG=claude-worker,orchestrator npm run start:enhanced
```

### Performance Tuning

1. **Cache Optimization**
   ```javascript
   // Adjust cache settings
   cacheConfig: {
     maxSize: 2000,
     ttlMs: 600000 // 10 minutes
   }
   ```

2. **Concurrency Tuning**
   ```javascript
   // Balance load vs. resource usage
   maxConcurrentTasks: 15,
   claudeApiConcurrency: 5
   ```

3. **Timeout Configuration**
   ```javascript
   // Adjust for your use case
   taskTimeoutMs: 45000,
   claudeApiTimeout: 30000
   ```

## Contributing

### Development Workflow

1. **Setup Development Environment**
   ```bash
   npm install
   cp .env.example .env
   # Edit .env with your configuration
   ```

2. **Run Tests**
   ```bash
   npm run test:enhanced
   npm run lint
   ```

3. **Development Server**
   ```bash
   npm run dev:enhanced
   ```

4. **Code Style**
   ```bash
   npm run format
   npm run lint -- --fix
   ```

### Adding New Task Methods

1. **Create Task Method**
   ```javascript
   @LHTaskWorker('new-task-name')
   async newTaskMethod(input, lhContext) {
     // Implementation
   }
   ```

2. **Register with Orchestrator**
   ```javascript
   // In worker-orchestrator.js
   {
     taskName: 'new-task-name',
     method: worker.newTaskMethod.bind(worker),
     description: 'Description of new task'
   }
   ```

3. **Add Tests**
   ```javascript
   describe('New Task Method', () => {
     test('should handle basic input', async () => {
       // Test implementation
     });
   });
   ```

## License

This project is part of the Connexio.ai platform and follows the same licensing terms.