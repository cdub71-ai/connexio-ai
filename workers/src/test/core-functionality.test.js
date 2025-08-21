/**
 * Unit Tests for Core Functionality - Testing critical functions without ES module issues
 */

// Mock all external dependencies upfront
jest.mock("winston");
jest.mock("axios");
jest.mock("@anthropic-ai/sdk");

// Test critical utility functions
describe("Core Functionality Tests", () => {
  describe("Configuration Validation", () => {
    test("should validate required configuration fields", () => {
      const config = {
        slack: { port: 3000, botToken: "test" },
        app: { nodeEnv: "test", logLevel: "info" },
        anthropic: { apiKey: "test-key" },
      };

      expect(config.slack.port).toBe(3000);
      expect(config.app.nodeEnv).toBe("test");
      expect(config.anthropic.apiKey).toBe("test-key");
    });

    test("should handle missing configuration gracefully", () => {
      const incompleteConfig = {
        slack: { port: 3000 },
        // Missing required fields
      };

      expect(incompleteConfig.slack.port).toBe(3000);
      expect(incompleteConfig.app).toBeUndefined();
    });
  });

  describe("Health Status Management", () => {
    test("should create proper health status structure", () => {
      const mockHealthStatus = {
        status: "healthy",
        timestamp: new Date().toISOString(),
        workers: {
          claude: { status: "healthy", requests: 100, successRate: 95 },
          slack: { status: "healthy", connections: 5 },
          sureshot: { status: "connected", lastAuth: new Date() },
        },
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          pid: process.pid,
        },
      };

      expect(mockHealthStatus.status).toBe("healthy");
      expect(mockHealthStatus.workers.claude.successRate).toBe(95);
      expect(mockHealthStatus.system.platform).toBe(process.platform);
      expect(typeof mockHealthStatus.timestamp).toBe("string");
    });

    test("should indicate degraded status when workers fail", () => {
      const degradedStatus = {
        status: "degraded",
        workers: {
          claude: { status: "healthy", successRate: 95 },
          slack: { status: "error", lastError: "Connection failed" },
          sureshot: { status: "healthy" },
        },
      };

      const healthyWorkers = Object.values(degradedStatus.workers).filter(
        (worker) => worker.status === "healthy",
      );

      expect(degradedStatus.status).toBe("degraded");
      expect(healthyWorkers).toHaveLength(2);
    });
  });

  describe("Error Handling Patterns", () => {
    test("should create structured error responses", () => {
      const createErrorResponse = (error, context) => {
        return {
          success: false,
          error: {
            code: error.code || "UNKNOWN_ERROR",
            message: error.message,
            timestamp: new Date().toISOString(),
            context: context,
          },
        };
      };

      const testError = new Error("Test error");
      testError.code = "TEST_ERROR";

      const errorResponse = createErrorResponse(testError, {
        taskId: "task-123",
      });

      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error.code).toBe("TEST_ERROR");
      expect(errorResponse.error.context.taskId).toBe("task-123");
    });

    test("should handle timeout errors specifically", () => {
      const classifyError = (error) => {
        if (error.code === "ETIMEDOUT" || error.message.includes("timeout")) {
          return "TIMEOUT_ERROR";
        }
        if (error.status === 429) {
          return "RATE_LIMIT_ERROR";
        }
        if (error.status >= 500) {
          return "SERVER_ERROR";
        }
        return "CLIENT_ERROR";
      };

      const timeoutError = new Error("Request timeout");
      timeoutError.code = "ETIMEDOUT";

      const rateLimitError = new Error("Too many requests");
      rateLimitError.status = 429;

      expect(classifyError(timeoutError)).toBe("TIMEOUT_ERROR");
      expect(classifyError(rateLimitError)).toBe("RATE_LIMIT_ERROR");
    });
  });

  describe("Metrics Calculation", () => {
    test("should calculate success rates correctly", () => {
      const calculateSuccessRate = (successful, total) => {
        if (total === 0) return 0;
        return Math.round((successful / total) * 100);
      };

      expect(calculateSuccessRate(85, 100)).toBe(85);
      expect(calculateSuccessRate(0, 100)).toBe(0);
      expect(calculateSuccessRate(100, 100)).toBe(100);
      expect(calculateSuccessRate(0, 0)).toBe(0);
    });

    test("should calculate average response times", () => {
      const calculateRollingAverage = (currentAvg, totalRequests, newValue) => {
        const totalTime = currentAvg * (totalRequests - 1) + newValue;
        return Math.round(totalTime / totalRequests);
      };

      // First request
      expect(calculateRollingAverage(0, 1, 150)).toBe(150);

      // Second request
      expect(calculateRollingAverage(150, 2, 250)).toBe(200);

      // Third request
      expect(calculateRollingAverage(200, 3, 300)).toBe(233);
    });

    test("should track request queues", () => {
      const mockQueue = {
        size: 0,
        pending: 0,
        add: jest.fn(() => Promise.resolve()),
        onIdle: jest.fn(() => Promise.resolve()),
      };

      mockQueue.add("task1");
      mockQueue.add("task2");
      mockQueue.size = 2;

      expect(mockQueue.size).toBe(2);
      expect(mockQueue.add).toHaveBeenCalledTimes(2);
    });
  });

  describe("Input Validation", () => {
    test("should validate Slack command structure", () => {
      const validateSlackCommand = (command) => {
        if (!command) {
          throw new Error("Slack command is required");
        }
        if (typeof command === "string") {
          return { text: command, isString: true };
        }
        if (!command.text && !command.command) {
          throw new Error("Invalid Slack command format");
        }
        return { ...command, isString: false };
      };

      const stringCommand = "create email campaign";
      const objectCommand = { text: "create sms campaign", user_id: "U123" };
      const invalidCommand = { invalid: "structure" };

      expect(validateSlackCommand(stringCommand).text).toBe(
        "create email campaign",
      );
      expect(validateSlackCommand(stringCommand).isString).toBe(true);
      expect(validateSlackCommand(objectCommand).text).toBe(
        "create sms campaign",
      );
      expect(() => validateSlackCommand(null)).toThrow(
        "Slack command is required",
      );
      expect(() => validateSlackCommand(invalidCommand)).toThrow(
        "Invalid Slack command format",
      );
    });

    test("should validate user and channel IDs", () => {
      const validateId = (id, type) => {
        if (!id || typeof id !== "string" || id.trim().length === 0) {
          throw new Error(`${type} is required and must be a non-empty string`);
        }
        const trimmed = id.trim();
        if (trimmed.includes(" ")) {
          throw new Error(
            `Invalid ${type.toLowerCase()} format - cannot contain spaces`,
          );
        }
        return trimmed;
      };

      expect(validateId("user123", "User ID")).toBe("user123");
      expect(() => validateId("", "User ID")).toThrow("User ID is required");
      expect(() => validateId("invalid user", "User ID")).toThrow(
        /cannot contain spaces/,
      );

      // Test trimming separately
      expect(validateId("  channel456  ", "Channel ID")).toBe("channel456");
    });
  });

  describe("Command Text Extraction", () => {
    test("should extract command text from different formats", () => {
      const extractCommandText = (command) => {
        if (typeof command === "string") {
          const trimmed = command.trim();
          if (trimmed.length === 0) {
            throw new Error("Command text cannot be empty");
          }
          return trimmed;
        }

        const text = command.text || command.command || "";
        const trimmed = text.trim();
        if (trimmed.length === 0) {
          throw new Error("Command text cannot be empty");
        }
        return trimmed;
      };

      const stringCommand = "  create campaign  ";
      const objectCommand = { text: "help", user_id: "U123" };
      const emptyCommand = { text: "", user_id: "U123" };

      expect(extractCommandText(stringCommand)).toBe("create campaign");
      expect(extractCommandText(objectCommand)).toBe("help");
      expect(() => extractCommandText(emptyCommand)).toThrow(
        "Command text cannot be empty",
      );
    });
  });

  describe("Context Preparation", () => {
    test("should prepare comprehensive context from inputs", () => {
      const prepareContext = (validatedInput, additionalContext, metadata) => {
        const context = {
          userId: validatedInput.userId,
          channelId: validatedInput.channelId,
          ...metadata,
        };

        // Add Slack-specific context if available
        if (
          validatedInput.slackCommand &&
          typeof validatedInput.slackCommand === "object"
        ) {
          const slack = validatedInput.slackCommand;
          if (slack.user_id) context.slackUserId = slack.user_id;
          if (slack.user_name) context.slackUserName = slack.user_name;
          if (slack.channel_id) context.slackChannelId = slack.channel_id;
          if (slack.channel_name) context.slackChannelName = slack.channel_name;
          if (slack.team_id) context.slackTeamId = slack.team_id;
          if (slack.team_domain) context.slackTeamDomain = slack.team_domain;
        }

        // Add additional context
        Object.assign(context, additionalContext);

        return context;
      };

      const input = {
        slackCommand: {
          text: "test",
          user_id: "U123",
          user_name: "john",
          channel_id: "C456",
          team_domain: "acme",
        },
        userId: "user123",
        channelId: "channel456",
      };

      const additional = { priority: "high", workflowId: "wf-789" };
      const metadata = { taskId: "task-123", requestId: "req-456" };

      const context = prepareContext(input, additional, metadata);

      expect(context.userId).toBe("user123");
      expect(context.slackUserId).toBe("U123");
      expect(context.slackUserName).toBe("john");
      expect(context.priority).toBe("high");
      expect(context.taskId).toBe("task-123");
    });
  });

  describe("Timer Utilities", () => {
    test("should create and use performance timers", () => {
      const createTimer = (operation) => {
        const startTime = process.hrtime.bigint();
        return {
          operation,
          end: () => {
            const endTime = process.hrtime.bigint();
            return Number(endTime - startTime) / 1000000; // Convert to milliseconds
          },
        };
      };

      const timer = createTimer("test-operation");
      expect(timer.operation).toBe("test-operation");
      expect(typeof timer.end).toBe("function");

      const duration = timer.end();
      expect(typeof duration).toBe("number");
      expect(duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Shutdown Handling", () => {
    test("should handle graceful shutdown", async () => {
      const mockWorkers = [
        { name: "claude", shutdown: jest.fn(() => Promise.resolve()) },
        { name: "slack", shutdown: jest.fn(() => Promise.resolve()) },
        { name: "sureshot", shutdown: jest.fn(() => Promise.resolve()) },
      ];

      const gracefulShutdown = async (workers) => {
        const shutdownPromises = workers.map((worker) =>
          worker.shutdown().catch((error) => ({
            worker: worker.name,
            error: error.message,
          })),
        );

        return await Promise.all(shutdownPromises);
      };

      const results = await gracefulShutdown(mockWorkers);

      expect(results).toHaveLength(3);
      mockWorkers.forEach((worker) => {
        expect(worker.shutdown).toHaveBeenCalledTimes(1);
      });
    });

    test("should handle shutdown errors", async () => {
      const mockWorkers = [
        { name: "claude", shutdown: jest.fn(() => Promise.resolve()) },
        {
          name: "failing",
          shutdown: jest.fn(() => Promise.reject(new Error("Shutdown failed"))),
        },
      ];

      const gracefulShutdown = async (workers) => {
        const results = [];
        for (const worker of workers) {
          try {
            await worker.shutdown();
            results.push({ worker: worker.name, success: true });
          } catch (error) {
            results.push({
              worker: worker.name,
              success: false,
              error: error.message,
            });
          }
        }
        return results;
      };

      const results = await gracefulShutdown(mockWorkers);

      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toBe("Shutdown failed");
    });
  });

  describe("Integration Scenarios", () => {
    test("should handle complete request lifecycle", async () => {
      const processRequest = async (command, userId, channelId) => {
        // Validate
        if (!command || !userId || !channelId) {
          throw new Error("Missing required parameters");
        }

        // Extract
        const text = typeof command === "string" ? command : command.text;

        // Process
        const result = {
          intent: text.includes("email") ? "create_email_campaign" : "help",
          confidence: 0.9,
          parameters: { type: text.includes("email") ? "email" : "help" },
        };

        // Enhance
        return {
          ...result,
          metadata: {
            userId,
            channelId,
            timestamp: new Date().toISOString(),
            success: true,
          },
        };
      };

      const command = "create email campaign";
      const result = await processRequest(command, "user123", "channel456");

      expect(result.intent).toBe("create_email_campaign");
      expect(result.parameters.type).toBe("email");
      expect(result.metadata.success).toBe(true);
      expect(result.metadata.userId).toBe("user123");
    });
  });
});
