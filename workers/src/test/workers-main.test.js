/**
 * Unit Tests for WorkersMain - Core orchestration class
 */

import WorkersMain from "../index.js";

// Mock all dependencies
jest.mock("../workers/claude-task-worker.js");
jest.mock("../workers/slack-integration-worker.js");
jest.mock("../workers/multi-channel-orchestrator.js");
jest.mock("../workers/sureshot-eloqua-worker.js");
jest.mock("../services/workflow-trigger.js");
jest.mock("../config/index.js", () => ({
  slack: { port: 3000 },
  app: { nodeEnv: "test", logLevel: "info" },
  littlehorse: { apiHost: "localhost", apiPort: 2023 },
}));
jest.mock("../utils/logger.js", () => ({
  createContextLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  }),
}));

// Import mocked classes
import ClaudeTaskWorker from "../workers/claude-task-worker.js";
import SlackIntegrationWorker from "../workers/slack-integration-worker.js";
import MultiChannelOrchestrator from "../workers/multi-channel-orchestrator.js";
import SureshotEloquaWorker from "../workers/sureshot-eloqua-worker.js";
import WorkflowTriggerService from "../services/workflow-trigger.js";

describe("WorkersMain", () => {
  let workersMain;
  let mockWorkers;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup mock implementations
    mockWorkers = {
      claudeWorker: {
        getHealthStatus: jest.fn(() => ({ status: "healthy" })),
        shutdown: jest.fn(() => Promise.resolve()),
      },
      slackWorker: {
        start: jest.fn(() => Promise.resolve()),
        getHealthStatus: jest.fn(() => ({ status: "healthy" })),
        shutdown: jest.fn(() => Promise.resolve()),
      },
      multiChannelOrchestrator: {
        getHealthStatus: jest.fn(() => ({ status: "healthy" })),
        shutdown: jest.fn(() => Promise.resolve()),
      },
      sureshotWorker: {
        getHealthStatus: jest.fn(() => ({ status: "healthy" })),
        shutdown: jest.fn(() => Promise.resolve()),
      },
      workflowTrigger: {
        getHealthStatus: jest.fn(() => ({ status: "healthy" })),
        shutdown: jest.fn(() => Promise.resolve()),
      },
    };

    // Mock constructors
    ClaudeTaskWorker.mockImplementation(() => mockWorkers.claudeWorker);
    SlackIntegrationWorker.mockImplementation(() => mockWorkers.slackWorker);
    MultiChannelOrchestrator.mockImplementation(
      () => mockWorkers.multiChannelOrchestrator,
    );
    SureshotEloquaWorker.mockImplementation(() => mockWorkers.sureshotWorker);
    WorkflowTriggerService.mockImplementation(
      () => mockWorkers.workflowTrigger,
    );

    workersMain = new WorkersMain();
  });

  afterEach(() => {
    // Clear any running timers
    jest.clearAllTimers();
  });

  describe("Constructor", () => {
    test("should initialize all workers", () => {
      expect(ClaudeTaskWorker).toHaveBeenCalledTimes(1);
      expect(SlackIntegrationWorker).toHaveBeenCalledTimes(1);
      expect(MultiChannelOrchestrator).toHaveBeenCalledTimes(1);
      expect(SureshotEloquaWorker).toHaveBeenCalledTimes(1);
      expect(WorkflowTriggerService).toHaveBeenCalledTimes(1);
    });

    test("should set isShuttingDown to false", () => {
      expect(workersMain.isShuttingDown).toBe(false);
    });

    test("should have all worker instances", () => {
      expect(workersMain.claudeWorker).toBeDefined();
      expect(workersMain.slackWorker).toBeDefined();
      expect(workersMain.multiChannelOrchestrator).toBeDefined();
      expect(workersMain.sureshotWorker).toBeDefined();
      expect(workersMain.workflowTrigger).toBeDefined();
    });
  });

  describe("start()", () => {
    test("should start slack worker successfully", async () => {
      await workersMain.start();

      expect(mockWorkers.slackWorker.start).toHaveBeenCalledWith(3000);
    });

    test("should handle startup errors", async () => {
      const mockExit = jest.spyOn(process, "exit").mockImplementation(() => {});
      mockWorkers.slackWorker.start.mockRejectedValue(
        new Error("Startup failed"),
      );

      await workersMain.start();

      expect(mockExit).toHaveBeenCalledWith(1);
      mockExit.mockRestore();
    });
  });

  describe("getHealthStatus()", () => {
    test("should return comprehensive health status", () => {
      const healthStatus = workersMain.getHealthStatus();

      expect(healthStatus).toHaveProperty("status");
      expect(healthStatus).toHaveProperty("timestamp");
      expect(healthStatus).toHaveProperty("workers");
      expect(healthStatus).toHaveProperty("system");
      expect(healthStatus).toHaveProperty("config");

      expect(healthStatus.workers).toHaveProperty("claude");
      expect(healthStatus.workers).toHaveProperty("slack");
      expect(healthStatus.workers).toHaveProperty("multiChannel");
      expect(healthStatus.workers).toHaveProperty("sureshot");
      expect(healthStatus.workers).toHaveProperty("workflowTrigger");

      expect(healthStatus.system).toHaveProperty("nodeVersion");
      expect(healthStatus.system).toHaveProperty("platform");
      expect(healthStatus.system).toHaveProperty("uptime");
      expect(healthStatus.system).toHaveProperty("memoryUsage");
    });

    test("should return healthy status when not shutting down", () => {
      const healthStatus = workersMain.getHealthStatus();
      expect(healthStatus.status).toBe("healthy");
    });

    test("should return shutting_down status when shutting down", () => {
      workersMain.isShuttingDown = true;
      const healthStatus = workersMain.getHealthStatus();
      expect(healthStatus.status).toBe("shutting_down");
    });

    test("should call getHealthStatus on all workers", () => {
      workersMain.getHealthStatus();

      expect(mockWorkers.claudeWorker.getHealthStatus).toHaveBeenCalled();
      expect(mockWorkers.slackWorker.getHealthStatus).toHaveBeenCalled();
      expect(
        mockWorkers.multiChannelOrchestrator.getHealthStatus,
      ).toHaveBeenCalled();
      expect(mockWorkers.sureshotWorker.getHealthStatus).toHaveBeenCalled();
      expect(mockWorkers.workflowTrigger.getHealthStatus).toHaveBeenCalled();
    });
  });

  describe("Shutdown handling", () => {
    let mockExit;

    beforeEach(() => {
      mockExit = jest.spyOn(process, "exit").mockImplementation(() => {});
    });

    afterEach(() => {
      mockExit.mockRestore();
    });

    test("should shutdown all workers gracefully", async () => {
      // Simulate shutdown signal
      process.emit("SIGTERM");

      // Wait for shutdown to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockWorkers.claudeWorker.shutdown).toHaveBeenCalled();
      expect(mockWorkers.slackWorker.shutdown).toHaveBeenCalled();
      expect(mockWorkers.multiChannelOrchestrator.shutdown).toHaveBeenCalled();
      expect(mockWorkers.sureshotWorker.shutdown).toHaveBeenCalled();
      expect(mockWorkers.workflowTrigger.shutdown).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    test("should prevent multiple shutdown attempts", async () => {
      workersMain.isShuttingDown = true;

      process.emit("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockExit).toHaveBeenCalledWith(1);
    });

    test("should handle shutdown errors", async () => {
      mockWorkers.claudeWorker.shutdown.mockRejectedValue(
        new Error("Shutdown failed"),
      );

      process.emit("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockExit).toHaveBeenCalledWith(1);
    });

    test("should handle uncaught exceptions", async () => {
      process.emit("uncaughtException", new Error("Test uncaught exception"));
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockExit).toHaveBeenCalled();
    });

    test("should handle unhandled rejections", async () => {
      process.emit(
        "unhandledRejection",
        new Error("Test unhandled rejection"),
        Promise.resolve(),
      );
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockExit).toHaveBeenCalled();
    });
  });

  describe("Health checks", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test("should setup periodic health checks", () => {
      const logHealthStatusSpy = jest
        .spyOn(workersMain, "logHealthStatus")
        .mockImplementation(() => {});

      // Fast forward 61 seconds
      jest.advanceTimersByTime(61000);

      expect(logHealthStatusSpy).toHaveBeenCalled();
      logHealthStatusSpy.mockRestore();
    });

    test("should not run health checks when shutting down", () => {
      const logHealthStatusSpy = jest
        .spyOn(workersMain, "logHealthStatus")
        .mockImplementation(() => {});
      workersMain.isShuttingDown = true;

      jest.advanceTimersByTime(61000);

      expect(logHealthStatusSpy).not.toHaveBeenCalled();
      logHealthStatusSpy.mockRestore();
    });

    test("should handle health check errors gracefully", () => {
      jest.spyOn(workersMain, "logHealthStatus").mockImplementation(() => {
        throw new Error("Health check failed");
      });

      // Should not throw
      expect(() => {
        jest.advanceTimersByTime(61000);
      }).not.toThrow();
    });
  });

  describe("Integration scenarios", () => {
    test("should handle complete startup and shutdown cycle", async () => {
      const mockExit = jest.spyOn(process, "exit").mockImplementation(() => {});

      // Start
      await workersMain.start();
      expect(mockWorkers.slackWorker.start).toHaveBeenCalled();

      // Check health
      const healthStatus = workersMain.getHealthStatus();
      expect(healthStatus.status).toBe("healthy");

      // Shutdown
      process.emit("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(workersMain.isShuttingDown).toBe(true);
      expect(mockExit).toHaveBeenCalledWith(0);

      mockExit.mockRestore();
    });

    test("should handle startup failure gracefully", async () => {
      const mockExit = jest.spyOn(process, "exit").mockImplementation(() => {});
      mockWorkers.slackWorker.start.mockRejectedValue(
        new Error("Port already in use"),
      );

      await workersMain.start();

      expect(mockExit).toHaveBeenCalledWith(1);
      mockExit.mockRestore();
    });
  });

  describe("Edge cases", () => {
    test("should handle worker health status errors", () => {
      mockWorkers.claudeWorker.getHealthStatus.mockImplementation(() => {
        throw new Error("Health check failed");
      });

      // Should not throw
      expect(() => {
        workersMain.getHealthStatus();
      }).not.toThrow();
    });

    test("should handle missing worker instances", () => {
      workersMain.claudeWorker = null;

      expect(() => {
        workersMain.getHealthStatus();
      }).not.toThrow();
    });
  });
});
