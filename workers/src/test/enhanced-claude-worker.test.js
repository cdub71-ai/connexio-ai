/**
 * Comprehensive Test Suite for Enhanced Claude API Worker
 * Tests advanced Little Horse patterns, saga compensation, and error handling
 */

import EnhancedClaudeWorker from "../workers/enhanced-claude-worker.js";

// Mock dependencies
jest.mock("../services/claude-api.js");
jest.mock("../config/index.js", () => ({
  anthropic: {
    apiKey: "test-key",
    baseUrl: "https://api.anthropic.com",
    model: "claude-3-haiku-20240307",
    maxTokens: 1024,
    temperature: 0.3,
    timeout: 30000,
  },
  rateLimit: {
    maxConcurrent: 5,
    intervalCap: 100,
    interval: 60000,
    maxRetries: 3,
    retryDelay: 1000,
  },
  app: {
    nodeEnv: "test",
    logLevel: "error",
    workerName: "test-claude-worker",
  },
  worker: {
    taskName: "parse-marketing-command",
    maxConcurrentTasks: 10,
    heartbeatIntervalMs: 5000,
    taskTimeoutMs: 30000,
  },
}));

jest.mock("../utils/logger.js", () => ({
  createContextLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    taskStart: jest.fn(),
    taskComplete: jest.fn(),
    taskError: jest.fn(),
  }),
  createTimer: () => ({
    end: jest.fn(() => 1000),
  }),
}));

// Mock monitoring system
jest.mock(
  "../../../monitoring/monitoring-setup.js",
  () => ({
    monitoringSystem: {
      createWorkflowHelpers: () => ({
        start: jest.fn(),
        complete: jest.fn(),
        error: jest.fn(),
        taskStart: jest.fn(),
        taskComplete: jest.fn(),
      }),
    },
  }),
  { virtual: true },
);

describe("EnhancedClaudeWorker", () => {
  let worker;
  let mockClaudeService;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create worker instance
    worker = new EnhancedClaudeWorker();

    // Get mock Claude service
    mockClaudeService = worker.claudeService;

    // Setup default Claude service mock
    mockClaudeService.parseMarketingCommand = jest.fn();
    mockClaudeService.getHealthMetrics = jest.fn(() => ({
      totalRequests: 10,
      successfulRequests: 9,
      failedRequests: 1,
      successRate: 90,
    }));
    mockClaudeService.shutdown = jest.fn();
  });

  afterEach(async () => {
    // Clean shutdown after each test
    await worker.shutdown();
  });

  describe("Enhanced Marketing Command Parsing", () => {
    test("should parse simple marketing command with workflow context", async () => {
      // Arrange
      const input = "Create an email campaign for new customers";
      const lhContext = {
        wfRunId: "workflow-123",
        nodeRunId: "node-456",
        threadRunId: "thread-789",
      };

      const expectedResponse = {
        intent: "create_email_campaign",
        confidence: 0.9,
        parameters: {
          type: "email",
          audience: "new_customers",
          channels: ["email"],
        },
        extractedEntities: {},
        summary: "Create email campaign for new customers",
      };

      mockClaudeService.parseMarketingCommand.mockResolvedValue(
        expectedResponse,
      );

      // Act
      const result = await worker.parseMarketingCommandEnhanced(
        input,
        lhContext,
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.intent).toBe("create_email_campaign");
      expect(result.workflowEnhancements).toBeDefined();
      expect(result.workflowEnhancements.workflowId).toBe("workflow-123");
      expect(result.workflowEnhancements.nodeRunId).toBe("node-456");
      expect(result.workflowEnhancements.recommendedNextActions).toBeDefined();

      expect(mockClaudeService.parseMarketingCommand).toHaveBeenCalledWith(
        input,
        expect.objectContaining({
          workflowId: "workflow-123",
          nodeRunId: "node-456",
          threadRunId: "thread-789",
        }),
      );
    });

    test("should handle complex multi-channel campaign requests", async () => {
      // Arrange
      const input = {
        command:
          "Create urgent multi-channel campaign for premium customers with email and SMS, include 20% discount, send tomorrow at 2pm",
        priority: "high",
      };

      const lhContext = { wfRunId: "workflow-complex-123" };

      const expectedResponse = {
        intent: "create_multichannel_campaign",
        confidence: 0.95,
        parameters: {
          type: "multichannel",
          audience: "premium_customers",
          channels: ["email", "sms"],
          priority: "high",
          timing: {
            type: "scheduled",
            scheduleTime: "2024-01-02T14:00:00Z",
          },
          offers: {
            discount: "20%",
          },
        },
      };

      mockClaudeService.parseMarketingCommand.mockResolvedValue(
        expectedResponse,
      );

      // Act
      const result = await worker.parseMarketingCommandEnhanced(
        input,
        lhContext,
      );

      // Assert
      expect(result.intent).toBe("create_multichannel_campaign");
      expect(result.parameters.channels).toEqual(["email", "sms"]);
      expect(result.parameters.priority).toBe("high");
      expect(
        result.workflowEnhancements.workflowContinuation.requiresHumanApproval,
      ).toBe(true);
    });

    test("should utilize response caching for identical requests", async () => {
      // Arrange
      const input = "Create email campaign for customers";
      const lhContext = { wfRunId: "workflow-cache-test" };

      const cachedResponse = {
        intent: "create_email_campaign",
        confidence: 0.8,
        parameters: { type: "email" },
      };

      mockClaudeService.parseMarketingCommand.mockResolvedValue(cachedResponse);

      // Act - First call
      const result1 = await worker.parseMarketingCommandEnhanced(
        input,
        lhContext,
      );

      // Act - Second identical call (should use cache)
      const result2 = await worker.parseMarketingCommandEnhanced(
        input,
        lhContext,
      );

      // Assert
      expect(result1.intent).toBe("create_email_campaign");
      expect(result2.intent).toBe("create_email_campaign");
      expect(mockClaudeService.parseMarketingCommand).toHaveBeenCalledTimes(1); // Only called once due to caching
      expect(worker.metrics.cacheHits).toBe(1);
      expect(worker.metrics.cacheMisses).toBe(1);
    });

    test("should handle validation errors gracefully", async () => {
      // Arrange
      const invalidInput = null;
      const lhContext = { wfRunId: "workflow-validation-test" };

      // Act
      const result = await worker.parseMarketingCommandEnhanced(
        invalidInput,
        lhContext,
      );

      // Assert
      expect(result.intent).toBe("workflow_error");
      expect(result.parameters.errorType).toBe("ENHANCED_VALIDATION_ERROR");
      expect(result.workflowMetadata.workflowRecoverable).toBe(true);
      expect(mockClaudeService.parseMarketingCommand).not.toHaveBeenCalled();
    });
  });

  describe("Saga Pattern Integration", () => {
    test("should generate campaign content with saga compensation data", async () => {
      // Arrange
      const campaignRequest = {
        campaignId: "CAMP-001",
        type: "email",
        channels: ["email"],
        audience: "premium_customers",
        subject: "Special Offer",
      };

      const sagaContext = {
        wfRunId: "saga-workflow-123",
        sagaId: "saga-456",
      };

      const mockContentResult = {
        generatedContent: {
          subject: "Special Offer - 20% Off",
          body: "Dear customer, enjoy 20% off...",
        },
        generatedContentIds: ["content-1", "content-2"],
        resourcesUsed: ["resource-a", "resource-b"],
        tokenUsage: 500,
        cacheKeys: ["cache-key-1"],
      };

      // Mock content generation (would typically call Claude API)
      worker._generateContentWithSagaPattern = jest
        .fn()
        .mockResolvedValue(mockContentResult);

      // Act
      const result = await worker.generateCampaignContentSaga(
        campaignRequest,
        sagaContext,
      );

      // Assert
      expect(result.sagaMetadata).toBeDefined();
      expect(result.sagaMetadata.sagaId).toBe("saga-456");
      expect(result.sagaMetadata.stepName).toBe("content-generation");
      expect(result.sagaMetadata.canCompensate).toBe(true);
      expect(result.sagaMetadata.compensationData).toBeDefined();
      expect(result.sagaMetadata.compensationData.contentIds).toEqual([
        "content-1",
        "content-2",
      ]);

      // Verify compensation data is stored
      expect(worker.sagaCompensations.has("saga-456")).toBe(true);
    });

    test("should handle saga step failure with compensation metadata", async () => {
      // Arrange
      const campaignRequest = {
        campaignId: "CAMP-002",
        type: "email",
      };

      const sagaContext = {
        wfRunId: "saga-workflow-fail",
        sagaId: "saga-fail-123",
      };

      // Mock content generation failure
      worker._generateContentWithSagaPattern = jest
        .fn()
        .mockRejectedValue(new Error("Content generation failed"));

      // Act
      const result = await worker.generateCampaignContentSaga(
        campaignRequest,
        sagaContext,
      );

      // Assert
      expect(result.intent).toBe("saga_step_failed");
      expect(result.sagaMetadata.sagaId).toBe("saga-fail-123");
      expect(result.sagaMetadata.stepName).toBe("content-generation");
      expect(result.sagaMetadata.failureReason).toBe(
        "Content generation failed",
      );
      expect(result.error.retryable).toBeDefined();
    });

    test("should execute compensation successfully", async () => {
      // Arrange
      const compensationData = {
        sagaId: "saga-compensation-test",
        contentIds: ["content-1", "content-2"],
        resourcesAllocated: ["resource-a"],
        cacheKeys: ["cache-1", "cache-2"],
      };

      const sagaContext = {
        sagaId: "saga-compensation-test",
      };

      // Setup saga compensation data
      worker.sagaCompensations.set("saga-compensation-test", {
        stepName: "content-generation",
        compensationData,
        timestamp: Date.now(),
      });

      // Act
      const result = await worker.compensateContentGeneration(
        compensationData,
        sagaContext,
      );

      // Assert
      expect(result.compensated).toBe(true);
      expect(result.sagaId).toBe("saga-compensation-test");
      expect(result.results).toHaveLength(3); // content, resources, cache compensations
      expect(worker.metrics.sagaCompensations).toBe(1);

      // Verify compensation data is removed
      expect(worker.sagaCompensations.has("saga-compensation-test")).toBe(
        false,
      );
    });
  });

  describe("Cross-Workflow Coordination", () => {
    test("should coordinate state synchronization between workflows", async () => {
      // Arrange
      const coordinationRequest = {
        type: "state_sync",
        targetWorkflowId: "target-workflow-123",
        stateData: {
          campaignId: "CAMP-001",
          status: "in_progress",
          progress: 0.5,
        },
      };

      const lhContext = {
        wfRunId: "primary-workflow-456",
      };

      // Mock state synchronization
      worker._synchronizeWorkflowStates = jest.fn().mockResolvedValue({
        success: true,
        syncedProperties: ["campaignId", "status", "progress"],
      });

      // Act
      const result = await worker.coordinateCrossWorkflow(
        coordinationRequest,
        lhContext,
      );

      // Assert
      expect(result.coordinationSuccessful).toBe(true);
      expect(result.coordinationType).toBe("state_sync");
      expect(result.primaryWorkflowId).toBe("primary-workflow-456");
      expect(result.targetWorkflowId).toBe("target-workflow-123");
      expect(worker.metrics.crossWorkflowCalls).toBe(1);

      expect(worker._synchronizeWorkflowStates).toHaveBeenCalledWith(
        "primary-workflow-456",
        "target-workflow-123",
        coordinationRequest.stateData,
      );
    });

    test("should handle event propagation to target workflow", async () => {
      // Arrange
      const coordinationRequest = {
        type: "event_propagation",
        targetWorkflowId: "target-event-workflow",
        event: {
          type: "campaign_completed",
          data: {
            campaignId: "CAMP-001",
            metrics: { sent: 1000, opened: 250 },
          },
        },
      };

      // Mock event propagation
      worker._propagateEventToWorkflow = jest.fn().mockResolvedValue({
        success: true,
        eventReceived: true,
      });

      // Act
      const result = await worker.coordinateCrossWorkflow(
        coordinationRequest,
        {},
      );

      // Assert
      expect(result.coordinationSuccessful).toBe(true);
      expect(result.coordinationType).toBe("event_propagation");
      expect(worker._propagateEventToWorkflow).toHaveBeenCalledWith(
        "target-event-workflow",
        coordinationRequest.event,
      );
    });

    test("should handle coordination failures gracefully", async () => {
      // Arrange
      const coordinationRequest = {
        type: "resource_handoff",
        targetWorkflowId: "unreachable-workflow",
        resources: ["resource-1", "resource-2"],
      };

      // Mock handoff failure
      worker._handoffResourceToWorkflow = jest
        .fn()
        .mockRejectedValue(new Error("Target workflow unreachable"));

      // Act
      const result = await worker.coordinateCrossWorkflow(
        coordinationRequest,
        {},
      );

      // Assert
      expect(result.coordinationSuccessful).toBe(false);
      expect(result.error).toBe("Target workflow unreachable");
      expect(result.requiresRetry).toBeDefined();
    });
  });

  describe("Error Handling and Retry Logic", () => {
    test("should retry on retryable errors", async () => {
      // Arrange
      const input = "Create email campaign";
      const lhContext = { wfRunId: "retry-test-workflow" };

      const retryableError = new Error("Network timeout");
      retryableError.code = "ETIMEDOUT";

      // First call fails, second succeeds
      mockClaudeService.parseMarketingCommand
        .mockRejectedValueOnce(retryableError)
        .mockResolvedValueOnce({
          intent: "create_email_campaign",
          confidence: 0.8,
          parameters: { type: "email" },
        });

      // Act
      const result = await worker.parseMarketingCommandEnhanced(
        input,
        lhContext,
      );

      // Assert
      expect(result.intent).toBe("create_email_campaign");
      expect(mockClaudeService.parseMarketingCommand).toHaveBeenCalledTimes(2);
    });

    test("should not retry on non-retryable errors", async () => {
      // Arrange
      const input = "Invalid command";
      const lhContext = { wfRunId: "no-retry-workflow" };

      const nonRetryableError = new Error("Invalid API key");
      nonRetryableError.statusCode = 401;

      mockClaudeService.parseMarketingCommand.mockRejectedValue(
        nonRetryableError,
      );

      // Act
      const result = await worker.parseMarketingCommandEnhanced(
        input,
        lhContext,
      );

      // Assert
      expect(result.intent).toBe("workflow_error");
      expect(result.parameters.canRetry).toBe(false);
      expect(mockClaudeService.parseMarketingCommand).toHaveBeenCalledTimes(1);
    });

    test("should handle Claude API service errors gracefully", async () => {
      // Arrange
      const input = "Create campaign";
      const lhContext = { wfRunId: "service-error-workflow" };

      const serviceError = new Error("Claude API service unavailable");
      serviceError.statusCode = 503;

      mockClaudeService.parseMarketingCommand.mockRejectedValue(serviceError);

      // Act
      const result = await worker.parseMarketingCommandEnhanced(
        input,
        lhContext,
      );

      // Assert
      expect(result.intent).toBe("workflow_error");
      expect(result.parameters.errorType).toBe("Error");
      expect(result.workflowMetadata.retryRecommended).toBe(true);
      expect(result.workflowMetadata.compensationRequired).toBe(false);
    });
  });

  describe("Performance and Caching", () => {
    test("should track comprehensive metrics", async () => {
      // Arrange
      const input = "Test command";
      const lhContext = { wfRunId: "metrics-test" };

      mockClaudeService.parseMarketingCommand.mockResolvedValue({
        intent: "help",
        confidence: 0.9,
        parameters: {},
        tokenUsage: 150,
      });

      // Act
      await worker.parseMarketingCommandEnhanced(input, lhContext);

      // Assert
      expect(worker.metrics.totalTasks).toBe(1);
      expect(worker.metrics.successfulTasks).toBe(1);
      expect(worker.metrics.tokenUsage.total).toBe(150);
      expect(worker.metrics.cacheMisses).toBe(1);
      expect(worker.metrics.workflowTypes.has("success")).toBe(true);
    });

    test("should implement LRU cache eviction", async () => {
      // Arrange
      const cacheMaxSize = worker.cacheConfig.maxSize;
      worker.cacheConfig.maxSize = 2; // Set small cache for testing

      const inputs = ["Command 1", "Command 2", "Command 3"];
      const lhContext = { wfRunId: "cache-eviction-test" };

      mockClaudeService.parseMarketingCommand.mockResolvedValue({
        intent: "help",
        confidence: 0.8,
        parameters: {},
      });

      // Act - Execute commands to fill and overflow cache
      for (const input of inputs) {
        await worker.parseMarketingCommandEnhanced(input, lhContext);
      }

      // Assert
      expect(worker.responseCache.size).toBe(2); // Should not exceed max size
      expect(worker.metrics.cacheMisses).toBe(3); // All were cache misses

      // Restore original cache size
      worker.cacheConfig.maxSize = cacheMaxSize;
    });

    test("should expire cached responses after TTL", async () => {
      // Arrange
      const originalTtl = worker.cacheConfig.ttlMs;
      worker.cacheConfig.ttlMs = 100; // 100ms TTL for testing

      const input = "Expiring command";
      const lhContext = { wfRunId: "ttl-test" };

      mockClaudeService.parseMarketingCommand.mockResolvedValue({
        intent: "help",
        confidence: 0.8,
        parameters: {},
      });

      // Act - First call
      await worker.parseMarketingCommandEnhanced(input, lhContext);

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Second call after TTL expiry
      await worker.parseMarketingCommandEnhanced(input, lhContext);

      // Assert
      expect(worker.metrics.cacheMisses).toBe(2); // Both were cache misses due to expiry
      expect(mockClaudeService.parseMarketingCommand).toHaveBeenCalledTimes(2);

      // Restore original TTL
      worker.cacheConfig.ttlMs = originalTtl;
    });
  });

  describe("Health Monitoring", () => {
    test("should provide comprehensive health status", () => {
      // Arrange - Set some metrics
      worker.metrics.totalTasks = 100;
      worker.metrics.successfulTasks = 95;
      worker.metrics.failedTasks = 5;
      worker.metrics.cacheHits = 20;
      worker.metrics.cacheMisses = 80;
      worker.responseCache.set("test-key", {
        response: {},
        timestamp: Date.now(),
      });

      // Act
      const health = worker.getHealthStatus();

      // Assert
      expect(health.status).toBe("healthy");
      expect(health.worker.name).toBe("test-claude-worker-enhanced");
      expect(health.worker.version).toBe("2.0.0");
      expect(health.worker.capabilities).toContain(
        "advanced-workflow-patterns",
      );
      expect(health.worker.capabilities).toContain("saga-compensation");
      expect(health.worker.successRate).toBe(95);

      expect(health.cache.size).toBe(1);
      expect(health.cache.hitRate).toBe(20); // 20/(20+80) * 100

      expect(health.claudeApi).toBeDefined();
      expect(health.workflow).toBeDefined();
      expect(health.system).toBeDefined();
    });

    test("should track workflow states", async () => {
      // Arrange
      const inputs = [
        { input: "Command 1", workflowId: "workflow-1" },
        { input: "Command 2", workflowId: "workflow-1" },
        { input: "Command 3", workflowId: "workflow-2" },
      ];

      mockClaudeService.parseMarketingCommand.mockResolvedValue({
        intent: "help",
        confidence: 0.8,
        parameters: {},
      });

      // Act
      for (const { input, workflowId } of inputs) {
        await worker.parseMarketingCommandEnhanced(input, {
          wfRunId: workflowId,
        });
      }

      const health = worker.getHealthStatus();

      // Assert
      expect(health.workflow.activeWorkflows).toBe(2); // Two unique workflows
      expect(worker.workflowStates.get("workflow-1").executionCount).toBe(2);
      expect(worker.workflowStates.get("workflow-2").executionCount).toBe(1);
    });
  });

  describe("Graceful Shutdown", () => {
    test("should shutdown cleanly with resource cleanup", async () => {
      // Arrange - Set up some state
      worker.responseCache.set("test-key", {
        response: {},
        timestamp: Date.now(),
      });
      worker.workflowStates.set("workflow-1", { executionCount: 1 });
      worker.sagaCompensations.set("saga-1", { stepName: "test" });

      // Act
      await worker.shutdown();

      // Assert
      expect(worker.responseCache.size).toBe(0);
      expect(worker.workflowStates.size).toBe(0);
      expect(worker.sagaCompensations.size).toBe(0);
      expect(mockClaudeService.shutdown).toHaveBeenCalled();
    });
  });

  describe("Workflow Context Enhancement", () => {
    test("should generate contextual insights from workflow history", async () => {
      // Arrange
      const workflowId = "insight-test-workflow";

      // Execute multiple commands to build history
      const commands = [
        "Create email campaign",
        "Create another email campaign",
        "Create SMS campaign",
      ];

      mockClaudeService.parseMarketingCommand.mockResolvedValue({
        intent: "create_email_campaign",
        confidence: 0.8,
        parameters: { type: "email" },
      });

      // Act
      for (const command of commands) {
        await worker.parseMarketingCommandEnhanced(command, {
          wfRunId: workflowId,
        });
      }

      const lastResult = await worker.parseMarketingCommandEnhanced(
        "Create final campaign",
        { wfRunId: workflowId },
      );

      // Assert
      expect(lastResult.workflowEnhancements.contextualInsights).toBeDefined();
      expect(lastResult.workflowEnhancements.contextualInsights).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "workflow_history",
            insight: expect.stringContaining("executed"),
          }),
          expect.objectContaining({
            type: "pattern_detection",
            insight: "Similar commands detected in recent history",
          }),
        ]),
      );
    });

    test("should suggest appropriate next actions based on intent", async () => {
      // Arrange
      const input = "Create email campaign for customers";
      const lhContext = { wfRunId: "next-actions-test" };

      mockClaudeService.parseMarketingCommand.mockResolvedValue({
        intent: "create_email_campaign",
        confidence: 0.6, // Low confidence should trigger clarification suggestion
        parameters: { type: "email" },
      });

      // Act
      const result = await worker.parseMarketingCommandEnhanced(
        input,
        lhContext,
      );

      // Assert
      expect(result.workflowEnhancements.recommendedNextActions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "clarify_requirements",
            priority: "high",
          }),
        ]),
      );
    });

    test("should generate workflow continuation suggestions", async () => {
      // Arrange
      const input = "Create email campaign";
      const lhContext = { wfRunId: "continuation-test" };

      mockClaudeService.parseMarketingCommand.mockResolvedValue({
        intent: "create_email_campaign",
        confidence: 0.9,
        parameters: { type: "email" },
      });

      // Act
      const result = await worker.parseMarketingCommandEnhanced(
        input,
        lhContext,
      );

      // Assert
      expect(result.workflowEnhancements.workflowContinuation).toBeDefined();
      expect(
        result.workflowEnhancements.workflowContinuation.suggestedNextSteps,
      ).toEqual(["validate_audience", "generate_content", "schedule_send"]);
      expect(
        result.workflowEnhancements.workflowContinuation.requiresHumanApproval,
      ).toBe(true);
      expect(
        result.workflowEnhancements.workflowContinuation
          .canProceedAutomatically,
      ).toBe(true);
    });
  });
});

describe("Integration Tests", () => {
  let worker;

  beforeEach(() => {
    worker = new EnhancedClaudeWorker();
  });

  afterEach(async () => {
    await worker.shutdown();
  });

  test("should handle complete campaign creation workflow", async () => {
    // Arrange
    const campaignWorkflow = [
      {
        step: "command_parsing",
        input:
          "Create urgent email campaign for premium customers with 20% discount",
        expected: "create_email_campaign",
      },
      {
        step: "content_generation",
        input: {
          campaignId: "CAMP-001",
          type: "email",
          audience: "premium_customers",
          offers: { discount: "20%" },
        },
        expected: "content-generation",
      },
    ];

    const workflowId = "integration-campaign-workflow";
    const sagaId = "integration-saga-123";

    // Mock responses
    worker.claudeService.parseMarketingCommand = jest.fn().mockResolvedValue({
      intent: "create_email_campaign",
      confidence: 0.95,
      parameters: {
        type: "email",
        audience: "premium_customers",
        priority: "high",
        offers: { discount: "20%" },
      },
    });

    worker._generateContentWithSagaPattern = jest.fn().mockResolvedValue({
      generatedContent: {
        subject: "Exclusive 20% Off for Premium Members",
        body: "Dear premium customer, enjoy 20% off...",
      },
      generatedContentIds: ["content-premium-001"],
      resourcesUsed: ["template-premium", "discount-validator"],
      tokenUsage: 750,
    });

    // Act & Assert - Step 1: Parse command
    const parseResult = await worker.parseMarketingCommandEnhanced(
      campaignWorkflow[0].input,
      { wfRunId: workflowId },
    );

    expect(parseResult.intent).toBe(campaignWorkflow[0].expected);
    expect(parseResult.parameters.priority).toBe("high");
    expect(parseResult.workflowEnhancements.workflowId).toBe(workflowId);

    // Act & Assert - Step 2: Generate content with saga
    const contentResult = await worker.generateCampaignContentSaga(
      campaignWorkflow[1].input,
      { wfRunId: workflowId, sagaId },
    );

    expect(contentResult.sagaMetadata.stepName).toBe(
      campaignWorkflow[1].expected,
    );
    expect(contentResult.sagaMetadata.canCompensate).toBe(true);
    expect(contentResult.generatedContent.subject).toContain("20% Off");

    // Verify saga compensation data is stored
    expect(worker.sagaCompensations.has(sagaId)).toBe(true);

    // Act & Assert - Step 3: Test compensation
    const compensationData = contentResult.sagaMetadata.compensationData;
    const compensationResult = await worker.compensateContentGeneration(
      compensationData,
      { sagaId },
    );

    expect(compensationResult.compensated).toBe(true);
    expect(compensationResult.results).toHaveLength(3);
    expect(worker.sagaCompensations.has(sagaId)).toBe(false);
  });

  test("should handle error recovery across workflow steps", async () => {
    // Arrange
    const workflowId = "error-recovery-workflow";

    // Step 1: Successful parsing
    worker.claudeService.parseMarketingCommand = jest.fn().mockResolvedValue({
      intent: "create_email_campaign",
      confidence: 0.8,
      parameters: { type: "email" },
    });

    // Step 2: Failed content generation
    worker._generateContentWithSagaPattern = jest
      .fn()
      .mockRejectedValue(new Error("Content service unavailable"));

    // Act - Successful parsing
    const parseResult = await worker.parseMarketingCommandEnhanced(
      "Create email campaign",
      { wfRunId: workflowId },
    );

    expect(parseResult.intent).toBe("create_email_campaign");

    // Act - Failed content generation
    const contentResult = await worker.generateCampaignContentSaga(
      { campaignId: "CAMP-FAIL", type: "email" },
      { wfRunId: workflowId, sagaId: "saga-fail" },
    );

    // Assert - Error handled gracefully
    expect(contentResult.intent).toBe("saga_step_failed");
    expect(contentResult.sagaMetadata.failureReason).toBe(
      "Content service unavailable",
    );
    expect(contentResult.error.retryable).toBe(false);

    // Verify workflow can continue despite step failure
    const healthStatus = worker.getHealthStatus();
    expect(healthStatus.status).toBe("healthy");
    expect(healthStatus.worker.successRate).toBeGreaterThan(0);
  });
});
