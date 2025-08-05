import { jest } from '@jest/globals';
import crypto from 'crypto';
import SlackIntegrationWorker from '../workers/slack-integration-worker.js';
import config from '../config/index.js';

// Mock dependencies
jest.mock('../config/index.js');
jest.mock('@slack/bolt');
jest.mock('../utils/logger.js');

describe('SlackIntegrationWorker', () => {
  let worker;
  let mockWebClient;
  let mockApp;

  beforeEach(() => {
    // Mock config
    config.slack = {
      botToken: 'xoxb-test-token',
      signingSecret: 'test-signing-secret',
      allowedTeams: ['T1234567890'],
      port: 3000,
    };

    // Mock Slack Web API client
    mockWebClient = {
      team: {
        info: jest.fn().mockResolvedValue({
          team: {
            id: 'T1234567890',
            name: 'Test Team',
            domain: 'test-team',
          },
        }),
      },
      chat: {
        postMessage: jest.fn().mockResolvedValue({
          ts: '1234567890.123456',
          channel: 'C1234567890',
        }),
      },
    };

    // Mock Slack App
    mockApp = {
      command: jest.fn(),
      action: jest.fn(),
      event: jest.fn(),
      error: jest.fn(),
      start: jest.fn().mockResolvedValue(),
      stop: jest.fn().mockResolvedValue(),
    };

    worker = new SlackIntegrationWorker();
    worker.webClient = mockWebClient;
    worker.app = mockApp;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('processSlackWebhook', () => {
    test('should process valid webhook payload', async () => {
      const webhookPayload = {
        type: 'event_callback',
        team_id: 'T1234567890',
        event: {
          type: 'app_mention',
          user: 'U1234567890',
          channel: 'C1234567890',
          text: '<@U0BOTUSER> help',
          ts: '1234567890.123456',
        },
        headers: {
          'x-slack-signature': 'v0=valid-signature',
          'x-slack-request-timestamp': Math.floor(Date.now() / 1000).toString(),
        },
        rawBody: JSON.stringify({
          type: 'event_callback',
          team_id: 'T1234567890',
        }),
      };

      // Mock signature verification
      jest.spyOn(worker, 'verifySlackSignature').mockReturnValue(true);
      jest.spyOn(worker, 'authenticateSlackRequest').mockResolvedValue({
        valid: true,
        teamId: 'T1234567890',
        teamName: 'Test Team',
      });

      const result = await worker.processSlackWebhook(
        webhookPayload,
        'test-workflow-id'
      );

      expect(result.success).toBe(true);
      expect(result.eventType).toBe('event_callback');
      expect(worker.verifySlackSignature).toHaveBeenCalled();
    });

    test('should reject invalid signature', async () => {
      const webhookPayload = {
        type: 'event_callback',
        headers: {
          'x-slack-signature': 'v0=invalid-signature',
          'x-slack-request-timestamp': Math.floor(Date.now() / 1000).toString(),
        },
        rawBody: 'test-body',
      };

      jest.spyOn(worker, 'verifySlackSignature').mockReturnValue(false);

      const result = await worker.processSlackWebhook(
        webhookPayload,
        'test-workflow-id'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid Slack webhook signature');
    });

    test('should handle URL verification challenge', async () => {
      const webhookPayload = {
        type: 'url_verification',
        challenge: 'test-challenge-123',
        headers: {
          'x-slack-signature': 'v0=valid-signature',
          'x-slack-request-timestamp': Math.floor(Date.now() / 1000).toString(),
        },
        rawBody: JSON.stringify({
          type: 'url_verification',
          challenge: 'test-challenge-123',
        }),
      };

      jest.spyOn(worker, 'verifySlackSignature').mockReturnValue(true);

      const result = await worker.processSlackWebhook(
        webhookPayload,
        'test-workflow-id'
      );

      expect(result.success).toBe(true);
      expect(result.result.challenge).toBe('test-challenge-123');
    });
  });

  describe('sendSlackResponse', () => {
    test('should send message via Web API', async () => {
      const responseData = {
        channelId: 'C1234567890',
        messageType: 'campaign_created',
        data: {
          campaignName: 'Test Campaign',
          campaignType: 'email',
          status: 'active',
          campaignId: 'CAMP-123',
          audienceCount: 1000,
          channels: ['email'],
        },
      };

      const result = await worker.sendSlackResponse(responseData);

      expect(result.success).toBe(true);
      expect(result.messageTs).toBe('1234567890.123456');
      expect(mockWebClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'C1234567890',
        })
      );
    });

    test('should send message via response URL', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });

      const responseData = {
        responseUrl: 'https://hooks.slack.com/commands/1234567890/0987654321/test',
        messageType: 'error',
        data: {
          message: 'Something went wrong',
          errorId: 'ERR-123',
        },
      };

      const result = await worker.sendSlackResponse(responseData);

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        responseData.responseUrl,
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        })
      );
    });

    test('should handle missing channel and response URL', async () => {
      const responseData = {
        messageType: 'generic',
        data: {
          text: 'Test message',
        },
      };

      const result = await worker.sendSlackResponse(responseData);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No valid channel or response URL provided');
    });
  });

  describe('verifySlackSignature', () => {
    test('should verify valid signature', () => {
      const signingSecret = 'test-signing-secret';
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const rawBody = 'test-body';
      
      const baseString = `v0:${timestamp}:${rawBody}`;
      const expectedSignature = `v0=${crypto
        .createHmac('sha256', signingSecret)
        .update(baseString)
        .digest('hex')}`;

      const headers = {
        'x-slack-signature': expectedSignature,
        'x-slack-request-timestamp': timestamp,
      };

      // Update config for this test
      config.slack.signingSecret = signingSecret;

      const isValid = worker.verifySlackSignature(rawBody, headers);

      expect(isValid).toBe(true);
    });

    test('should reject signature with old timestamp', () => {
      const oldTimestamp = (Math.floor(Date.now() / 1000) - 400).toString(); // 400 seconds ago
      const rawBody = 'test-body';

      const headers = {
        'x-slack-signature': 'v0=some-signature',
        'x-slack-request-timestamp': oldTimestamp,
      };

      const isValid = worker.verifySlackSignature(rawBody, headers);

      expect(isValid).toBe(false);
    });

    test('should reject missing headers', () => {
      const rawBody = 'test-body';
      const headers = {}; // Missing required headers

      const isValid = worker.verifySlackSignature(rawBody, headers);

      expect(isValid).toBe(false);
    });
  });

  describe('formatSlackMessage', () => {
    test('should format campaign created message', () => {
      const responseData = {
        messageType: 'campaign_created',
        data: {
          campaignName: 'Summer Sale Campaign',
          campaignType: 'email',
          status: 'active',
          campaignId: 'CAMP-SUMMER-2024',
          audienceCount: 5000,
          channels: ['email', 'sms'],
        },
      };

      const formatted = worker.formatSlackMessage(responseData);

      expect(formatted.text).toContain('Campaign Created Successfully');
      expect(formatted.blocks).toBeDefined();
      expect(formatted.blocks[0].text.text).toContain('Summer Sale Campaign');
      expect(formatted.blocks[2].elements).toHaveLength(2); // Two action buttons
    });

    test('should format campaign status message', () => {
      const responseData = {
        messageType: 'campaign_status',
        data: {
          campaignName: 'Summer Sale Campaign',
          campaignId: 'CAMP-SUMMER-2024',
          status: 'completed',
          sentCount: 4800,
          openCount: 1200,
          openRate: '25%',
          clickCount: 240,
          clickRate: '5%',
          createdAt: '2024-01-15T10:30:00Z',
        },
      };

      const formatted = worker.formatSlackMessage(responseData);

      expect(formatted.text).toContain('Campaign Status');
      expect(formatted.blocks[1].fields).toHaveLength(4); // Four status fields
      expect(formatted.blocks[1].fields[0].text).toContain('4800'); // Sent count
    });

    test('should format error message', () => {
      const responseData = {
        messageType: 'error',
        data: {
          message: 'Campaign creation failed',
          errorId: 'ERR-12345',
        },
      };

      const formatted = worker.formatSlackMessage(responseData);

      expect(formatted.text).toBe('❌ An error occurred');
      expect(formatted.blocks[0].text.text).toContain('Campaign creation failed');
      expect(formatted.blocks[1].elements[0].text).toContain('ERR-12345');
    });

    test('should format workflow complete message', () => {
      const responseData = {
        messageType: 'workflow_complete',
        data: {
          workflowName: 'Marketing Campaign Workflow',
          workflowId: 'WF-12345',
          status: 'COMPLETED',
          duration: 5000,
        },
      };

      const formatted = worker.formatSlackMessage(responseData);

      expect(formatted.text).toBe('✅ Workflow Complete');
      expect(formatted.blocks[0].text.text).toContain('Marketing Campaign Workflow');
      expect(formatted.blocks[1].fields[0].text).toContain('WF-12345');
    });
  });

  describe('authenticateSlackRequest', () => {
    test('should authenticate valid team', async () => {
      const event = {
        team_id: 'T1234567890',
      };

      const result = await worker.authenticateSlackRequest(event);

      expect(result.valid).toBe(true);
      expect(result.teamId).toBe('T1234567890');
      expect(result.teamName).toBe('Test Team');
      expect(mockWebClient.team.info).toHaveBeenCalledWith({
        team: 'T1234567890',
      });
    });

    test('should reject unauthorized team', async () => {
      const event = {
        team_id: 'T9999999999', // Not in allowed teams
      };

      const result = await worker.authenticateSlackRequest(event);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unauthorized team');
    });

    test('should handle API errors gracefully', async () => {
      const event = {
        team_id: 'T1234567890',
      };

      mockWebClient.team.info.mockRejectedValue(new Error('API Error'));

      const result = await worker.authenticateSlackRequest(event);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('API Error');
    });
  });

  describe('parseWebhookEvent', () => {
    test('should parse valid webhook payload', () => {
      const payload = {
        body: {
          type: 'event_callback',
          team_id: 'T1234567890',
          api_app_id: 'A1234567890',
          event: {
            type: 'app_mention',
            user: 'U1234567890',
          },
        },
      };

      const parsed = worker.parseWebhookEvent(payload);

      expect(parsed.type).toBe('event_callback');
      expect(parsed.team_id).toBe('T1234567890');
      expect(parsed.event.type).toBe('app_mention');
    });

    test('should parse string body', () => {
      const payload = {
        body: JSON.stringify({
          type: 'url_verification',
          challenge: 'test-challenge',
        }),
      };

      const parsed = worker.parseWebhookEvent(payload);

      expect(parsed.type).toBe('url_verification');
      expect(parsed.challenge).toBe('test-challenge');
    });

    test('should handle invalid JSON', () => {
      const payload = {
        body: 'invalid-json{',
      };

      expect(() => worker.parseWebhookEvent(payload)).toThrow(
        'Failed to parse webhook payload'
      );
    });
  });

  describe('getHealthStatus', () => {
    test('should return health status', () => {
      const status = worker.getHealthStatus();

      expect(status.status).toBe('healthy');
      expect(status.metrics).toBeDefined();
      expect(status.slack.connected).toBe(true);
      expect(status.slack.botToken).toBe('configured');
      expect(status.slack.signingSecret).toBe('configured');
    });
  });

  describe('integration lifecycle', () => {
    test('should start successfully', async () => {
      await worker.start(3001);

      expect(mockApp.start).toHaveBeenCalledWith(3001);
    });

    test('should shutdown gracefully', async () => {
      await worker.shutdown();

      expect(mockApp.stop).toHaveBeenCalled();
    });

    test('should handle start errors', async () => {
      mockApp.start.mockRejectedValue(new Error('Start failed'));

      await expect(worker.start()).rejects.toThrow('Start failed');
    });
  });
});