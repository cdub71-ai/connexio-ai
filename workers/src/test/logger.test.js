/**
 * Unit Tests for Logger utilities - Foundational logging system
 */

import winston from "winston";
import { createContextLogger, createTimer } from "../utils/logger.js";

// Mock winston
jest.mock("winston", () => ({
  createLogger: jest.fn(),
  format: {
    combine: jest.fn((...formats) => ({ combined: formats })),
    timestamp: jest.fn((options) => ({ timestamp: options })),
    errors: jest.fn((options) => ({ errors: options })),
    printf: jest.fn((formatter) => ({ printf: formatter })),
    colorize: jest.fn(() => ({ colorize: true })),
  },
  transports: {
    Console: jest
      .fn()
      .mockImplementation((options) => ({ console: true, ...options })),
    File: jest
      .fn()
      .mockImplementation((options) => ({ file: true, ...options })),
  },
}));

jest.mock("../config/index.js", () => ({
  app: {
    logLevel: "info",
    workerName: "test-worker",
    nodeEnv: "test",
  },
}));

describe("Logger utilities", () => {
  let mockLogger;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock the winston logger instance
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    winston.createLogger.mockReturnValue(mockLogger);

    // Clear module cache to ensure fresh imports
    jest.resetModules();
  });

  describe("Logger initialization", () => {
    test("should create logger with correct configuration", async () => {
      // Re-import to trigger logger creation
      await import("../utils/logger.js");

      expect(winston.createLogger).toHaveBeenCalledWith({
        level: "info",
        defaultMeta: {
          service: "test-worker",
          pid: process.pid,
          nodeEnv: "test",
        },
        transports: expect.arrayContaining([
          expect.objectContaining({ console: true }),
          expect.objectContaining({
            file: true,
            filename: "logs/error.log",
            level: "error",
          }),
          expect.objectContaining({
            file: true,
            filename: "logs/combined.log",
          }),
        ]),
        exceptionHandlers: expect.arrayContaining([
          expect.objectContaining({
            file: true,
            filename: "logs/exceptions.log",
          }),
        ]),
        rejectionHandlers: expect.arrayContaining([
          expect.objectContaining({
            file: true,
            filename: "logs/rejections.log",
          }),
        ]),
      });
    });

    test("should configure file transports with rotation", async () => {
      await import("../utils/logger.js");

      const fileTransportCalls = winston.transports.File.mock.calls;

      // Error log transport
      const errorTransport = fileTransportCalls.find(
        (call) => call[0].filename === "logs/error.log",
      );
      expect(errorTransport[0]).toMatchObject({
        level: "error",
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
      });

      // Combined log transport
      const combinedTransport = fileTransportCalls.find(
        (call) => call[0].filename === "logs/combined.log",
      );
      expect(combinedTransport[0]).toMatchObject({
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 10,
      });
    });

    test("should configure console transport with colors", async () => {
      await import("../utils/logger.js");

      expect(winston.transports.Console).toHaveBeenCalledWith({
        format: expect.objectContaining({
          combined: expect.arrayContaining([
            { colorize: true },
            expect.any(Object),
          ]),
        }),
      });
    });
  });

  describe("createContextLogger()", () => {
    let logger;

    beforeEach(async () => {
      const loggerModule = await import("../utils/logger.js");
      logger = loggerModule.createContextLogger({
        service: "test-service",
        taskId: "task-123",
        workflowId: "workflow-456",
      });
    });

    test("should create logger with context", () => {
      expect(logger).toHaveProperty("debug");
      expect(logger).toHaveProperty("info");
      expect(logger).toHaveProperty("warn");
      expect(logger).toHaveProperty("error");
      expect(logger).toHaveProperty("taskStart");
      expect(logger).toHaveProperty("taskComplete");
      expect(logger).toHaveProperty("taskError");
    });

    test("should log debug messages with context", () => {
      logger.debug("Debug message", { extra: "data" });

      expect(mockLogger.debug).toHaveBeenCalledWith("Debug message", {
        service: "test-service",
        taskId: "task-123",
        workflowId: "workflow-456",
        extra: "data",
      });
    });

    test("should log info messages with context", () => {
      logger.info("Info message", { userId: "user123" });

      expect(mockLogger.info).toHaveBeenCalledWith("Info message", {
        service: "test-service",
        taskId: "task-123",
        workflowId: "workflow-456",
        userId: "user123",
      });
    });

    test("should log warning messages with context", () => {
      logger.warn("Warning message", { code: "WARN001" });

      expect(mockLogger.warn).toHaveBeenCalledWith("Warning message", {
        service: "test-service",
        taskId: "task-123",
        workflowId: "workflow-456",
        code: "WARN001",
      });
    });

    test("should log error messages with context", () => {
      const error = new Error("Test error");
      logger.error("Error occurred", {
        error: error.message,
        stack: error.stack,
      });

      expect(mockLogger.error).toHaveBeenCalledWith("Error occurred", {
        service: "test-service",
        taskId: "task-123",
        workflowId: "workflow-456",
        error: "Test error",
        stack: error.stack,
      });
    });

    test("should handle empty context", () => {
      const emptyContextLogger = createContextLogger();

      emptyContextLogger.info("Test message", { data: "value" });

      expect(mockLogger.info).toHaveBeenCalledWith("Test message", {
        data: "value",
      });
    });

    test("should handle empty meta object", () => {
      logger.info("Test message");

      expect(mockLogger.info).toHaveBeenCalledWith("Test message", {
        service: "test-service",
        taskId: "task-123",
        workflowId: "workflow-456",
      });
    });
  });

  describe("Specialized logging methods", () => {
    let logger;

    beforeEach(async () => {
      const loggerModule = await import("../utils/logger.js");
      logger = loggerModule.createContextLogger({
        service: "test-service",
        taskId: "task-123",
        workflowId: "workflow-456",
      });
    });

    describe("taskStart()", () => {
      test("should log task start with proper metadata", () => {
        const input = { command: "test command", userId: "user123" };

        logger.taskStart("task-123", "workflow-456", input);

        expect(mockLogger.info).toHaveBeenCalledWith("Task started", {
          service: "test-service",
          taskId: "task-123",
          workflowId: "workflow-456",
          inputSize: JSON.stringify(input).length,
          event: "task_start",
        });
      });

      test("should handle large input objects", () => {
        const largeInput = { data: "x".repeat(10000) };

        logger.taskStart("task-123", "workflow-456", largeInput);

        expect(mockLogger.info).toHaveBeenCalledWith(
          "Task started",
          expect.objectContaining({
            inputSize: JSON.stringify(largeInput).length,
            event: "task_start",
          }),
        );
      });
    });

    describe("taskComplete()", () => {
      test("should log task completion with metrics", () => {
        const output = { result: "success", recordsProcessed: 100 };
        const duration = 1500;

        logger.taskComplete("task-123", "workflow-456", output, duration);

        expect(mockLogger.info).toHaveBeenCalledWith("Task completed", {
          service: "test-service",
          taskId: "task-123",
          workflowId: "workflow-456",
          outputSize: JSON.stringify(output).length,
          durationMs: duration,
          event: "task_complete",
        });
      });

      test("should handle zero duration", () => {
        logger.taskComplete("task-123", "workflow-456", { result: "ok" }, 0);

        expect(mockLogger.info).toHaveBeenCalledWith(
          "Task completed",
          expect.objectContaining({
            durationMs: 0,
          }),
        );
      });
    });

    describe("taskError()", () => {
      test("should log task errors with full error details", () => {
        const error = new Error("Task failed");
        error.code = "TASK_ERROR";
        error.statusCode = 500;
        const duration = 800;

        logger.taskError("task-123", "workflow-456", error, duration);

        expect(mockLogger.error).toHaveBeenCalledWith("Task failed", {
          service: "test-service",
          taskId: "task-123",
          workflowId: "workflow-456",
          errorName: "Error",
          errorCode: "TASK_ERROR",
          statusCode: 500,
          errorStack: error.stack,
          durationMs: duration,
          event: "task_error",
        });
      });

      test("should handle errors without additional properties", () => {
        const simpleError = new Error("Simple error");

        logger.taskError("task-123", "workflow-456", simpleError, 500);

        expect(mockLogger.error).toHaveBeenCalledWith(
          "Task failed",
          expect.objectContaining({
            errorName: "Error",
            errorCode: undefined,
            statusCode: undefined,
            errorStack: simpleError.stack,
          }),
        );
      });
    });

    describe("apiCall()", () => {
      test("should log API calls with request details", () => {
        logger.apiCall("POST", "/api/v1/campaigns", 201, 750, "req-123");

        expect(mockLogger.info).toHaveBeenCalledWith("API call", {
          service: "test-service",
          taskId: "task-123",
          workflowId: "workflow-456",
          method: "POST",
          endpoint: "/api/v1/campaigns",
          statusCode: 201,
          durationMs: 750,
          requestId: "req-123",
          event: "api_call",
        });
      });

      test("should handle missing optional parameters", () => {
        logger.apiCall("GET", "/api/v1/status", 200, 150);

        expect(mockLogger.info).toHaveBeenCalledWith(
          "API call",
          expect.objectContaining({
            method: "GET",
            endpoint: "/api/v1/status",
            statusCode: 200,
            durationMs: 150,
            requestId: undefined,
          }),
        );
      });
    });

    describe("rateLimitHit()", () => {
      test("should log rate limit events", () => {
        logger.rateLimitHit("claude-api", 5000);

        expect(mockLogger.warn).toHaveBeenCalledWith("Rate limit hit", {
          service: "test-service",
          taskId: "task-123",
          workflowId: "workflow-456",
          apiService: "claude-api",
          retryAfterMs: 5000,
          event: "rate_limit_hit",
        });
      });

      test("should handle zero retry delay", () => {
        logger.rateLimitHit("sureshot-api", 0);

        expect(mockLogger.warn).toHaveBeenCalledWith(
          "Rate limit hit",
          expect.objectContaining({
            apiService: "sureshot-api",
            retryAfterMs: 0,
          }),
        );
      });
    });

    describe("retryAttempt()", () => {
      test("should log retry attempts with full details", () => {
        const error = new Error("Request failed");

        logger.retryAttempt(2, 5, error, 2000);

        expect(mockLogger.warn).toHaveBeenCalledWith("Retry attempt", {
          service: "test-service",
          taskId: "task-123",
          workflowId: "workflow-456",
          attemptNumber: 2,
          maxAttempts: 5,
          error: "Request failed",
          retryDelayMs: 2000,
          event: "retry_attempt",
        });
      });

      test("should handle final retry attempt", () => {
        const error = new Error("Final attempt failed");

        logger.retryAttempt(3, 3, error, 0);

        expect(mockLogger.warn).toHaveBeenCalledWith(
          "Retry attempt",
          expect.objectContaining({
            attemptNumber: 3,
            maxAttempts: 3,
            retryDelayMs: 0,
          }),
        );
      });
    });
  });

  describe("createTimer()", () => {
    let timer;

    beforeEach(async () => {
      const loggerModule = await import("../utils/logger.js");
      timer = loggerModule.createTimer("test-operation");
    });

    test("should create timer with operation name", () => {
      expect(timer).toHaveProperty("end");
      expect(typeof timer.end).toBe("function");
    });

    test("should measure elapsed time", async () => {
      // Wait a short time
      await new Promise((resolve) => setTimeout(resolve, 10));

      const duration = timer.end();

      expect(duration).toBeGreaterThanOrEqual(10);
      expect(typeof duration).toBe("number");
    });

    test("should return consistent duration on multiple calls", () => {
      const duration1 = timer.end();
      const duration2 = timer.end();

      expect(duration1).toBe(duration2);
    });

    test("should handle immediate end call", () => {
      const duration = timer.end();

      expect(duration).toBeGreaterThanOrEqual(0);
      expect(typeof duration).toBe("number");
    });
  });

  describe("Log format", () => {
    test("should create custom log format", () => {
      expect(winston.format.combine).toHaveBeenCalled();
      expect(winston.format.timestamp).toHaveBeenCalledWith({
        format: "YYYY-MM-DD HH:mm:ss.SSS",
      });
      expect(winston.format.errors).toHaveBeenCalledWith({ stack: true });
      expect(winston.format.printf).toHaveBeenCalled();
    });

    test("should format log messages correctly", () => {
      const printfCall = winston.format.printf.mock.calls[0][0];

      const logEntry = {
        timestamp: "2024-01-01 12:00:00.000",
        level: "info",
        message: "Test message",
        service: "test-service",
        taskId: "task-123",
        workflowId: "workflow-456",
        extra: "data",
      };

      const formattedMessage = printfCall(logEntry);

      expect(formattedMessage).toContain("2024-01-01 12:00:00.000");
      expect(formattedMessage).toContain("[INFO]");
      expect(formattedMessage).toContain("[test-service]");
      expect(formattedMessage).toContain("[task:task-123]");
      expect(formattedMessage).toContain("[workflow:workflow-456]");
      expect(formattedMessage).toContain("Test message");
      expect(formattedMessage).toContain('"extra":"data"');
    });

    test("should format minimal log messages", () => {
      const printfCall = winston.format.printf.mock.calls[0][0];

      const logEntry = {
        timestamp: "2024-01-01 12:00:00.000",
        level: "error",
        message: "Error message",
      };

      const formattedMessage = printfCall(logEntry);

      expect(formattedMessage).toBe(
        "2024-01-01 12:00:00.000 [ERROR]: Error message",
      );
    });
  });

  describe("Error scenarios", () => {
    test("should handle logger creation errors gracefully", () => {
      winston.createLogger.mockImplementation(() => {
        throw new Error("Logger creation failed");
      });

      expect(() => {
        require("../utils/logger.js");
      }).toThrow("Logger creation failed");
    });

    test("should handle malformed context objects", () => {
      const malformedContext = {
        toString: () => {
          throw new Error("toString failed");
        },
      };

      expect(() => {
        createContextLogger(malformedContext);
      }).not.toThrow();
    });

    test("should handle circular reference in metadata", () => {
      const circularObj = { prop: "value" };
      circularObj.self = circularObj;

      const logger = createContextLogger({ service: "test" });

      expect(() => {
        logger.info("Test with circular ref", { circular: circularObj });
      }).not.toThrow();
    });
  });

  describe("Performance considerations", () => {
    test("should not create unnecessary objects for basic logging", () => {
      const logger = createContextLogger({ service: "perf-test" });

      const objectsBefore = process.memoryUsage().heapUsed;

      for (let i = 0; i < 100; i++) {
        logger.info(`Message ${i}`);
      }

      const objectsAfter = process.memoryUsage().heapUsed;
      const memoryIncrease = objectsAfter - objectsBefore;

      // Memory increase should be reasonable (less than 1MB for 100 log calls)
      expect(memoryIncrease).toBeLessThan(1024 * 1024);
    });

    test("should handle high-frequency logging", () => {
      const logger = createContextLogger({ service: "high-freq" });

      const start = process.hrtime.bigint();

      for (let i = 0; i < 1000; i++) {
        logger.info(`High frequency message ${i}`, { iteration: i });
      }

      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1000000;

      // 1000 log calls should complete in reasonable time (less than 1 second)
      expect(durationMs).toBeLessThan(1000);
    });
  });
});
