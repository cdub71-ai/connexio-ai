/**
 * Unit Tests for ClaudeApiService - Critical API service for natural language processing
 */

import ClaudeApiService from '../services/claude-api.js';
import Anthropic from '@anthropic-ai/sdk';

// Mock dependencies
jest.mock('@anthropic-ai/sdk');
jest.mock('p-retry');
jest.mock('p-queue');
jest.mock('uuid', () => ({
  v4: () => 'test-uuid-123'
}));
jest.mock('../config/index.js', () => ({
  anthropic: {
    apiKey: 'test-api-key',
    baseUrl: 'https://api.anthropic.com',
    timeout: 30000,
    model: 'claude-3-sonnet-20240229',
    maxTokens: 4000,
    temperature: 0.1
  },
  rateLimit: {
    maxConcurrent: 5,
    intervalCap: 100,
    interval: 60000,
    maxRetries: 3,
    retryDelay: 1000
  }
}));
jest.mock('../utils/logger.js', () => ({
  createContextLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    taskComplete: jest.fn(),
    taskError: jest.fn(),
    apiCall: jest.fn(),
    rateLimitHit: jest.fn(),
    retryAttempt: jest.fn()
  }),
  createTimer: () => ({
    end: jest.fn(() => 150)
  }),
  logError: jest.fn()
}));

describe('ClaudeApiService', () => {
  let claudeService;
  let mockAnthropicClient;
  let mockQueue;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock Anthropic client
    mockAnthropicClient = {
      messages: {
        create: jest.fn()
      }
    };
    Anthropic.mockImplementation(() => mockAnthropicClient);

    // Mock PQueue
    mockQueue = {
      add: jest.fn((fn, options) => fn()),
      size: 0,
      pending: 0,
      onIdle: jest.fn(() => Promise.resolve())
    };
    
    const PQueue = require('p-queue').default;
    PQueue.mockImplementation(() => mockQueue);

    // Mock pRetry to just execute the function
    const pRetry = require('p-retry').default;
    pRetry.mockImplementation((fn, options) => fn(1));

    claudeService = new ClaudeApiService();
  });

  describe('Constructor', () => {
    test('should initialize with correct configuration', () => {
      expect(Anthropic).toHaveBeenCalledWith({
        apiKey: 'test-api-key',
        baseURL: 'https://api.anthropic.com',
        timeout: 30000
      });

      expect(claudeService.metrics).toEqual({
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        totalTokensUsed: 0,
        averageResponseTime: 0,
        rateLimitHits: 0
      });
    });
  });

  describe('parseMarketingCommand()', () => {
    const mockCommand = 'Create email campaign for summer sale';
    const mockContext = {
      userId: 'user123',
      channelId: 'channel456',
      workflowId: 'workflow789'
    };

    test('should parse marketing command successfully', async () => {
      const mockResponse = {
        content: [{
          text: JSON.stringify({
            intent: 'create_email_campaign',
            confidence: 0.9,
            parameters: {
              name: 'Summer Sale Campaign',
              type: 'email',
              subject: 'Summer Sale - Up to 50% Off!',
              channels: ['email'],
              priority: 'high'
            },
            extractedEntities: {
              dates: [],
              percentages: ['50%'],
              promoCodes: [],
              audiences: [],
              channels: ['email']
            },
            summary: 'Create email campaign for summer sale'
          })
        }],
        usage: {
          total_tokens: 150,
          input_tokens: 100,
          output_tokens: 50
        }
      };

      mockAnthropicClient.messages.create.mockResolvedValue(mockResponse);

      const result = await claudeService.parseMarketingCommand(mockCommand, mockContext);

      expect(result.intent).toBe('create_email_campaign');
      expect(result.confidence).toBe(0.9);
      expect(result.parameters.name).toBe('Summer Sale Campaign');
      expect(result.metadata).toBeDefined();
      expect(result.metadata.requestId).toBe('test-uuid-123');
      expect(result.metadata.originalCommand).toBe(mockCommand);
    });

    test('should handle malformed JSON response with fallback', async () => {
      const mockResponse = {
        content: [{
          text: 'This is not valid JSON response'
        }],
        usage: {
          total_tokens: 100
        }
      };

      mockAnthropicClient.messages.create.mockResolvedValue(mockResponse);

      const result = await claudeService.parseMarketingCommand(mockCommand, mockContext);

      expect(result.intent).toBe('create_email_campaign'); // Fallback should detect email
      expect(result.confidence).toBe(0.6); // Fallback confidence
      expect(result.parameters.type).toBe('email');
    });

    test('should enhance response with missing fields', async () => {
      const mockResponse = {
        content: [{
          text: JSON.stringify({
            intent: 'create_email_campaign'
            // Missing confidence, parameters, etc.
          })
        }],
        usage: { total_tokens: 100 }
      };

      mockAnthropicClient.messages.create.mockResolvedValue(mockResponse);

      const result = await claudeService.parseMarketingCommand(mockCommand, mockContext);

      expect(result.confidence).toBe(0.7); // Default confidence
      expect(result.parameters).toBeDefined();
      expect(result.parameters.type).toBe('email');
      expect(result.parameters.channels).toEqual(['email']);
      expect(result.summary).toBeDefined();
    });

    test('should handle API errors gracefully', async () => {
      const apiError = new Error('API request failed');
      apiError.status = 500;
      mockAnthropicClient.messages.create.mockRejectedValue(apiError);

      await expect(claudeService.parseMarketingCommand(mockCommand, mockContext))
        .rejects.toThrow('API request failed');

      expect(claudeService.metrics.failedRequests).toBe(1);
      expect(claudeService.metrics.successfulRequests).toBe(0);
    });

    test('should handle rate limiting', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      rateLimitError.status = 429;
      rateLimitError.headers = { 'retry-after': '5' };
      
      mockAnthropicClient.messages.create
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce({
          content: [{ text: '{"intent": "help", "confidence": 0.8}' }],
          usage: { total_tokens: 50 }
        });

      const result = await claudeService.parseMarketingCommand(mockCommand, mockContext);

      expect(result.intent).toBe('help');
      expect(claudeService.metrics.rateLimitHits).toBe(1);
    });

    test('should extract campaign ID from status commands', async () => {
      const statusCommand = 'Check status of campaign CAMP-EMAIL-12345';
      const mockResponse = {
        content: [{
          text: JSON.stringify({
            intent: 'get_campaign_status',
            confidence: 0.95
          })
        }],
        usage: { total_tokens: 75 }
      };

      mockAnthropicClient.messages.create.mockResolvedValue(mockResponse);

      const result = await claudeService.parseMarketingCommand(statusCommand, mockContext);

      expect(result.intent).toBe('get_campaign_status');
      expect(result.parameters.campaignId).toBe('CAMP-EMAIL-12345');
    });
  });

  describe('System prompt building', () => {
    test('should build comprehensive system prompt', () => {
      const systemPrompt = claudeService._buildSystemPrompt();

      expect(systemPrompt).toContain('Connexio.ai');
      expect(systemPrompt).toContain('Marketing Operations Agent');
      expect(systemPrompt).toContain('create_email_campaign');
      expect(systemPrompt).toContain('create_sms_campaign');
      expect(systemPrompt).toContain('confidence');
      expect(systemPrompt).toContain('all_subscribers');
      expect(systemPrompt).toContain('immediate');
    });
  });

  describe('User prompt building', () => {
    test('should build user prompt with context', () => {
      const command = 'Create SMS campaign';
      const context = {
        userId: 'user123',
        channelId: 'channel456',
        teamDomain: 'acme.com',
        previousCommands: ['help', 'list campaigns', 'status']
      };

      const userPrompt = claudeService._buildUserPrompt(command, context);

      expect(userPrompt).toContain(command);
      expect(userPrompt).toContain('user123');
      expect(userPrompt).toContain('channel456');
      expect(userPrompt).toContain('acme.com');
      expect(userPrompt).toContain('status');
    });

    test('should handle minimal context', () => {
      const command = 'Help';
      const context = {};

      const userPrompt = claudeService._buildUserPrompt(command, context);

      expect(userPrompt).toContain(command);
      expect(userPrompt).toContain('JSON object');
    });
  });

  describe('Fallback response creation', () => {
    test('should create email campaign fallback', () => {
      const command = 'send email campaign to customers';
      const context = {};

      const fallback = claudeService._createFallbackResponse(command, context);

      expect(fallback.intent).toBe('create_email_campaign');
      expect(fallback.parameters.type).toBe('email');
      expect(fallback.parameters.channels).toEqual(['email']);
      expect(fallback.confidence).toBe(0.6);
    });

    test('should create SMS campaign fallback', () => {
      const command = 'urgent sms campaign needed';
      const context = {};

      const fallback = claudeService._createFallbackResponse(command, context);

      expect(fallback.intent).toBe('create_sms_campaign');
      expect(fallback.parameters.type).toBe('sms');
      expect(fallback.parameters.priority).toBe('high');
      expect(fallback.parameters.channels).toEqual(['sms']);
    });

    test('should create status check fallback', () => {
      const command = 'check status of my campaign';
      const context = {};

      const fallback = claudeService._createFallbackResponse(command, context);

      expect(fallback.intent).toBe('get_campaign_status');
    });

    test('should create help fallback', () => {
      const command = 'what can you do';
      const context = {};

      const fallback = claudeService._createFallbackResponse(command, context);

      expect(fallback.intent).toBe('help');
    });
  });

  describe('Intent inference', () => {
    test('should infer email campaign intent', () => {
      expect(claudeService._inferIntent('create email newsletter')).toBe('create_email_campaign');
      expect(claudeService._inferIntent('send email to customers')).toBe('create_email_campaign');
    });

    test('should infer SMS campaign intent', () => {
      expect(claudeService._inferIntent('send sms to users')).toBe('create_sms_campaign');
      expect(claudeService._inferIntent('text message campaign')).toBe('create_sms_campaign');
    });

    test('should infer status check intent', () => {
      expect(claudeService._inferIntent('check campaign status')).toBe('get_campaign_status');
      expect(claudeService._inferIntent('show me campaign progress')).toBe('get_campaign_status');
    });

    test('should infer help intent', () => {
      expect(claudeService._inferIntent('help me')).toBe('help');
      expect(claudeService._inferIntent('what can you do')).toBe('help');
    });
  });

  describe('Priority handling', () => {
    test('should set high priority for urgent contexts', () => {
      const context = { priority: 'high' };
      const priority = claudeService._getPriority(context);
      expect(priority).toBe(10);
    });

    test('should set high priority for urgent channels', () => {
      const context = { channelId: 'urgent-marketing' };
      const priority = claudeService._getPriority(context);
      expect(priority).toBe(10);
    });

    test('should set medium priority for admin users', () => {
      const context = { userId: 'admin-john' };
      const priority = claudeService._getPriority(context);
      expect(priority).toBe(5);
    });

    test('should set default priority for normal users', () => {
      const context = { userId: 'normal-user' };
      const priority = claudeService._getPriority(context);
      expect(priority).toBe(0);
    });
  });

  describe('Metrics tracking', () => {
    test('should update metrics on success', () => {
      claudeService._updateMetrics(true, 150, 100);

      expect(claudeService.metrics.totalRequests).toBe(1);
      expect(claudeService.metrics.successfulRequests).toBe(1);
      expect(claudeService.metrics.failedRequests).toBe(0);
      expect(claudeService.metrics.totalTokensUsed).toBe(100);
      expect(claudeService.metrics.averageResponseTime).toBe(150);
    });

    test('should update metrics on failure', () => {
      claudeService._updateMetrics(false, 200, 0);

      expect(claudeService.metrics.totalRequests).toBe(1);
      expect(claudeService.metrics.successfulRequests).toBe(0);
      expect(claudeService.metrics.failedRequests).toBe(1);
      expect(claudeService.metrics.totalTokensUsed).toBe(0);
      expect(claudeService.metrics.averageResponseTime).toBe(200);
    });

    test('should calculate rolling average correctly', () => {
      claudeService._updateMetrics(true, 100, 50);
      claudeService._updateMetrics(true, 200, 75);

      expect(claudeService.metrics.totalRequests).toBe(2);
      expect(claudeService.metrics.averageResponseTime).toBe(150);
      expect(claudeService.metrics.totalTokensUsed).toBe(125);
    });
  });

  describe('Error enhancement', () => {
    test('should enhance error with context', () => {
      const originalError = new Error('API error');
      originalError.status = 400;
      originalError.code = 'BAD_REQUEST';

      const enhanced = claudeService._enhanceError(
        originalError,
        'req-123',
        'test command',
        { userId: 'user123' }
      );

      expect(enhanced.requestId).toBe('req-123');
      expect(enhanced.command).toBe('test command');
      expect(enhanced.userId).toBe('user123');
      expect(enhanced.statusCode).toBe(400);
      expect(enhanced.originalError).toBe(originalError);
    });

    test('should truncate long commands', () => {
      const longCommand = 'a'.repeat(200);
      const enhanced = claudeService._enhanceError(
        new Error('test'),
        'req-123',
        longCommand,
        {}
      );

      expect(enhanced.command).toHaveLength(100);
    });
  });

  describe('Health metrics', () => {
    test('should return comprehensive health metrics', () => {
      claudeService._updateMetrics(true, 150, 100);
      claudeService._updateMetrics(false, 200, 0);

      const health = claudeService.getHealthMetrics();

      expect(health.totalRequests).toBe(2);
      expect(health.successfulRequests).toBe(1);
      expect(health.failedRequests).toBe(1);
      expect(health.successRate).toBe(50);
      expect(health.averageTokensPerRequest).toBe(50);
      expect(health.queueSize).toBe(0);
      expect(health.queuePending).toBe(0);
    });

    test('should handle zero requests', () => {
      const health = claudeService.getHealthMetrics();

      expect(health.successRate).toBe(0);
      expect(health.averageTokensPerRequest).toBe(0);
    });
  });

  describe('Shutdown', () => {
    test('should shutdown gracefully', async () => {
      await claudeService.shutdown();
      expect(mockQueue.onIdle).toHaveBeenCalled();
    });
  });

  describe('Edge cases and error scenarios', () => {
    test('should handle empty Claude response', async () => {
      const mockResponse = {
        content: [],
        usage: { total_tokens: 0 }
      };

      mockAnthropicClient.messages.create.mockResolvedValue(mockResponse);

      await expect(claudeService.parseMarketingCommand('test', {}))
        .rejects.toThrow('Empty response from Claude API');
    });

    test('should handle null content in response', async () => {
      const mockResponse = {
        content: [{ text: null }],
        usage: { total_tokens: 0 }
      };

      mockAnthropicClient.messages.create.mockResolvedValue(mockResponse);

      await expect(claudeService.parseMarketingCommand('test', {}))
        .rejects.toThrow('Empty response from Claude API');
    });

    test('should handle non-retryable errors', async () => {
      const clientError = new Error('Bad request');
      clientError.status = 400;
      clientError.shouldRetry = false;
      
      mockAnthropicClient.messages.create.mockRejectedValue(clientError);

      await expect(claudeService.parseMarketingCommand('test', {}))
        .rejects.toThrow('Bad request');
    });

    test('should generate summary for unknown intent', () => {
      const response = {
        intent: 'unknown_action',
        parameters: { name: 'Test' }
      };

      const summary = claudeService._generateSummary(response);
      expect(summary).toBe('Execute marketing action: unknown_action');
    });
  });
});