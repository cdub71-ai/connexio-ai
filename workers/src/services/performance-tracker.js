import { createContextLogger, createTimer } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Multi-Channel Campaign Performance Tracker
 * Tracks and aggregates performance metrics across email, SMS, and MMS channels
 */
class PerformanceTracker {
  constructor() {
    this.logger = createContextLogger({ service: 'performance-tracker' });
    
    // Active tracking sessions
    this.trackingSessions = new Map();
    
    // Performance data aggregation
    this.performanceData = new Map();
    
    // Real-time metric intervals
    this.metricIntervals = new Map();

    this.logger.info('Performance tracker initialized');
  }

  /**
   * Start tracking multi-channel campaign performance
   * @param {string} orchestrationId - Campaign orchestration ID
   * @param {Array} channels - Channel configurations
   * @param {Object} channelResults - Initial channel execution results
   * @param {Object} logger - Context logger
   * @returns {Promise<Object>} Tracking initialization result
   */
  async startTracking(orchestrationId, channels, channelResults, logger) {
    const trackingId = uuidv4();
    logger.info('Starting performance tracking', {
      trackingId,
      orchestrationId,
      channelCount: channels.length,
    });

    try {
      // Initialize tracking session
      const trackingSession = {
        trackingId,
        orchestrationId,
        startTime: Date.now(),
        channels: channels.map(ch => ch.type),
        channelResults,
        status: 'active',
        lastUpdate: Date.now(),
      };

      this.trackingSessions.set(trackingId, trackingSession);

      // Initialize performance data structure
      const performanceData = {
        orchestrationId,
        trackingId,
        startTime: Date.now(),
        lastUpdate: Date.now(),
        overallMetrics: {
          totalSent: 0,
          totalDelivered: 0,
          totalOpened: 0,
          totalClicked: 0,
          totalBounced: 0,
          totalUnsubscribed: 0,
          totalReplied: 0,
        },
        channelMetrics: {},
        timeSeriesData: [],
        events: [],
      };

      // Initialize channel-specific metrics
      for (const channel of channels) {
        performanceData.channelMetrics[channel.type] = {
          channelType: channel.type,
          campaignId: channelResults[channel.type]?.campaignId,
          sent: 0,
          delivered: 0,
          opened: 0,
          clicked: 0,
          bounced: 0,
          unsubscribed: 0,
          replied: 0,
          lastUpdate: Date.now(),
          metrics: {
            deliveryRate: 0,
            openRate: 0,
            clickRate: 0,
            bounceRate: 0,
            unsubscribeRate: 0,
            replyRate: 0,
          },
        };
      }

      this.performanceData.set(trackingId, performanceData);

      // Start real-time metric collection
      await this.startRealtimeCollection(trackingId, channels, channelResults, logger);

      logger.info('Performance tracking started', {
        trackingId,
        orchestrationId,
        trackedChannels: Object.keys(performanceData.channelMetrics),
      });

      return {
        success: true,
        trackingId,
        trackingSession,
        initialData: performanceData,
      };

    } catch (error) {
      logger.error('Failed to start performance tracking', {
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
   * Get current performance metrics
   * @param {string} orchestrationId - Campaign orchestration ID
   * @returns {Promise<Object>} Current performance data
   */
  async getCurrentMetrics(orchestrationId) {
    const trackingSession = Array.from(this.trackingSessions.values())
      .find(session => session.orchestrationId === orchestrationId);

    if (!trackingSession) {
      return {
        success: false,
        error: `No tracking session found for orchestration: ${orchestrationId}`,
      };
    }

    const performanceData = this.performanceData.get(trackingSession.trackingId);
    if (!performanceData) {
      return {
        success: false,
        error: `No performance data found for tracking: ${trackingSession.trackingId}`,
      };
    }

    // Update with latest data
    await this.updateCurrentMetrics(trackingSession.trackingId);

    return {
      success: true,
      orchestrationId,
      trackingId: trackingSession.trackingId,
      status: trackingSession.status,
      data: {
        ...performanceData,
        calculatedMetrics: this.calculateAggregatedMetrics(performanceData),
        trendAnalysis: this.analyzeTrends(performanceData),
      },
    };
  }

  /**
   * Start real-time metric collection for all channels
   * @private
   */
  async startRealtimeCollection(trackingId, channels, channelResults, logger) {
    logger.info('Starting real-time metric collection', {
      trackingId,
      channelCount: channels.length,
    });

    // Collection interval (every 5 minutes)
    const interval = setInterval(async () => {
      try {
        await this.collectMetrics(trackingId, channels, channelResults, logger);
      } catch (error) {
        logger.error('Error in metric collection', {
          trackingId,
          error: error.message,
        });
      }
    }, 300000); // 5 minutes

    this.metricIntervals.set(trackingId, interval);

    // Initial collection
    await this.collectMetrics(trackingId, channels, channelResults, logger);
  }

  /**
   * Collect metrics from all channels
   * @private
   */
  async collectMetrics(trackingId, channels, channelResults, logger) {
    const performanceData = this.performanceData.get(trackingId);
    if (!performanceData) return;

    logger.debug('Collecting channel metrics', {
      trackingId,
      channels: channels.map(ch => ch.type),
    });

    const timestamp = Date.now();
    const timeSeriesEntry = {
      timestamp,
      channels: {},
    };

    for (const channel of channels) {
      try {
        const channelMetrics = await this.collectChannelMetrics(
          channel.type,
          channelResults[channel.type],
          logger
        );

        if (channelMetrics) {
          // Update channel-specific data
          performanceData.channelMetrics[channel.type] = {
            ...performanceData.channelMetrics[channel.type],
            ...channelMetrics,
            lastUpdate: timestamp,
          };

          // Calculate channel rates
          this.calculateChannelRates(performanceData.channelMetrics[channel.type]);

          // Add to time series
          timeSeriesEntry.channels[channel.type] = channelMetrics;
        }
      } catch (error) {
        logger.warn('Failed to collect metrics for channel', {
          channelType: channel.type,
          error: error.message,
        });
      }
    }

    // Update overall metrics
    this.updateOverallMetrics(performanceData);

    // Add time series data point
    performanceData.timeSeriesData.push(timeSeriesEntry);
    
    // Keep only last 100 data points
    if (performanceData.timeSeriesData.length > 100) {
      performanceData.timeSeriesData = performanceData.timeSeriesData.slice(-100);
    }

    performanceData.lastUpdate = timestamp;
  }

  /**
   * Collect metrics for specific channel
   * @private
   */
  async collectChannelMetrics(channelType, channelResult, logger) {
    if (!channelResult || !channelResult.campaignId) {
      return null;
    }

    try {
      let metrics;

      switch (channelType) {
        case 'email':
          metrics = await this.collectEmailMetrics(channelResult.campaignId, logger);
          break;
        case 'sms':
        case 'mms':
          metrics = await this.collectSmsMetrics(channelResult.campaignId, channelType, logger);
          break;
        default:
          logger.warn('Unknown channel type for metrics collection', { channelType });
          return null;
      }

      return metrics;

    } catch (error) {
      logger.error('Failed to collect channel metrics', {
        channelType,
        campaignId: channelResult.campaignId,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Collect email campaign metrics
   * @private
   */
  async collectEmailMetrics(campaignId, logger) {
    // This would integrate with your email service (Sureshot/Eloqua)
    // For now, return mock data structure
    logger.debug('Collecting email metrics', { campaignId });

    // In real implementation, call your email service API
    // const emailMetrics = await this.sureshotWorker.getCampaignStatus({ campaignId });

    // Mock data for demonstration
    return {
      sent: Math.floor(Math.random() * 10000),
      delivered: Math.floor(Math.random() * 9500),
      opened: Math.floor(Math.random() * 3000),
      clicked: Math.floor(Math.random() * 500),
      bounced: Math.floor(Math.random() * 200),
      unsubscribed: Math.floor(Math.random() * 50),
      replied: 0, // Email replies are typically tracked separately
    };
  }

  /**
   * Collect SMS/MMS campaign metrics
   * @private
   */
  async collectSmsMetrics(campaignId, channelType, logger) {
    logger.debug('Collecting SMS/MMS metrics', { campaignId, channelType });

    // In real implementation, call your SMS service API
    // const smsMetrics = await this.twilioService.getCampaignStatus({ campaignId });

    // Mock data for demonstration
    return {
      sent: Math.floor(Math.random() * 5000),
      delivered: Math.floor(Math.random() * 4800),
      opened: 0, // SMS doesn't track opens
      clicked: Math.floor(Math.random() * 100), // If SMS contains links
      bounced: Math.floor(Math.random() * 50),
      unsubscribed: Math.floor(Math.random() * 20),
      replied: Math.floor(Math.random() * 200),
    };
  }

  /**
   * Calculate channel-specific rates
   * @private
   */
  calculateChannelRates(channelMetrics) {
    const { sent, delivered, opened, clicked, bounced, unsubscribed, replied } = channelMetrics;

    channelMetrics.metrics = {
      deliveryRate: sent > 0 ? Math.round((delivered / sent) * 100) : 0,
      openRate: delivered > 0 ? Math.round((opened / delivered) * 100) : 0,
      clickRate: delivered > 0 ? Math.round((clicked / delivered) * 100) : 0,
      bounceRate: sent > 0 ? Math.round((bounced / sent) * 100) : 0,
      unsubscribeRate: delivered > 0 ? Math.round((unsubscribed / delivered) * 100) : 0,
      replyRate: delivered > 0 ? Math.round((replied / delivered) * 100) : 0,
    };
  }

  /**
   * Update overall campaign metrics
   * @private
   */
  updateOverallMetrics(performanceData) {
    const overall = {
      totalSent: 0,
      totalDelivered: 0,
      totalOpened: 0,
      totalClicked: 0,
      totalBounced: 0,
      totalUnsubscribed: 0,
      totalReplied: 0,
    };

    // Aggregate across all channels
    for (const channelData of Object.values(performanceData.channelMetrics)) {
      overall.totalSent += channelData.sent || 0;
      overall.totalDelivered += channelData.delivered || 0;
      overall.totalOpened += channelData.opened || 0;
      overall.totalClicked += channelData.clicked || 0;
      overall.totalBounced += channelData.bounced || 0;
      overall.totalUnsubscribed += channelData.unsubscribed || 0;
      overall.totalReplied += channelData.replied || 0;
    }

    performanceData.overallMetrics = overall;
  }

  /**
   * Calculate aggregated metrics and KPIs
   * @private
   */
  calculateAggregatedMetrics(performanceData) {
    const overall = performanceData.overallMetrics;
    
    return {
      overallDeliveryRate: overall.totalSent > 0 
        ? Math.round((overall.totalDelivered / overall.totalSent) * 100) : 0,
      overallEngagementRate: overall.totalDelivered > 0 
        ? Math.round(((overall.totalOpened + overall.totalClicked + overall.totalReplied) / overall.totalDelivered) * 100) : 0,
      overallBounceRate: overall.totalSent > 0 
        ? Math.round((overall.totalBounced / overall.totalSent) * 100) : 0,
      crossChannelReach: this.calculateCrossChannelReach(performanceData),
      bestPerformingChannel: this.identifyBestPerformingChannel(performanceData),
      channelContribution: this.calculateChannelContribution(performanceData),
    };
  }

  /**
   * Calculate cross-channel reach (avoiding double counting)
   * @private
   */
  calculateCrossChannelReach(performanceData) {
    // This would require contact-level tracking to avoid double counting
    // For now, return estimated reach
    const channels = Object.keys(performanceData.channelMetrics);
    const totalDelivered = performanceData.overallMetrics.totalDelivered;
    
    // Simple estimation - actual implementation would track unique contacts
    const estimatedOverlap = channels.length > 1 ? Math.floor(totalDelivered * 0.2) : 0;
    const uniqueReach = totalDelivered - estimatedOverlap;

    return {
      totalDelivered,
      estimatedOverlap,
      uniqueReach,
      overlapPercentage: totalDelivered > 0 ? Math.round((estimatedOverlap / totalDelivered) * 100) : 0,
    };
  }

  /**
   * Identify best performing channel
   * @private
   */
  identifyBestPerformingChannel(performanceData) {
    let bestChannel = null;
    let bestScore = 0;

    for (const [channelType, channelData] of Object.entries(performanceData.channelMetrics)) {
      // Calculate composite performance score
      const deliveryRate = channelData.metrics?.deliveryRate || 0;
      const engagementRate = (channelData.metrics?.openRate || 0) + 
                           (channelData.metrics?.clickRate || 0) + 
                           (channelData.metrics?.replyRate || 0);
      
      const score = (deliveryRate * 0.4) + (engagementRate * 0.6);

      if (score > bestScore) {
        bestScore = score;
        bestChannel = {
          channelType,
          score: Math.round(score),
          deliveryRate,
          engagementRate: Math.round(engagementRate),
        };
      }
    }

    return bestChannel;
  }

  /**
   * Calculate each channel's contribution to overall performance
   * @private
   */
  calculateChannelContribution(performanceData) {
    const overall = performanceData.overallMetrics;
    const contributions = {};

    for (const [channelType, channelData] of Object.entries(performanceData.channelMetrics)) {
      contributions[channelType] = {
        sentContribution: overall.totalSent > 0 
          ? Math.round(((channelData.sent || 0) / overall.totalSent) * 100) : 0,
        deliveredContribution: overall.totalDelivered > 0 
          ? Math.round(((channelData.delivered || 0) / overall.totalDelivered) * 100) : 0,
        engagementContribution: (overall.totalOpened + overall.totalClicked + overall.totalReplied) > 0 
          ? Math.round((((channelData.opened || 0) + (channelData.clicked || 0) + (channelData.replied || 0)) / 
            (overall.totalOpened + overall.totalClicked + overall.totalReplied)) * 100) : 0,
      };
    }

    return contributions;
  }

  /**
   * Analyze performance trends
   * @private
   */
  analyzeTrends(performanceData) {
    const timeSeriesData = performanceData.timeSeriesData;
    
    if (timeSeriesData.length < 2) {
      return {
        trend: 'insufficient_data',
        dataPoints: timeSeriesData.length,
      };
    }

    // Analyze delivery rate trend over time
    const recentPoints = timeSeriesData.slice(-10); // Last 10 data points
    const deliveryRates = recentPoints.map(point => {
      const totalSent = Object.values(point.channels).reduce((sum, ch) => sum + (ch.sent || 0), 0);
      const totalDelivered = Object.values(point.channels).reduce((sum, ch) => sum + (ch.delivered || 0), 0);
      return totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0;
    });

    // Simple trend calculation
    const firstRate = deliveryRates[0];
    const lastRate = deliveryRates[deliveryRates.length - 1];
    const trendDirection = lastRate > firstRate ? 'improving' : 
                          lastRate < firstRate ? 'declining' : 'stable';

    return {
      trend: trendDirection,
      dataPoints: timeSeriesData.length,
      deliveryRateTrend: {
        first: Math.round(firstRate),
        last: Math.round(lastRate),
        change: Math.round(lastRate - firstRate),
      },
      analysis: this.generateTrendAnalysis(trendDirection, lastRate - firstRate),
    };
  }

  /**
   * Generate trend analysis text
   * @private
   */
  generateTrendAnalysis(direction, change) {
    switch (direction) {
      case 'improving':
        return `Performance is improving with a ${Math.abs(Math.round(change))}% increase in delivery rate`;
      case 'declining':
        return `Performance is declining with a ${Math.abs(Math.round(change))}% decrease in delivery rate`;
      case 'stable':
        return 'Performance is stable with minimal change in delivery rate';
      default:
        return 'Insufficient data for trend analysis';
    }
  }

  /**
   * Update current metrics (force refresh)
   * @private
   */
  async updateCurrentMetrics(trackingId) {
    const trackingSession = this.trackingSessions.get(trackingId);
    if (!trackingSession) return;

    // Force immediate metric collection
    const channels = trackingSession.channels.map(type => ({ type }));
    await this.collectMetrics(trackingId, channels, trackingSession.channelResults, this.logger);
  }

  /**
   * Stop tracking campaign performance
   * @param {string} orchestrationId - Campaign orchestration ID
   * @returns {Object} Stop tracking result
   */
  async stopTracking(orchestrationId) {
    const trackingSession = Array.from(this.trackingSessions.values())
      .find(session => session.orchestrationId === orchestrationId);

    if (!trackingSession) {
      return {
        success: false,
        error: `No tracking session found for orchestration: ${orchestrationId}`,
      };
    }

    const trackingId = trackingSession.trackingId;

    // Clear metric collection interval
    const interval = this.metricIntervals.get(trackingId);
    if (interval) {
      clearInterval(interval);
      this.metricIntervals.delete(trackingId);
    }

    // Update session status
    trackingSession.status = 'stopped';
    trackingSession.stopTime = Date.now();

    this.logger.info('Performance tracking stopped', {
      trackingId,
      orchestrationId,
      duration: trackingSession.stopTime - trackingSession.startTime,
    });

    return {
      success: true,
      trackingId,
      orchestrationId,
      finalMetrics: this.performanceData.get(trackingId),
      duration: trackingSession.stopTime - trackingSession.startTime,
    };
  }

  /**
   * Get performance tracker health status
   */
  getHealthStatus() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      activeTrackingSessions: this.trackingSessions.size,
      activeIntervals: this.metricIntervals.size,
      performanceDataSize: this.performanceData.size,
    };
  }

  /**
   * Shutdown performance tracker
   */
  async shutdown() {
    this.logger.info('Shutting down performance tracker');

    try {
      // Clear all intervals
      for (const interval of this.metricIntervals.values()) {
        clearInterval(interval);
      }

      this.metricIntervals.clear();
      this.trackingSessions.clear();
      this.performanceData.clear();

      this.logger.info('Performance tracker shutdown complete');
    } catch (error) {
      this.logger.error('Error during performance tracker shutdown', { error: error.message });
    }
  }
}

export default PerformanceTracker;