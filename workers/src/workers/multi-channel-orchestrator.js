import { LHTaskWorker } from 'littlehorse-client';
import SureshotEloquaWorker from './sureshot-eloqua-worker.js';
import TwilioSmsService from '../services/twilio-sms-service.js';
import CampaignScheduler from '../services/campaign-scheduler.js';
import AudienceManager from '../services/audience-manager.js';
import PerformanceTracker from '../services/performance-tracker.js';
import config from '../config/index.js';
import { createContextLogger, createTimer } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Multi-Channel Campaign Orchestrator
 * Coordinates email, SMS/MMS campaigns with timing controls and performance tracking
 */
class MultiChannelOrchestrator {
  constructor() {
    this.sureshotWorker = new SureshotEloquaWorker();
    this.twilioService = new TwilioSmsService();
    this.scheduler = new CampaignScheduler();
    this.audienceManager = new AudienceManager();
    this.performanceTracker = new PerformanceTracker();
    
    this.logger = createContextLogger({ service: 'multi-channel-orchestrator' });

    // Campaign state tracking
    this.activeCampaigns = new Map();
    this.channelStatus = new Map();

    // Performance metrics
    this.metrics = {
      totalCampaigns: 0,
      successfulCampaigns: 0,
      failedCampaigns: 0,
      channelMetrics: {
        email: { sent: 0, delivered: 0, opened: 0, clicked: 0 },
        sms: { sent: 0, delivered: 0, replied: 0 },
        mms: { sent: 0, delivered: 0, replied: 0 },
      },
      averageExecutionTime: 0,
    };

    this.logger.info('Multi-channel orchestrator initialized', {
      supportedChannels: ['email', 'sms', 'mms'],
      schedulingEnabled: true,
      performanceTracking: true,
    });
  }

  /**
   * Execute multi-channel campaign
   * @param {Object} campaignSpec - Multi-channel campaign specification
   * @param {Object} context - Little Horse execution context
   */
  @LHTaskWorker('execute-multi-channel-campaign')
  async executeMultiChannelCampaign(campaignSpec, context = {}) {
    const orchestrationId = uuidv4();
    const timer = createTimer('multi-channel-campaign');
    const logger = createContextLogger({
      service: 'multi-channel-orchestrator',
      orchestrationId,
      workflowId: context.wfRunId,
      campaignName: campaignSpec.name,
    });

    logger.taskStart(orchestrationId, context.wfRunId, {
      channels: campaignSpec.channels?.map(c => c.type) || [],
      audienceSize: campaignSpec.audience?.totalSize || 0,
      orchestrationType: campaignSpec.orchestration?.type || 'sequential',
    });

    this.metrics.totalCampaigns++;
    this.activeCampaigns.set(orchestrationId, {
      status: 'initializing',
      startTime: Date.now(),
      campaignSpec,
      channelResults: {},
    });

    try {
      // Step 1: Validate multi-channel campaign specification
      const validationResult = await this.validateMultiChannelSpec(campaignSpec, logger);
      if (!validationResult.isValid) {
        throw new Error(`Campaign validation failed: ${validationResult.errors.join(', ')}`);
      }

      // Step 2: Prepare cross-channel audience
      const audienceResult = await this.audienceManager.prepareMultiChannelAudience(
        campaignSpec.audience,
        campaignSpec.channels,
        logger
      );

      // Step 3: Schedule channel execution based on orchestration strategy
      const executionPlan = await this.scheduler.createExecutionPlan(
        campaignSpec.orchestration,
        campaignSpec.channels,
        audienceResult,
        logger
      );

      // Step 4: Execute channels according to plan
      const channelResults = await this.executeChannelsWithTiming(
        executionPlan,
        campaignSpec,
        audienceResult,
        orchestrationId,
        logger
      );

      // Step 5: Start performance tracking
      const trackingResult = await this.performanceTracker.startTracking(
        orchestrationId,
        campaignSpec.channels,
        channelResults,
        logger
      );

      const duration = timer.end();
      this.metrics.successfulCampaigns++;
      this._updateMetrics(true, duration);

      const result = {
        success: true,
        orchestrationId,
        executionPlan,
        channelResults,
        audienceResult,
        trackingId: trackingResult.trackingId,
        performance: {
          totalAudienceSize: audienceResult.totalSize,
          channelsExecuted: Object.keys(channelResults).length,
          executionTimeMs: duration,
        },
        status: 'executing',
        estimatedCompletion: this._estimateCompletion(executionPlan),
      };

      // Update campaign state
      this.activeCampaigns.set(orchestrationId, {
        ...this.activeCampaigns.get(orchestrationId),
        status: 'executing',
        result,
      });

      logger.taskComplete(orchestrationId, context.wfRunId, result, duration);
      return result;

    } catch (error) {
      const duration = timer.end();
      this.metrics.failedCampaigns++;
      this._updateMetrics(false, duration);

      // Update campaign state
      this.activeCampaigns.set(orchestrationId, {
        ...this.activeCampaigns.get(orchestrationId),
        status: 'failed',
        error: error.message,
      });

      logger.taskError(orchestrationId, context.wfRunId, error, duration);

      return {
        success: false,
        orchestrationId,
        error: error.message,
        errorType: this._classifyError(error),
        retryable: this._isRetryableError(error),
        processingTimeMs: duration,
      };
    }
  }

  /**
   * Get multi-channel campaign status
   * @param {Object} statusRequest - Status request with orchestration ID
   * @param {Object} context - Little Horse execution context
   */
  @LHTaskWorker('get-multi-channel-status')
  async getMultiChannelStatus(statusRequest, context = {}) {
    const orchestrationId = statusRequest.orchestrationId;
    const logger = createContextLogger({
      service: 'multi-channel-orchestrator',
      orchestrationId,
      workflowId: context.wfRunId,
    });

    try {
      // Get current campaign state
      const campaignState = this.activeCampaigns.get(orchestrationId);
      if (!campaignState) {
        throw new Error(`Campaign not found: ${orchestrationId}`);
      }

      // Get real-time performance data
      const performanceData = await this.performanceTracker.getCurrentMetrics(orchestrationId);

      // Get individual channel statuses
      const channelStatuses = await this.getChannelStatuses(
        campaignState.channelResults,
        logger
      );

      // Calculate overall progress
      const progress = this._calculateOverallProgress(channelStatuses);

      const result = {
        success: true,
        orchestrationId,
        status: campaignState.status,
        progress,
        channelStatuses,
        performance: performanceData,
        timing: {
          startTime: campaignState.startTime,
          currentTime: Date.now(),
          estimatedCompletion: campaignState.result?.estimatedCompletion,
        },
      };

      logger.info('Multi-channel status retrieved', {
        orchestrationId,
        status: campaignState.status,
        progress: progress.percentage,
      });

      return result;

    } catch (error) {
      logger.error('Failed to get multi-channel status', {
        error: error.message,
        orchestrationId,
      });

      return {
        success: false,
        error: error.message,
        orchestrationId,
      };
    }
  }

  /**
   * Pause multi-channel campaign
   * @param {Object} pauseRequest - Pause request with orchestration ID
   * @param {Object} context - Little Horse execution context
   */
  @LHTaskWorker('pause-multi-channel-campaign')
  async pauseMultiChannelCampaign(pauseRequest, context = {}) {
    const orchestrationId = pauseRequest.orchestrationId;
    const logger = createContextLogger({
      service: 'multi-channel-orchestrator',
      orchestrationId,
      workflowId: context.wfRunId,
    });

    try {
      const campaignState = this.activeCampaigns.get(orchestrationId);
      if (!campaignState) {
        throw new Error(`Campaign not found: ${orchestrationId}`);
      }

      // Pause all active channels
      const pauseResults = await this.pauseAllChannels(
        campaignState.channelResults,
        logger
      );

      // Update campaign state
      this.activeCampaigns.set(orchestrationId, {
        ...campaignState,
        status: 'paused',
        pausedAt: Date.now(),
      });

      logger.info('Multi-channel campaign paused', {
        orchestrationId,
        channelsPaused: Object.keys(pauseResults).length,
      });

      return {
        success: true,
        orchestrationId,
        status: 'paused',
        channelResults: pauseResults,
        pausedAt: Date.now(),
      };

    } catch (error) {
      logger.error('Failed to pause multi-channel campaign', {
        error: error.message,
        orchestrationId,
      });

      return {
        success: false,
        error: error.message,
        orchestrationId,
      };
    }
  }

  /**
   * Execute channels with coordinated timing
   * @private
   */
  async executeChannelsWithTiming(executionPlan, campaignSpec, audienceResult, orchestrationId, logger) {
    const channelResults = {};

    logger.info('Executing channels with timing', {
      orchestrationType: executionPlan.type,
      channelCount: executionPlan.channels.length,
      totalDelays: executionPlan.delays?.length || 0,
    });

    for (const channelExecution of executionPlan.channels) {
      const { channel, timing, audience } = channelExecution;

      logger.info('Executing channel', {
        channelType: channel.type,
        scheduledTime: timing.scheduledTime,
        audienceSize: audience.size,
      });

      // Wait for scheduled time if needed
      if (timing.delay > 0) {
        logger.info('Waiting for channel timing', {
          channelType: channel.type,
          delayMs: timing.delay,
        });
        await this._delay(timing.delay);
      }

      // Execute channel
      let result;
      switch (channel.type) {
        case 'email':
          result = await this.executeEmailChannel(channel, audience, logger);
          break;
        case 'sms':
          result = await this.executeSmsChannel(channel, audience, logger);
          break;
        case 'mms':
          result = await this.executeMmsChannel(channel, audience, logger);
          break;
        default:
          throw new Error(`Unsupported channel type: ${channel.type}`);
      }

      channelResults[channel.type] = {
        ...result,
        executedAt: new Date().toISOString(),
        timing,
        audienceSize: audience.size,
      };

      // Update channel status
      this.channelStatus.set(`${orchestrationId}:${channel.type}`, {
        status: result.success ? 'executing' : 'failed',
        lastUpdate: Date.now(),
        result,
      });

      logger.info('Channel executed', {
        channelType: channel.type,
        success: result.success,
        campaignId: result.campaignId,
      });
    }

    return channelResults;
  }

  /**
   * Execute email channel
   * @private
   */
  async executeEmailChannel(channel, audience, logger) {
    logger.info('Executing email channel', {
      templateId: channel.email?.templateId,
      audienceSize: audience.size,
    });

    const emailCampaignSpec = {
      name: channel.name,
      description: channel.description,
      type: 'email',
      email: channel.email,
      audience: audience.lists ? { lists: audience.lists } : { segments: audience.segments },
      execution: channel.execution || { type: 'immediate' },
      tracking: channel.tracking,
      compliance: channel.compliance,
    };

    const result = await this.sureshotWorker.createEloquaCampaign(emailCampaignSpec);
    
    if (result.success) {
      this.metrics.channelMetrics.email.sent += audience.size;
    }

    return result;
  }

  /**
   * Execute SMS channel
   * @private
   */
  async executeSmsChannel(channel, audience, logger) {
    logger.info('Executing SMS channel', {
      message: channel.sms?.message?.substring(0, 50) + '...',
      audienceSize: audience.size,
    });

    const smsSpec = {
      name: channel.name,
      message: channel.sms.message,
      fromNumber: channel.sms.fromNumber,
      audience: audience.contacts,
      scheduling: channel.execution,
    };

    const result = await this.twilioService.sendBulkSms(smsSpec);
    
    if (result.success) {
      this.metrics.channelMetrics.sms.sent += audience.size;
    }

    return result;
  }

  /**
   * Execute MMS channel
   * @private
   */
  async executeMmsChannel(channel, audience, logger) {
    logger.info('Executing MMS channel', {
      mediaCount: channel.mms?.mediaUrls?.length || 0,
      audienceSize: audience.size,
    });

    const mmsSpec = {
      name: channel.name,
      message: channel.mms.message,
      mediaUrls: channel.mms.mediaUrls,
      fromNumber: channel.mms.fromNumber,
      audience: audience.contacts,
      scheduling: channel.execution,
    };

    const result = await this.twilioService.sendBulkMms(mmsSpec);
    
    if (result.success) {
      this.metrics.channelMetrics.mms.sent += audience.size;
    }

    return result;
  }

  /**
   * Validate multi-channel campaign specification
   * @private
   */
  async validateMultiChannelSpec(campaignSpec, logger) {
    const errors = [];
    const warnings = [];

    // Basic validation
    if (!campaignSpec.name) errors.push('Campaign name is required');
    if (!campaignSpec.channels || !Array.isArray(campaignSpec.channels)) {
      errors.push('At least one channel is required');
    }

    // Channel validation
    if (campaignSpec.channels) {
      for (let i = 0; i < campaignSpec.channels.length; i++) {
        const channel = campaignSpec.channels[i];
        
        if (!channel.type) {
          errors.push(`Channel ${i + 1}: type is required`);
          continue;
        }

        if (!['email', 'sms', 'mms'].includes(channel.type)) {
          errors.push(`Channel ${i + 1}: unsupported type '${channel.type}'`);
          continue;
        }

        // Channel-specific validation
        switch (channel.type) {
          case 'email':
            if (!channel.email?.subject) errors.push(`Email channel ${i + 1}: subject is required`);
            if (!channel.email?.fromAddress) errors.push(`Email channel ${i + 1}: from address is required`);
            break;
          case 'sms':
          case 'mms':
            if (!channel[channel.type]?.message) errors.push(`${channel.type.toUpperCase()} channel ${i + 1}: message is required`);
            if (!channel[channel.type]?.fromNumber) errors.push(`${channel.type.toUpperCase()} channel ${i + 1}: from number is required`);
            break;
        }
      }
    }

    // Orchestration validation
    if (campaignSpec.orchestration) {
      if (!campaignSpec.orchestration.type) {
        errors.push('Orchestration type is required');
      } else if (!['sequential', 'parallel', 'staged'].includes(campaignSpec.orchestration.type)) {
        errors.push('Orchestration type must be sequential, parallel, or staged');
      }

      if (campaignSpec.orchestration.type === 'staged' && !campaignSpec.orchestration.stages) {
        errors.push('Staged orchestration requires stages configuration');
      }
    }

    // Audience validation
    if (!campaignSpec.audience) {
      errors.push('Audience configuration is required');
    }

    logger.info('Multi-channel specification validation completed', {
      isValid: errors.length === 0,
      errorCount: errors.length,
      warningCount: warnings.length,
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Get individual channel statuses
   * @private
   */
  async getChannelStatuses(channelResults, logger) {
    const statuses = {};

    for (const [channelType, result] of Object.entries(channelResults)) {
      let status;
      
      switch (channelType) {
        case 'email':
          status = await this.sureshotWorker.getCampaignStatus({ campaignId: result.campaignId });
          break;
        case 'sms':
        case 'mms':
          status = await this.twilioService.getCampaignStatus({ campaignId: result.campaignId });
          break;
        default:
          status = { success: false, error: 'Unknown channel type' };
      }

      statuses[channelType] = {
        ...status,
        originalResult: result,
      };
    }

    return statuses;
  }

  /**
   * Calculate overall campaign progress
   * @private
   */
  _calculateOverallProgress(channelStatuses) {
    const channels = Object.values(channelStatuses);
    const completedChannels = channels.filter(c => c.status === 'completed').length;
    const failedChannels = channels.filter(c => c.status === 'failed').length;
    const activeChannels = channels.filter(c => c.status === 'active' || c.status === 'executing').length;

    return {
      total: channels.length,
      completed: completedChannels,
      failed: failedChannels,
      active: activeChannels,
      percentage: channels.length > 0 ? Math.round((completedChannels / channels.length) * 100) : 0,
    };
  }

  /**
   * Pause all active channels
   * @private
   */
  async pauseAllChannels(channelResults, logger) {
    const pauseResults = {};

    for (const [channelType, result] of Object.entries(channelResults)) {
      try {
        let pauseResult;
        
        switch (channelType) {
          case 'email':
            // Email campaigns may not support pausing, depending on implementation
            pauseResult = { success: true, message: 'Email campaigns cannot be paused once started' };
            break;
          case 'sms':
          case 'mms':
            pauseResult = await this.twilioService.pauseCampaign({ campaignId: result.campaignId });
            break;
          default:
            pauseResult = { success: false, error: 'Unknown channel type' };
        }

        pauseResults[channelType] = pauseResult;
      } catch (error) {
        pauseResults[channelType] = {
          success: false,
          error: error.message,
        };
      }
    }

    return pauseResults;
  }

  /**
   * Estimate campaign completion time
   * @private
   */
  _estimateCompletion(executionPlan) {
    const now = Date.now();
    let maxCompletionTime = now;

    for (const channelExecution of executionPlan.channels) {
      const channelCompletionTime = now + channelExecution.timing.delay + (channelExecution.estimatedDuration || 0);
      maxCompletionTime = Math.max(maxCompletionTime, channelCompletionTime);
    }

    return new Date(maxCompletionTime).toISOString();
  }

  /**
   * Delay execution for specified milliseconds
   * @private
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Classify error type
   * @private
   */
  _classifyError(error) {
    if (error.message.includes('validation')) return 'validation';
    if (error.message.includes('timeout')) return 'timeout';
    if (error.message.includes('rate limit')) return 'rate_limit';
    if (error.message.includes('authentication')) return 'authentication';
    return 'unknown';
  }

  /**
   * Check if error is retryable
   * @private
   */
  _isRetryableError(error) {
    const retryableTypes = ['timeout', 'rate_limit', 'network'];
    return retryableTypes.includes(this._classifyError(error));
  }

  /**
   * Update performance metrics
   * @private
   */
  _updateMetrics(success, duration) {
    const totalCampaigns = this.metrics.successfulCampaigns + this.metrics.failedCampaigns;
    const totalTime = this.metrics.averageExecutionTime * (totalCampaigns - 1) + duration;
    this.metrics.averageExecutionTime = totalTime / totalCampaigns;
  }

  /**
   * Get orchestrator health status
   */
  getHealthStatus() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      metrics: this.metrics,
      activeCampaigns: this.activeCampaigns.size,
      services: {
        sureshotWorker: this.sureshotWorker.getHealthStatus(),
        twilioService: this.twilioService.getHealthStatus(),
        scheduler: this.scheduler.getHealthStatus(),
        audienceManager: this.audienceManager.getHealthStatus(),
        performanceTracker: this.performanceTracker.getHealthStatus(),
      },
    };
  }

  /**
   * Shutdown orchestrator gracefully
   */
  async shutdown() {
    this.logger.info('Shutting down multi-channel orchestrator');

    try {
      await Promise.all([
        this.sureshotWorker.shutdown(),
        this.twilioService.shutdown(),
        this.scheduler.shutdown(),
        this.audienceManager.shutdown(),
        this.performanceTracker.shutdown(),
      ]);

      this.logger.info('Multi-channel orchestrator shutdown complete', {
        totalCampaigns: this.metrics.totalCampaigns,
        successRate: this.metrics.totalCampaigns > 0 
          ? (this.metrics.successfulCampaigns / this.metrics.totalCampaigns) * 100 
          : 0,
      });
    } catch (error) {
      this.logger.error('Error during orchestrator shutdown', { error: error.message });
    }
  }
}

export default MultiChannelOrchestrator;