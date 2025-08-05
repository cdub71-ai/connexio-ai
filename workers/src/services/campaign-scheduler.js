import { createContextLogger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Campaign Scheduler Service
 * Handles coordinated timing and scheduling for multi-channel campaigns
 */
class CampaignScheduler {
  constructor() {
    this.logger = createContextLogger({ service: 'campaign-scheduler' });
    
    // Active schedules
    this.schedules = new Map();
    this.timers = new Map();
    
    // Scheduling strategies
    this.strategies = {
      sequential: this.createSequentialPlan.bind(this),
      parallel: this.createParallelPlan.bind(this),
      staged: this.createStagedPlan.bind(this),
      optimal: this.createOptimalPlan.bind(this),
    };

    this.logger.info('Campaign scheduler initialized', {
      supportedStrategies: Object.keys(this.strategies),
    });
  }

  /**
   * Create execution plan for multi-channel campaign
   * @param {Object} orchestration - Orchestration configuration
   * @param {Array} channels - Channel configurations
   * @param {Object} audienceResult - Audience preparation result
   * @param {Object} logger - Logger instance
   * @returns {Promise<Object>} Execution plan
   */
  async createExecutionPlan(orchestration, channels, audienceResult, logger) {
    const planId = uuidv4();
    logger.info('Creating execution plan', {
      planId,
      orchestrationType: orchestration?.type || 'sequential',
      channelCount: channels.length,
      totalAudience: audienceResult.totalSize,
    });

    try {
      const strategy = orchestration?.type || 'sequential';
      const strategyFunction = this.strategies[strategy];

      if (!strategyFunction) {
        throw new Error(`Unsupported orchestration strategy: ${strategy}`);
      }

      const plan = await strategyFunction(orchestration, channels, audienceResult, logger);
      
      // Add execution metadata
      plan.planId = planId;
      plan.createdAt = new Date().toISOString();
      plan.estimatedDuration = this.calculateEstimatedDuration(plan);
      plan.totalDelays = plan.channels.reduce((sum, ch) => sum + (ch.timing.delay || 0), 0);

      // Store plan
      this.schedules.set(planId, plan);

      logger.info('Execution plan created', {
        planId,
        strategy,
        channelCount: plan.channels.length,
        estimatedDuration: plan.estimatedDuration,
        totalDelays: plan.totalDelays,
      });

      return plan;

    } catch (error) {
      logger.error('Failed to create execution plan', {
        error: error.message,
        orchestrationType: orchestration?.type,
      });
      throw error;
    }
  }

  /**
   * Create sequential execution plan
   * @private
   */
  async createSequentialPlan(orchestration, channels, audienceResult, logger) {
    const plan = {
      type: 'sequential',
      channels: [],
      totalDuration: 0,
    };

    let cumulativeDelay = 0;
    const defaultDelay = orchestration.delay || 300000; // 5 minutes default

    for (let i = 0; i < channels.length; i++) {
      const channel = channels[i];
      const delay = i === 0 ? 0 : (channel.delay || defaultDelay);
      
      cumulativeDelay += delay;

      // Prepare channel-specific audience
      const channelAudience = await this.prepareChannelAudience(
        channel,
        audienceResult,
        logger
      );

      plan.channels.push({
        channel,
        timing: {
          delay: cumulativeDelay,
          scheduledTime: new Date(Date.now() + cumulativeDelay).toISOString(),
          estimatedDuration: this.estimateChannelDuration(channel, channelAudience),
        },
        audience: channelAudience,
        order: i + 1,
      });
    }

    plan.totalDuration = cumulativeDelay + Math.max(
      ...plan.channels.map(ch => ch.timing.estimatedDuration)
    );

    logger.info('Sequential plan created', {
      totalChannels: plan.channels.length,
      totalDuration: plan.totalDuration,
      firstExecution: plan.channels[0]?.timing.scheduledTime,
      lastExecution: plan.channels[plan.channels.length - 1]?.timing.scheduledTime,
    });

    return plan;
  }

  /**
   * Create parallel execution plan
   * @private
   */
  async createParallelPlan(orchestration, channels, audienceResult, logger) {
    const plan = {
      type: 'parallel',
      channels: [],
      totalDuration: 0,
    };

    const startDelay = orchestration.startDelay || 0;
    
    for (let i = 0; i < channels.length; i++) {
      const channel = channels[i];
      
      // Prepare channel-specific audience
      const channelAudience = await this.prepareChannelAudience(
        channel,
        audienceResult,
        logger
      );

      const channelDuration = this.estimateChannelDuration(channel, channelAudience);

      plan.channels.push({
        channel,
        timing: {
          delay: startDelay,
          scheduledTime: new Date(Date.now() + startDelay).toISOString(),
          estimatedDuration: channelDuration,
        },
        audience: channelAudience,
        order: i + 1,
      });

      // Update total duration to be the longest channel
      plan.totalDuration = Math.max(plan.totalDuration, channelDuration);
    }

    plan.totalDuration += startDelay;

    logger.info('Parallel plan created', {
      totalChannels: plan.channels.length,
      simultaneousStart: true,
      totalDuration: plan.totalDuration,
      executionTime: plan.channels[0]?.timing.scheduledTime,
    });

    return plan;
  }

  /**
   * Create staged execution plan
   * @private
   */
  async createStagedPlan(orchestration, channels, audienceResult, logger) {
    const plan = {
      type: 'staged',
      channels: [],
      stages: [],
      totalDuration: 0,
    };

    const stages = orchestration.stages || [];
    let cumulativeDelay = 0;

    for (let stageIndex = 0; stageIndex < stages.length; stageIndex++) {
      const stage = stages[stageIndex];
      const stageDelay = stage.delay || 0;
      
      cumulativeDelay += stageDelay;

      const stageInfo = {
        stageNumber: stageIndex + 1,
        name: stage.name || `Stage ${stageIndex + 1}`,
        delay: stageDelay,
        scheduledTime: new Date(Date.now() + cumulativeDelay).toISOString(),
        channels: [],
      };

      // Find channels for this stage
      const stageChannels = channels.filter(ch => 
        ch.stage === stageIndex + 1 || 
        (stage.channels && stage.channels.includes(ch.type))
      );

      let maxStageDuration = 0;

      for (const channel of stageChannels) {
        // Prepare channel-specific audience
        const channelAudience = await this.prepareChannelAudience(
          channel,
          audienceResult,
          logger
        );

        const channelDuration = this.estimateChannelDuration(channel, channelAudience);
        maxStageDuration = Math.max(maxStageDuration, channelDuration);

        const channelExecution = {
          channel,
          timing: {
            delay: cumulativeDelay,
            scheduledTime: new Date(Date.now() + cumulativeDelay).toISOString(),
            estimatedDuration: channelDuration,
          },
          audience: channelAudience,
          stage: stageIndex + 1,
        };

        plan.channels.push(channelExecution);
        stageInfo.channels.push(channelExecution);
      }

      stageInfo.estimatedDuration = maxStageDuration;
      plan.stages.push(stageInfo);

      // Add stage duration to cumulative delay for next stage
      cumulativeDelay += maxStageDuration;
    }

    plan.totalDuration = cumulativeDelay;

    logger.info('Staged plan created', {
      totalStages: plan.stages.length,
      totalChannels: plan.channels.length,
      totalDuration: plan.totalDuration,
      stages: plan.stages.map(s => ({
        name: s.name,
        channelCount: s.channels.length,
        scheduledTime: s.scheduledTime,
      })),
    });

    return plan;
  }

  /**
   * Create optimal execution plan based on audience and channel characteristics
   * @private
   */
  async createOptimalPlan(orchestration, channels, audienceResult, logger) {
    logger.info('Creating optimal execution plan', {
      channelCount: channels.length,
      totalAudience: audienceResult.totalSize,
    });

    // Analyze channels to determine optimal strategy
    const emailChannels = channels.filter(ch => ch.type === 'email');
    const smsChannels = channels.filter(ch => ch.type === 'sms' || ch.type === 'mms');

    // Decision logic for optimal strategy
    let optimalStrategy;
    let strategyReason;

    if (emailChannels.length > 0 && smsChannels.length > 0) {
      // Mixed channels - use sequential with SMS first for immediate impact
      optimalStrategy = 'sequential';
      strategyReason = 'Mixed channels detected, sequential for optimal impact';
      
      // Reorder channels: SMS/MMS first, then email
      const reorderedChannels = [...smsChannels, ...emailChannels];
      
      return await this.createSequentialPlan(
        { ...orchestration, delay: 900000 }, // 15 minutes between channels
        reorderedChannels,
        audienceResult,
        logger
      );
    } else if (audienceResult.totalSize > 10000) {
      // Large audience - use staged approach
      optimalStrategy = 'staged';
      strategyReason = 'Large audience detected, staged for better deliverability';
      
      const stages = this.createOptimalStages(channels, audienceResult);
      
      return await this.createStagedPlan(
        { ...orchestration, stages },
        channels,
        audienceResult,
        logger
      );
    } else {
      // Small audience or single channel type - use parallel
      optimalStrategy = 'parallel';
      strategyReason = 'Small audience or single channel type, parallel for speed';
      
      return await this.createParallelPlan(
        { ...orchestration, startDelay: 60000 }, // 1 minute delay
        channels,
        audienceResult,
        logger
      );
    }
  }

  /**
   * Create optimal stages for large audiences
   * @private
   */
  createOptimalStages(channels, audienceResult) {
    const stages = [];
    const audienceSegments = Math.ceil(audienceResult.totalSize / 5000); // 5k per segment

    for (let i = 0; i < audienceSegments; i++) {
      stages.push({
        name: `Segment ${i + 1}`,
        delay: i * 600000, // 10 minutes between segments
        channels: channels.map(ch => ch.type),
      });
    }

    return stages;
  }

  /**
   * Prepare channel-specific audience
   * @private
   */
  async prepareChannelAudience(channel, audienceResult, logger) {
    // Filter audience based on channel preferences
    let channelAudience = {
      size: audienceResult.totalSize,
      contacts: audienceResult.contacts || [],
      lists: audienceResult.lists || [],
      segments: audienceResult.segments || [],
    };

    // Apply channel-specific filters
    if (channel.audienceFilter) {
      const originalSize = channelAudience.size;
      
      // Apply filters (implementation would depend on specific filter types)
      channelAudience = this.applyAudienceFilters(channelAudience, channel.audienceFilter);
      
      logger.info('Applied channel audience filters', {
        channelType: channel.type,
        originalSize,
        filteredSize: channelAudience.size,
        filterTypes: Object.keys(channel.audienceFilter),
      });
    }

    return channelAudience;
  }

  /**
   * Apply audience filters for specific channels
   * @private
   */
  applyAudienceFilters(audience, filters) {
    let filteredAudience = { ...audience };

    // Example filters
    if (filters.preferredChannels) {
      // Filter contacts who prefer this channel
      const preferredContacts = audience.contacts.filter(contact => 
        contact.preferences?.channels?.includes(filters.preferredChannels)
      );
      
      filteredAudience.contacts = preferredContacts;
      filteredAudience.size = preferredContacts.length;
    }

    if (filters.excludeRecentContacts) {
      // Exclude contacts contacted recently via this channel
      const cutoffDate = new Date(Date.now() - filters.excludeRecentContacts);
      const nonRecentContacts = audience.contacts.filter(contact => 
        !contact.lastContactDate || new Date(contact.lastContactDate) < cutoffDate
      );
      
      filteredAudience.contacts = nonRecentContacts;
      filteredAudience.size = nonRecentContacts.length;
    }

    return filteredAudience;
  }

  /**
   * Estimate duration for channel execution
   * @private
   */
  estimateChannelDuration(channel, audience) {
    const baseTime = 60000; // 1 minute base
    
    switch (channel.type) {
      case 'email':
        // Email campaigns typically take longer to process
        return baseTime + (audience.size * 10); // 10ms per recipient
      case 'sms':
        // SMS is faster but has rate limits
        return baseTime + (audience.size * 100); // 100ms per recipient
      case 'mms':
        // MMS takes longer due to media processing
        return baseTime + (audience.size * 200); // 200ms per recipient
      default:
        return baseTime + (audience.size * 50); // 50ms per recipient
    }
  }

  /**
   * Calculate total estimated duration for plan
   * @private
   */
  calculateEstimatedDuration(plan) {
    switch (plan.type) {
      case 'sequential':
        return plan.channels.reduce((total, ch) => 
          Math.max(total, ch.timing.delay + ch.timing.estimatedDuration), 0
        );
      case 'parallel':
        const maxDuration = Math.max(...plan.channels.map(ch => ch.timing.estimatedDuration));
        return (plan.channels[0]?.timing.delay || 0) + maxDuration;
      case 'staged':
        return plan.totalDuration || 0;
      default:
        return 0;
    }
  }

  /**
   * Schedule campaign execution
   * @param {string} planId - Execution plan ID
   * @param {Function} executionCallback - Function to call when execution time arrives
   * @returns {Promise<Object>} Scheduling result
   */
  async scheduleCampaignExecution(planId, executionCallback) {
    const plan = this.schedules.get(planId);
    if (!plan) {
      throw new Error(`Execution plan not found: ${planId}`);
    }

    const timers = [];

    for (const channelExecution of plan.channels) {
      const delay = channelExecution.timing.delay;
      
      if (delay > 0) {
        const timer = setTimeout(() => {
          executionCallback(channelExecution);
        }, delay);
        
        timers.push({
          channelType: channelExecution.channel.type,
          timer,
          scheduledTime: channelExecution.timing.scheduledTime,
        });
      } else {
        // Execute immediately
        setImmediate(() => executionCallback(channelExecution));
      }
    }

    this.timers.set(planId, timers);

    this.logger.info('Campaign execution scheduled', {
      planId,
      scheduledChannels: timers.length,
      immediateChannels: plan.channels.filter(ch => ch.timing.delay === 0).length,
    });

    return {
      success: true,
      planId,
      scheduledChannels: timers.length,
      nextExecution: plan.channels[0]?.timing.scheduledTime,
    };
  }

  /**
   * Cancel scheduled campaign
   * @param {string} planId - Execution plan ID
   * @returns {Object} Cancellation result
   */
  cancelScheduledCampaign(planId) {
    const timers = this.timers.get(planId);
    if (!timers) {
      return {
        success: false,
        error: `No scheduled timers found for plan: ${planId}`,
      };
    }

    let cancelledCount = 0;
    for (const timerInfo of timers) {
      clearTimeout(timerInfo.timer);
      cancelledCount++;
    }

    this.timers.delete(planId);
    this.schedules.delete(planId);

    this.logger.info('Campaign schedule cancelled', {
      planId,
      cancelledTimers: cancelledCount,
    });

    return {
      success: true,
      planId,
      cancelledTimers: cancelledCount,
    };
  }

  /**
   * Get scheduler health status
   */
  getHealthStatus() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      activeSchedules: this.schedules.size,
      activeTimers: this.timers.size,
      supportedStrategies: Object.keys(this.strategies),
    };
  }

  /**
   * Shutdown scheduler gracefully
   */
  async shutdown() {
    this.logger.info('Shutting down campaign scheduler');

    try {
      // Cancel all active timers
      for (const [planId, timers] of this.timers.entries()) {
        for (const timerInfo of timers) {
          clearTimeout(timerInfo.timer);
        }
      }

      this.timers.clear();
      this.schedules.clear();

      this.logger.info('Campaign scheduler shutdown complete');
    } catch (error) {
      this.logger.error('Error during scheduler shutdown', { error: error.message });
    }
  }
}

export default CampaignScheduler;