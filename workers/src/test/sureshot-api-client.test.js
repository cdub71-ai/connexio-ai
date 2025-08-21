/**
 * Unit Tests for SureshotApiClient - Critical external API integration
 */

import SureshotApiClient from "../services/sureshot-api-client.js";
import axios from "axios";

// Mock dependencies
jest.mock("axios");
jest.mock("p-retry");
jest.mock("p-queue");
jest.mock("uuid", () => ({
  v4: () => "test-request-id",
}));
jest.mock("../config/index.js", () => ({
  sureshot: {
    baseUrl: "https://api.sureshot.test",
    apiKey: "test-api-key",
    eloquaInstance: "test-instance",
    eloquaUser: "test-user",
    eloquaPassword: "test-password",
    timeout: 30000,
    maxConcurrent: 5,
    intervalCap: 100,
    interval: 60000,
    defaultTimeZone: "UTC",
  },
}));
jest.mock("../utils/logger.js", () => ({
  createContextLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
  createTimer: () => ({
    end: jest.fn(() => 200),
  }),
}));

describe("SureshotApiClient", () => {
  let sureshotClient;
  let mockAxiosInstance;
  let mockQueue;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock axios instance
    mockAxiosInstance = {
      interceptors: {
        request: {
          use: jest.fn(),
        },
        response: {
          use: jest.fn(),
        },
      },
    };

    // Mock axios.create
    axios.create.mockReturnValue(mockAxiosInstance);

    // Mock axios.post for authentication
    axios.post = jest.fn();

    // Mock PQueue
    mockQueue = {
      add: jest.fn((fn, options) => fn()),
      size: 0,
      pending: 0,
      onIdle: jest.fn(() => Promise.resolve()),
    };

    const PQueue = require("p-queue").default;
    PQueue.mockImplementation(() => mockQueue);

    // Mock pRetry to just execute the function
    const pRetry = require("p-retry").default;
    pRetry.mockImplementation((fn, options) => fn(1));

    sureshotClient = new SureshotApiClient();
  });

  describe("Constructor", () => {
    test("should initialize with correct configuration", () => {
      expect(axios.create).toHaveBeenCalledWith({
        baseURL: "https://api.sureshot.test",
        timeout: 30000,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Connexio-AI-Worker/1.0",
        },
      });

      expect(sureshotClient.baseURL).toBe("https://api.sureshot.test");
      expect(sureshotClient.apiKey).toBe("test-api-key");
      expect(sureshotClient.eloquaInstance).toBe("test-instance");
      expect(sureshotClient.isConnected).toBe(false);
      expect(sureshotClient.authToken).toBeNull();
    });

    test("should initialize metrics", () => {
      expect(sureshotClient.metrics).toEqual({
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        rateLimitHits: 0,
        averageResponseTime: 0,
        errorsByType: {},
      });
    });

    test("should setup interceptors", () => {
      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
    });
  });

  describe("Authentication", () => {
    test("should authenticate successfully", async () => {
      const authResponse = {
        data: {
          accessToken: "test-token-123",
          expiresIn: 3600,
        },
      };
      axios.post.mockResolvedValue(authResponse);

      await sureshotClient.authenticate();

      expect(axios.post).toHaveBeenCalledWith(
        "https://api.sureshot.test/auth/login",
        {
          apiKey: "test-api-key",
          eloquaInstance: "test-instance",
          eloquaUser: "test-user",
          eloquaPassword: "test-password",
        },
        {
          timeout: 10000,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      expect(sureshotClient.authToken).toBe("test-token-123");
      expect(sureshotClient.isConnected).toBe(true);
      expect(sureshotClient.authExpiry).toBeGreaterThan(Date.now());
    });

    test("should handle authentication failure", async () => {
      const authError = new Error("Invalid credentials");
      axios.post.mockRejectedValue(authError);

      await expect(sureshotClient.authenticate()).rejects.toThrow(
        "Authentication failed",
      );

      expect(sureshotClient.isConnected).toBe(false);
      expect(sureshotClient.authToken).toBeNull();
    });

    test("should not authenticate if token is still valid", async () => {
      sureshotClient.authToken = "valid-token";
      sureshotClient.authExpiry = Date.now() + 3600000; // 1 hour from now

      await sureshotClient.ensureAuthenticated();

      expect(axios.post).not.toHaveBeenCalled();
    });

    test("should re-authenticate if token expired", async () => {
      sureshotClient.authToken = "expired-token";
      sureshotClient.authExpiry = Date.now() - 1000; // 1 second ago

      const authResponse = {
        data: {
          accessToken: "new-token-456",
          expiresIn: 3600,
        },
      };
      axios.post.mockResolvedValue(authResponse);

      await sureshotClient.ensureAuthenticated();

      expect(axios.post).toHaveBeenCalled();
      expect(sureshotClient.authToken).toBe("new-token-456");
    });
  });

  describe("Request execution", () => {
    beforeEach(() => {
      // Mock successful authentication
      sureshotClient.authToken = "valid-token";
      sureshotClient.authExpiry = Date.now() + 3600000;
      sureshotClient.isConnected = true;
    });

    test("should execute request successfully", async () => {
      const mockResponse = { data: { id: "test-id", name: "Test Campaign" } };
      mockAxiosInstance.mockResolvedValue(mockResponse);
      sureshotClient.client = mockAxiosInstance;

      const result = await sureshotClient.makeRequest(
        "POST",
        "/api/v2/campaigns",
        { name: "Test" },
      );

      expect(mockQueue.add).toHaveBeenCalled();
      expect(result).toEqual({ id: "test-id", name: "Test Campaign" });
    });

    test("should handle rate limiting", async () => {
      const rateLimitError = new Error("Rate limit exceeded");
      rateLimitError.response = {
        status: 429,
        headers: { "retry-after": "5" },
      };

      mockAxiosInstance
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce({ data: { success: true } });

      sureshotClient.client = mockAxiosInstance;

      const result = await sureshotClient.makeRequest("GET", "/api/v2/test");

      expect(result).toEqual({ success: true });
      expect(sureshotClient.metrics.rateLimitHits).toBe(1);
    });

    test("should handle 401 and re-authenticate", async () => {
      const authError = new Error("Unauthorized");
      authError.response = { status: 401 };

      const authResponse = {
        data: {
          accessToken: "new-auth-token",
          expiresIn: 3600,
        },
      };

      mockAxiosInstance
        .mockRejectedValueOnce(authError)
        .mockResolvedValueOnce({ data: { success: true } });

      axios.post.mockResolvedValue(authResponse);
      sureshotClient.client = mockAxiosInstance;

      const result = await sureshotClient.makeRequest("GET", "/api/v2/test");

      expect(axios.post).toHaveBeenCalled();
      expect(sureshotClient.authToken).toBe("new-auth-token");
      expect(result).toEqual({ success: true });
    });

    test("should not retry client errors (400-499)", async () => {
      const clientError = new Error("Bad Request");
      clientError.response = { status: 400 };
      clientError.shouldRetry = false;

      mockAxiosInstance.mockRejectedValue(clientError);
      sureshotClient.client = mockAxiosInstance;

      await expect(
        sureshotClient.makeRequest("POST", "/api/v2/test", { invalid: "data" }),
      ).rejects.toThrow("Bad Request");
    });

    test("should retry server errors (500+)", async () => {
      const serverError = new Error("Internal Server Error");
      serverError.response = { status: 500 };

      mockAxiosInstance
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce({ data: { success: true } });

      sureshotClient.client = mockAxiosInstance;

      const result = await sureshotClient.makeRequest("GET", "/api/v2/test");
      expect(result).toEqual({ success: true });
    });
  });

  describe("Email campaign operations", () => {
    beforeEach(() => {
      sureshotClient.authToken = "valid-token";
      sureshotClient.authExpiry = Date.now() + 3600000;
      sureshotClient.client = mockAxiosInstance;
    });

    test("should create email campaign", async () => {
      const campaignData = {
        name: "Test Campaign",
        description: "Test Description",
        folderId: "folder123",
        email: {
          name: "Test Email",
          subject: "Test Subject",
          htmlContent: "<html>Test</html>",
          textContent: "Test content",
          fromName: "Test Sender",
          fromAddress: "test@example.com",
          replyToAddress: "reply@example.com",
          templateId: "template123",
        },
        audienceListIds: ["list1", "list2"],
        audienceSegmentIds: ["segment1"],
      };

      const mockResponse = {
        data: {
          id: "campaign123",
          eloquaId: "eloqua456",
          name: "Test Campaign",
        },
      };

      mockAxiosInstance.mockResolvedValue(mockResponse);

      const result = await sureshotClient.createEmailCampaign(campaignData);

      expect(mockQueue.add).toHaveBeenCalled();
      expect(result.id).toBe("campaign123");
      expect(result.eloquaId).toBe("eloqua456");
    });

    test("should get campaign status", async () => {
      const mockResponse = {
        data: {
          id: "campaign123",
          status: "active",
          sentCount: 1500,
          deliveredCount: 1450,
          openCount: 725,
          clickCount: 145,
        },
      };

      mockAxiosInstance.mockResolvedValue(mockResponse);

      const result = await sureshotClient.getCampaignStatus("campaign123");

      expect(result.status).toBe("active");
      expect(result.sentCount).toBe(1500);
    });

    test("should get campaign metrics", async () => {
      const mockResponse = {
        data: {
          sentCount: 1500,
          deliveredCount: 1450,
          openCount: 725,
          clickCount: 145,
          bounceCount: 50,
          unsubscribeCount: 5,
          openRate: 0.5,
          clickRate: 0.1,
          bounceRate: 0.033,
        },
      };

      mockAxiosInstance.mockResolvedValue(mockResponse);

      const result = await sureshotClient.getCampaignMetrics("campaign123");

      expect(result.openRate).toBe(0.5);
      expect(result.clickRate).toBe(0.1);
    });

    test("should execute campaign immediately", async () => {
      const mockResponse = {
        data: {
          executionId: "exec123",
          status: "running",
          startTime: "2024-01-01T10:00:00Z",
        },
      };

      mockAxiosInstance.mockResolvedValue(mockResponse);

      const result =
        await sureshotClient.executeCampaignImmediate("campaign123");

      expect(result.executionId).toBe("exec123");
      expect(result.status).toBe("running");
    });

    test("should schedule campaign", async () => {
      const scheduledTime = "2024-01-02T14:00:00Z";
      const mockResponse = {
        data: {
          scheduledTime,
          status: "scheduled",
          campaignId: "campaign123",
        },
      };

      mockAxiosInstance.mockResolvedValue(mockResponse);

      const result = await sureshotClient.scheduleCampaign(
        "campaign123",
        scheduledTime,
      );

      expect(result.scheduledTime).toBe(scheduledTime);
      expect(result.status).toBe("scheduled");
    });
  });

  describe("Contact list operations", () => {
    beforeEach(() => {
      sureshotClient.authToken = "valid-token";
      sureshotClient.authExpiry = Date.now() + 3600000;
      sureshotClient.client = mockAxiosInstance;
    });

    test("should create contact list", async () => {
      const listData = {
        name: "Test List",
        description: "Test Description",
        folderId: "folder123",
        dataSource: "manual",
        criteria: { country: "US" },
        contacts: [
          { email: "user1@test.com", firstName: "User", lastName: "One" },
          { email: "user2@test.com", firstName: "User", lastName: "Two" },
        ],
      };

      const mockResponse = {
        data: {
          id: "list123",
          contactCount: 2,
          name: "Test List",
        },
      };

      mockAxiosInstance.mockResolvedValue(mockResponse);

      const result = await sureshotClient.createContactList(listData);

      expect(result.id).toBe("list123");
      expect(result.contactCount).toBe(2);
    });

    test("should create contact segment", async () => {
      const segmentData = {
        name: "High Value Customers",
        description: "Customers with high lifetime value",
        folderId: "folder123",
        criteria: { totalSpent: { gte: 1000 } },
        sourceListIds: ["list1", "list2"],
      };

      const mockResponse = {
        data: {
          id: "segment123",
          contactCount: 250,
          name: "High Value Customers",
        },
      };

      mockAxiosInstance.mockResolvedValue(mockResponse);

      const result = await sureshotClient.createContactSegment(segmentData);

      expect(result.id).toBe("segment123");
      expect(result.contactCount).toBe(250);
    });

    test("should update contact list", async () => {
      const updates = {
        name: "Updated List Name",
        description: "Updated description",
      };

      const mockResponse = {
        data: {
          id: "list123",
          contactCount: 150,
          name: "Updated List Name",
        },
      };

      mockAxiosInstance.mockResolvedValue(mockResponse);

      const result = await sureshotClient.updateContactList("list123", updates);

      expect(result.name).toBe("Updated List Name");
      expect(result.contactCount).toBe(150);
    });

    test("should delete contact list", async () => {
      mockAxiosInstance.mockResolvedValue({});

      const result = await sureshotClient.deleteContactList("list123");

      expect(result.success).toBe(true);
      expect(result.listId).toBe("list123");
    });

    test("should sync contact list", async () => {
      const syncOptions = {
        syncMode: "incremental",
        dataSource: "crm",
        mapping: { email: "Email", firstName: "FirstName" },
      };

      const mockResponse = {
        data: {
          recordsProcessed: 1000,
          recordsAdded: 50,
          recordsUpdated: 25,
          recordsSkipped: 925,
          errors: [],
        },
      };

      mockAxiosInstance.mockResolvedValue(mockResponse);

      const result = await sureshotClient.syncContactList(
        "list123",
        syncOptions,
      );

      expect(result.recordsProcessed).toBe(1000);
      expect(result.recordsAdded).toBe(50);
      expect(result.recordsUpdated).toBe(25);
    });
  });

  describe("Error handling and enhancement", () => {
    test("should enhance network errors", () => {
      const networkError = new Error("Connection reset");
      networkError.code = "ECONNRESET";

      const enhanced = sureshotClient._enhanceError(networkError);

      expect(enhanced.code).toBe("NETWORK_ERROR");
      expect(enhanced.originalError).toBe(networkError);
    });

    test("should enhance authentication errors", () => {
      const authError = new Error("Unauthorized");
      authError.response = { status: 401 };

      const enhanced = sureshotClient._enhanceError(authError);

      expect(enhanced.code).toBe("AUTHENTICATION_ERROR");
      expect(enhanced.statusCode).toBe(401);
    });

    test("should enhance rate limit errors", () => {
      const rateLimitError = new Error("Rate limit exceeded");
      rateLimitError.response = { status: 429 };

      const enhanced = sureshotClient._enhanceError(rateLimitError);

      expect(enhanced.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(enhanced.statusCode).toBe(429);
    });

    test("should enhance validation errors", () => {
      const validationError = new Error("Bad request");
      validationError.response = {
        status: 400,
        data: { errors: ["Invalid email"] },
      };

      const enhanced = sureshotClient._enhanceError(validationError);

      expect(enhanced.code).toBe("VALIDATION_ERROR");
      expect(enhanced.statusCode).toBe(400);
      expect(enhanced.responseData).toEqual({ errors: ["Invalid email"] });
    });

    test("should enhance server errors", () => {
      const serverError = new Error("Internal server error");
      serverError.response = { status: 500 };

      const enhanced = sureshotClient._enhanceError(serverError);

      expect(enhanced.code).toBe("ELOQUA_API_ERROR");
      expect(enhanced.statusCode).toBe(500);
    });

    test("should track error counts by type", () => {
      const error1 = new Error("Network error");
      error1.code = "ECONNRESET";

      const error2 = new Error("Another network error");
      error2.code = "ENOTFOUND";

      sureshotClient._enhanceError(error1);
      sureshotClient._enhanceError(error2);

      expect(sureshotClient.metrics.errorsByType.NETWORK_ERROR).toBe(2);
    });
  });

  describe("Metrics tracking", () => {
    test("should update metrics on successful request", () => {
      sureshotClient._updateMetrics(true, 150);

      expect(sureshotClient.metrics.totalRequests).toBe(1);
      expect(sureshotClient.metrics.successfulRequests).toBe(1);
      expect(sureshotClient.metrics.failedRequests).toBe(0);
      expect(sureshotClient.metrics.averageResponseTime).toBe(150);
    });

    test("should update metrics on failed request", () => {
      sureshotClient._updateMetrics(false, 300);

      expect(sureshotClient.metrics.totalRequests).toBe(1);
      expect(sureshotClient.metrics.successfulRequests).toBe(0);
      expect(sureshotClient.metrics.failedRequests).toBe(1);
      expect(sureshotClient.metrics.averageResponseTime).toBe(300);
    });

    test("should calculate rolling average correctly", () => {
      sureshotClient._updateMetrics(true, 100);
      sureshotClient._updateMetrics(true, 200);
      sureshotClient._updateMetrics(false, 300);

      expect(sureshotClient.metrics.totalRequests).toBe(3);
      expect(sureshotClient.metrics.successfulRequests).toBe(2);
      expect(sureshotClient.metrics.failedRequests).toBe(1);
      expect(sureshotClient.metrics.averageResponseTime).toBe(200); // (100 + 200 + 300) / 3
    });
  });

  describe("Health status", () => {
    test("should return comprehensive health status", () => {
      sureshotClient.authToken = "valid-token";
      sureshotClient.authExpiry = Date.now() + 3600000;
      sureshotClient.isConnected = true;
      sureshotClient._updateMetrics(true, 150);

      const health = sureshotClient.getHealthStatus();

      expect(health.connected).toBe(true);
      expect(health.baseURL).toBe("https://api.sureshot.test");
      expect(health.eloquaInstance).toBe("test-instance");
      expect(health.metrics.totalRequests).toBe(1);
      expect(health.queueStatus.size).toBe(0);
      expect(health.authentication.hasToken).toBe(true);
      expect(health.authentication.isExpired).toBe(false);
    });

    test("should indicate disconnected status", () => {
      sureshotClient.isConnected = false;
      sureshotClient.authToken = null;

      const health = sureshotClient.getHealthStatus();

      expect(health.connected).toBe(false);
      expect(health.authentication.hasToken).toBe(false);
      expect(health.authentication.isExpired).toBe(true);
    });
  });

  describe("Connection status", () => {
    test("should return true when connected and token valid", () => {
      sureshotClient.isConnected = true;
      sureshotClient.authToken = "valid-token";
      sureshotClient.authExpiry = Date.now() + 3600000;

      expect(sureshotClient.isConnected()).toBe(true);
    });

    test("should return false when not connected", () => {
      sureshotClient.isConnected = false;

      expect(sureshotClient.isConnected()).toBe(false);
    });

    test("should return false when token expired", () => {
      sureshotClient.isConnected = true;
      sureshotClient.authToken = "expired-token";
      sureshotClient.authExpiry = Date.now() - 1000;

      expect(sureshotClient.isConnected()).toBe(false);
    });
  });

  describe("Shutdown", () => {
    test("should shutdown gracefully", async () => {
      sureshotClient.authToken = "token";
      sureshotClient.authExpiry = Date.now() + 3600000;
      sureshotClient.isConnected = true;
      sureshotClient._updateMetrics(true, 150);
      sureshotClient._updateMetrics(false, 200);

      await sureshotClient.shutdown();

      expect(mockQueue.onIdle).toHaveBeenCalled();
      expect(sureshotClient.authToken).toBeNull();
      expect(sureshotClient.authExpiry).toBeNull();
      expect(sureshotClient.isConnected).toBe(false);
    });

    test("should handle shutdown errors", async () => {
      mockQueue.onIdle.mockRejectedValue(new Error("Queue cleanup failed"));

      await expect(sureshotClient.shutdown()).resolves.not.toThrow();
    });
  });

  describe("Advanced campaign features", () => {
    beforeEach(() => {
      sureshotClient.authToken = "valid-token";
      sureshotClient.authExpiry = Date.now() + 3600000;
      sureshotClient.client = mockAxiosInstance;
    });

    test("should setup triggered campaign", async () => {
      const triggers = [
        {
          type: "contact_created",
          delay: "1 hour",
          conditions: { source: "website" },
        },
        {
          type: "contact_updated",
          delay: "0",
          conditions: { field: "status", value: "lead" },
        },
      ];

      const mockResponse = {
        data: {
          activeTriggers: 2,
          status: "active",
          campaignId: "campaign123",
        },
      };

      mockAxiosInstance.mockResolvedValue(mockResponse);

      const result = await sureshotClient.setupTriggeredCampaign(
        "campaign123",
        triggers,
      );

      expect(result.activeTriggers).toBe(2);
      expect(result.status).toBe("active");
    });

    test("should update campaign settings", async () => {
      const settings = {
        sendTime: "09:00",
        timeZone: "America/New_York",
        maxSendRate: 1000,
        enableClickTracking: true,
        enableOpenTracking: true,
      };

      const mockResponse = {
        data: {
          campaignId: "campaign123",
          settings: settings,
          updatedAt: "2024-01-01T10:00:00Z",
        },
      };

      mockAxiosInstance.mockResolvedValue(mockResponse);

      const result = await sureshotClient.updateCampaignSettings(
        "campaign123",
        settings,
      );

      expect(result.campaignId).toBe("campaign123");
      expect(result.settings.enableClickTracking).toBe(true);
    });

    test("should get campaign execution history", async () => {
      const mockResponse = {
        data: {
          executions: [
            {
              id: "exec1",
              startTime: "2024-01-01T09:00:00Z",
              endTime: "2024-01-01T09:15:00Z",
              status: "completed",
              sentCount: 1000,
            },
            {
              id: "exec2",
              startTime: "2024-01-02T09:00:00Z",
              endTime: null,
              status: "running",
              sentCount: 500,
            },
          ],
        },
      };

      mockAxiosInstance.mockResolvedValue(mockResponse);

      const result =
        await sureshotClient.getCampaignExecutionHistory("campaign123");

      expect(result.executions).toHaveLength(2);
      expect(result.executions[0].status).toBe("completed");
      expect(result.executions[1].status).toBe("running");
    });
  });
});
