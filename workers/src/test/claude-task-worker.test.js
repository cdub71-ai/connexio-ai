/**
 * Unit Tests for ClaudeTaskWorker - Core worker functionality
 */

import ClaudeTaskWorker from "../workers/claude-task-worker.js";

// Mock dependencies
jest.mock("littlehorse-client", () => ({
  LHTaskWorker: () => (target, propertyKey, descriptor) => descriptor,
}));
jest.mock("../services/claude-api.js");
jest.mock("../config/index.js", () => ({
  worker: {
    taskName: "parse-marketing-command",
    maxConcurrentTasks: 10,
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
    end: jest.fn(() => 250),
  }),
}));
jest.mock("uuid", () => ({
  v4: () => "test-task-id",
}));

import ClaudeApiService from "../services/claude-api.js";

describe("ClaudeTaskWorker", () => {
  let claudeTaskWorker;
  let mockClaudeService;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock ClaudeApiService
    mockClaudeService = {
      parseMarketingCommand: jest.fn(),
      getHealthMetrics: jest.fn(() => ({
        totalRequests: 10,
        successfulRequests: 8,
        successRate: 80,
      })),
      shutdown: jest.fn(() => Promise.resolve()),
    };

    ClaudeApiService.mockImplementation(() => mockClaudeService);

    claudeTaskWorker = new ClaudeTaskWorker();
  });

  describe("Constructor", () => {
    test("should initialize with correct configuration", () => {
      expect(ClaudeApiService).toHaveBeenCalledTimes(1);
      expect(claudeTaskWorker.activeTasksCount).toBe(0);
      expect(claudeTaskWorker.taskMetrics).toEqual({
        totalTasks: 0,
        successfulTasks: 0,
        failedTasks: 0,
        averageProcessingTime: 0,
      });
    });
  });

  describe("parseMarketingCommand()", () => {
    const mockSlackCommand = {
      command: "/marketing",
      text: "create email campaign for summer sale",
      user_id: "U123456",
      user_name: "john.doe",
      channel_id: "C789012",
      channel_name: "marketing",
      team_id: "T345678",
      team_domain: "acme-corp",
    };

    const mockUserId = "user123";
    const mockChannelId = "channel456";
    const mockAdditionalContext = {
      wfRunId: "workflow789",
      priority: "high",
    };

    beforeEach(() => {
      // Reset active tasks count for each test
      claudeTaskWorker.activeTasksCount = 0;
      claudeTaskWorker.taskMetrics = {
        totalTasks: 0,
        successfulTasks: 0,
        failedTasks: 0,
        averageProcessingTime: 0,
      };
    });

    test("should process marketing command successfully", async () => {
      const mockClaudeResult = {
        intent: "create_email_campaign",
        confidence: 0.95,
        parameters: {
          name: "Summer Sale Campaign",
          type: "email",
          subject: "Summer Sale - Up to 50% Off!",
          channels: ["email"],
          priority: "high",
        },
        extractedEntities: {
          percentages: ["50%"],
          channels: ["email"],
        },
        summary: "Create email campaign for summer sale",
        metadata: {
          requestId: "test-uuid-123",
          tokenUsage: { total_tokens: 150 },
        },
      };

      mockClaudeService.parseMarketingCommand.mockResolvedValue(
        mockClaudeResult,
      );

      const result = await claudeTaskWorker.parseMarketingCommand(
        mockSlackCommand,
        mockUserId,
        mockChannelId,
        mockAdditionalContext,
      );

      expect(mockClaudeService.parseMarketingCommand).toHaveBeenCalledWith(
        "create email campaign for summer sale",
        expect.objectContaining({
          userId: mockUserId,
          channelId: mockChannelId,
          taskId: "test-task-id",
          workflowId: "workflow789",
          requestId: "test-task-id",
          slackUserId: "U123456",
          slackUserName: "john.doe",
          slackChannelId: "C789012",
          slackChannelName: "marketing",
          slackTeamId: "T345678",
          slackTeamDomain: "acme-corp",
          priority: "high",
        }),
      );

      expect(result.taskMetadata).toBeDefined();
      expect(result.taskMetadata.taskId).toBe("test-task-id");
      expect(result.taskMetadata.workflowId).toBe("workflow789");
      expect(result.taskMetadata.processingTimeMs).toBe(250);
      expect(result.taskMetadata.success).toBe(true);

      expect(claudeTaskWorker.taskMetrics.totalTasks).toBe(1);
      expect(claudeTaskWorker.taskMetrics.successfulTasks).toBe(1);
      expect(claudeTaskWorker.taskMetrics.failedTasks).toBe(0);
    });

    test("should handle string slack command input", async () => {
      const stringCommand = "create sms campaign for flash sale";
      const mockResult = {
        intent: "create_sms_campaign",
        confidence: 0.9,
        parameters: { type: "sms" },
      };

      mockClaudeService.parseMarketingCommand.mockResolvedValue(mockResult);

      const result = await claudeTaskWorker.parseMarketingCommand(
        stringCommand,
        mockUserId,
        mockChannelId,
        mockAdditionalContext,
      );

      expect(mockClaudeService.parseMarketingCommand).toHaveBeenCalledWith(
        "create sms campaign for flash sale",
        expect.objectContaining({
          userId: mockUserId,
          channelId: mockChannelId,
        }),
      );

      expect(result.intent).toBe("create_sms_campaign");
    });

    test("should validate input and reject invalid data", async () => {
      const result = await claudeTaskWorker.parseMarketingCommand(
        null, // Invalid command
        mockUserId,
        mockChannelId,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe("VALIDATION_ERROR");
      expect(result.error.message).toContain("Slack command is required");

      expect(mockClaudeService.parseMarketingCommand).not.toHaveBeenCalled();
      expect(claudeTaskWorker.taskMetrics.failedTasks).toBe(1);
    });

    test("should validate user ID input", async () => {
      const result = await claudeTaskWorker.parseMarketingCommand(
        mockSlackCommand,
        "", // Invalid user ID
        mockChannelId,
      );

      expect(result.success).toBe(false);
      expect(result.error.code).toBe("VALIDATION_ERROR");
      expect(result.error.message).toContain("User ID is required");
    });

    test("should validate channel ID input", async () => {
      const result = await claudeTaskWorker.parseMarketingCommand(
        mockSlackCommand,
        mockUserId,
        null, // Invalid channel ID
      );

      expect(result.success).toBe(false);
      expect(result.error.code).toBe("VALIDATION_ERROR");
      expect(result.error.message).toContain("Channel ID is required");
    });

    test("should handle Claude API service errors gracefully", async () => {
      const claudeError = new Error("Claude API rate limit exceeded");
      claudeError.code = "RATE_LIMIT_EXCEEDED";
      claudeError.statusCode = 429;

      mockClaudeService.parseMarketingCommand.mockRejectedValue(claudeError);

      const result = await claudeTaskWorker.parseMarketingCommand(
        mockSlackCommand,
        mockUserId,
        mockChannelId,
        mockAdditionalContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(result.error.originalError).toBe(claudeError);
      expect(result.taskMetadata.success).toBe(false);

      expect(claudeTaskWorker.taskMetrics.failedTasks).toBe(1);
      expect(claudeTaskWorker.taskMetrics.successfulTasks).toBe(0);
    });

    test("should extract command text from complex Slack object", async () => {
      const complexSlackCommand = {
        command: "/marketing",
        text: "create email campaign",
        response_url: "https://hooks.slack.com/commands/123",
        trigger_id: "trigger123",
        api_app_id: "app123",
        additional_fields: {
          nested: "data",
        },
      };

      const mockResult = { intent: "create_email_campaign", confidence: 0.8 };
      mockClaudeService.parseMarketingCommand.mockResolvedValue(mockResult);

      await claudeTaskWorker.parseMarketingCommand(
        complexSlackCommand,
        mockUserId,
        mockChannelId,
      );

      expect(mockClaudeService.parseMarketingCommand).toHaveBeenCalledWith(
        "create email campaign",
        expect.any(Object),
      );
    });

    test("should handle empty text in Slack command", async () => {
      const emptyTextCommand = {
        command: "/marketing",
        text: "",
        user_id: "U123456",
      };

      const result = await claudeTaskWorker.parseMarketingCommand(
        emptyTextCommand,
        mockUserId,
        mockChannelId,
      );

      expect(result.success).toBe(false);
      expect(result.error.code).toBe("VALIDATION_ERROR");
      expect(result.error.message).toContain("Command text cannot be empty");
    });

    test("should track active tasks count correctly", async () => {
      const mockResult = { intent: "help", confidence: 0.9 };
      mockClaudeService.parseMarketingCommand.mockImplementation(
        () =>
          new Promise((resolve) => {
            // Simulate async processing
            setTimeout(() => resolve(mockResult), 10);
          }),
      );

      // Start multiple tasks concurrently
      const tasks = [
        claudeTaskWorker.parseMarketingCommand(
          mockSlackCommand,
          "user1",
          "channel1",
        ),
        claudeTaskWorker.parseMarketingCommand(
          mockSlackCommand,
          "user2",
          "channel2",
        ),
        claudeTaskWorker.parseMarketingCommand(
          mockSlackCommand,
          "user3",
          "channel3",
        ),
      ];

      // Tasks should be running
      expect(claudeTaskWorker.activeTasksCount).toBe(3);

      // Wait for all tasks to complete
      await Promise.all(tasks);

      // Active count should be back to 0
      expect(claudeTaskWorker.activeTasksCount).toBe(0);
      expect(claudeTaskWorker.taskMetrics.totalTasks).toBe(3);
      expect(claudeTaskWorker.taskMetrics.successfulTasks).toBe(3);
    });

    test("should calculate average processing time correctly", async () => {
      // Mock timer to return different durations
      const { createTimer } = require("../utils/logger.js");
      let callCount = 0;
      createTimer.mockImplementation(() => ({
        end: jest.fn(() => {
          callCount++;
          return callCount === 1 ? 100 : 200; // First call 100ms, second 200ms
        }),
      }));

      const mockResult = { intent: "help", confidence: 0.9 };
      mockClaudeService.parseMarketingCommand.mockResolvedValue(mockResult);

      await claudeTaskWorker.parseMarketingCommand(
        mockSlackCommand,
        mockUserId,
        mockChannelId,
      );
      await claudeTaskWorker.parseMarketingCommand(
        mockSlackCommand,
        mockUserId,
        mockChannelId,
      );

      expect(claudeTaskWorker.taskMetrics.averageProcessingTime).toBe(150); // (100 + 200) / 2
    });
  });

  describe("Input validation", () => {
    test("should validate Slack command object structure", () => {
      const invalidCommand = { invalid: "structure" };

      expect(() => {
        claudeTaskWorker._validateInput(
          invalidCommand,
          "user123",
          "channel456",
        );
      }).toThrow("Invalid Slack command format");
    });

    test("should handle minimal valid Slack command", () => {
      const minimalCommand = { text: "help" };

      const result = claudeTaskWorker._validateInput(
        minimalCommand,
        "user123",
        "channel456",
      );

      expect(result.slackCommand).toEqual(minimalCommand);
      expect(result.userId).toBe("user123");
      expect(result.channelId).toBe("channel456");
    });

    test("should validate user ID format", () => {
      expect(() => {
        claudeTaskWorker._validateInput(
          { text: "help" },
          "invalid user id",
          "channel456",
        );
      }).toThrow("Invalid user ID format");
    });

    test("should validate channel ID format", () => {
      expect(() => {
        claudeTaskWorker._validateInput(
          { text: "help" },
          "user123",
          "invalid channel id",
        );
      }).toThrow("Invalid channel ID format");
    });
  });

  describe("Command text extraction", () => {
    test("should extract text from Slack command object", () => {
      const command = { text: "create campaign", command: "/marketing" };
      const extracted = claudeTaskWorker._extractCommandText(command);
      expect(extracted).toBe("create campaign");
    });

    test("should return string command as-is", () => {
      const command = "create campaign";
      const extracted = claudeTaskWorker._extractCommandText(command);
      expect(extracted).toBe("create campaign");
    });

    test("should throw for empty text", () => {
      const command = { text: "", command: "/marketing" };
      expect(() => {
        claudeTaskWorker._extractCommandText(command);
      }).toThrow("Command text cannot be empty");
    });
  });

  describe("Context preparation", () => {
    test("should prepare comprehensive context object", () => {
      const validatedInput = {
        slackCommand: {
          text: "test command",
          user_id: "U123",
          user_name: "john",
          channel_id: "C456",
          channel_name: "marketing",
          team_id: "T789",
          team_domain: "acme",
        },
        userId: "user123",
        channelId: "channel456",
      };

      const additionalContext = {
        wfRunId: "workflow789",
        priority: "high",
      };

      const metadata = {
        taskId: "task123",
        workflowId: "workflow789",
        requestId: "req123",
      };

      const context = claudeTaskWorker._prepareContext(
        validatedInput,
        additionalContext,
        metadata,
      );

      expect(context).toEqual({
        userId: "user123",
        channelId: "channel456",
        taskId: "task123",
        workflowId: "workflow789",
        requestId: "req123",
        slackUserId: "U123",
        slackUserName: "john",
        slackChannelId: "C456",
        slackChannelName: "marketing",
        slackTeamId: "T789",
        slackTeamDomain: "acme",
        priority: "high",
      });
    });

    test("should handle minimal context", () => {
      const validatedInput = {
        slackCommand: { text: "test" },
        userId: "user123",
        channelId: "channel456",
      };

      const context = claudeTaskWorker._prepareContext(validatedInput, {}, {});

      expect(context.userId).toBe("user123");
      expect(context.channelId).toBe("channel456");
      expect(context.slackUserId).toBeUndefined();
    });
  });

  describe("Result enhancement", () => {
    test("should enhance result with task metadata", () => {
      const claudeResult = {
        intent: "create_email_campaign",
        confidence: 0.9,
        parameters: { type: "email" },
      };

      const validatedInput = {
        slackCommand: { text: "create email" },
        userId: "user123",
        channelId: "channel456",
      };

      const context = { taskId: "task123", workflowId: "workflow789" };

      const enhanced = claudeTaskWorker._enhanceResult(
        claudeResult,
        validatedInput,
        context,
      );

      expect(enhanced.intent).toBe("create_email_campaign");
      expect(enhanced.taskMetadata).toBeDefined();
      expect(enhanced.taskMetadata.taskId).toBe("task123");
      expect(enhanced.taskMetadata.workflowId).toBe("workflow789");
      expect(enhanced.taskMetadata.success).toBe(true);
      expect(enhanced.inputSummary).toBeDefined();
      expect(enhanced.inputSummary.commandText).toBe("create email");
    });

    test("should include input validation summary", () => {
      const result = { intent: "help", confidence: 0.8 };
      const input = {
        slackCommand: { text: "help", user_id: "U123" },
        userId: "user123",
        channelId: "channel456",
      };
      const context = {};

      const enhanced = claudeTaskWorker._enhanceResult(result, input, context);

      expect(enhanced.inputSummary.hasSlackContext).toBe(true);
      expect(enhanced.inputSummary.commandLength).toBe(4);
    });
  });

  describe("Error response creation", () => {
    test("should create structured error response", () => {
      const error = new Error("Test error");
      error.code = "TEST_ERROR";

      const context = {
        taskId: "task123",
        workflowId: "workflow789",
        userId: "user123",
        channelId: "channel456",
        command: { text: "test command" },
      };

      const errorResponse = claudeTaskWorker._createErrorResponse(
        error,
        context,
      );

      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error.code).toBe("TEST_ERROR");
      expect(errorResponse.error.message).toBe("Test error");
      expect(errorResponse.error.originalError).toBe(error);
      expect(errorResponse.taskMetadata.taskId).toBe("task123");
      expect(errorResponse.taskMetadata.success).toBe(false);
      expect(errorResponse.fallbackIntent).toBe("help");
    });

    test("should provide help fallback for errors", () => {
      const error = new Error("Service unavailable");
      const context = { command: "create email campaign" };

      const errorResponse = claudeTaskWorker._createErrorResponse(
        error,
        context,
      );

      expect(errorResponse.fallbackIntent).toBe("help");
      expect(errorResponse.fallbackMessage).toContain("Please try again");
    });
  });

  describe("Health status and metrics", () => {
    test("should return comprehensive health status", () => {
      claudeTaskWorker.activeTasksCount = 3;
      claudeTaskWorker.taskMetrics = {
        totalTasks: 100,
        successfulTasks: 90,
        failedTasks: 10,
        averageProcessingTime: 250,
      };

      const health = claudeTaskWorker.getHealthStatus();

      expect(health.status).toBe("healthy");
      expect(health.activeTasks).toBe(3);
      expect(health.totalTasks).toBe(100);
      expect(health.successRate).toBe(90);
      expect(health.averageProcessingTime).toBe(250);
      expect(health.claudeApiHealth).toBeDefined();
    });

    test("should indicate degraded status when error rate is high", () => {
      claudeTaskWorker.taskMetrics = {
        totalTasks: 100,
        successfulTasks: 60,
        failedTasks: 40,
        averageProcessingTime: 500,
      };

      const health = claudeTaskWorker.getHealthStatus();

      expect(health.status).toBe("degraded");
      expect(health.successRate).toBe(60);
    });

    test("should handle zero tasks gracefully", () => {
      const health = claudeTaskWorker.getHealthStatus();

      expect(health.successRate).toBe(0);
      expect(health.averageProcessingTime).toBe(0);
      expect(health.status).toBe("healthy");
    });
  });

  describe("Task metrics updates", () => {
    test("should update metrics on successful task", () => {
      claudeTaskWorker._updateTaskMetrics(true, 150);

      expect(claudeTaskWorker.taskMetrics.totalTasks).toBe(1);
      expect(claudeTaskWorker.taskMetrics.successfulTasks).toBe(1);
      expect(claudeTaskWorker.taskMetrics.failedTasks).toBe(0);
      expect(claudeTaskWorker.taskMetrics.averageProcessingTime).toBe(150);
    });

    test("should update metrics on failed task", () => {
      claudeTaskWorker._updateTaskMetrics(false, 300);

      expect(claudeTaskWorker.taskMetrics.totalTasks).toBe(1);
      expect(claudeTaskWorker.taskMetrics.successfulTasks).toBe(0);
      expect(claudeTaskWorker.taskMetrics.failedTasks).toBe(1);
      expect(claudeTaskWorker.taskMetrics.averageProcessingTime).toBe(300);
    });
  });

  describe("Shutdown", () => {
    test("should shutdown gracefully", async () => {
      await claudeTaskWorker.shutdown();
      expect(mockClaudeService.shutdown).toHaveBeenCalled();
    });

    test("should wait for active tasks during shutdown", async () => {
      claudeTaskWorker.activeTasksCount = 2;

      // Mock active tasks completing
      setTimeout(() => {
        claudeTaskWorker.activeTasksCount = 0;
      }, 50);

      await claudeTaskWorker.shutdown();
      expect(mockClaudeService.shutdown).toHaveBeenCalled();
    });
  });
});
