/**
 * Comprehensive Alert Management System
 * Handles alerts from all monitoring components with intelligent routing and escalation
 */

import axios from 'axios';
import { metricsCollector } from './metrics-collector.js';
import { createServiceLogger } from './logger.js';
import EventEmitter from 'events';

const logger = createServiceLogger('alert-manager');

class AlertManager extends EventEmitter {
  constructor() {
    super();
    
    // Alert configuration
    this.alertRules = new Map();
    this.alertChannels = new Map();
    this.activeAlerts = new Map();
    this.alertHistory = new Map();
    this.escalationPolicies = new Map();
    
    // Alert state management
    this.suppressions = new Map();
    this.maintenanceWindows = new Map();
    this.alertGroups = new Map();
    
    // Processing intervals
    this.processingInterval = null;
    this.cleanupInterval = null;
    this.escalationInterval = null;
    
    this.initializeAlertRules();
    this.initializeAlertChannels();
    this.initializeEscalationPolicies();
    this.startProcessing();
  }

  /**
   * Initialize alert rules for different systems
   */
  initializeAlertRules() {
    const rules = {
      // System Health Rules
      'system.cpu.high': {
        name: 'High CPU Usage',
        description: 'System CPU usage is above threshold',
        category: 'system',
        severity: 'warning',
        threshold: 85,
        duration: 300000, // 5 minutes
        condition: (metrics) => metrics.cpu > 85,
        tags: ['performance', 'resource']
      },
      
      'system.memory.high': {
        name: 'High Memory Usage',
        description: 'System memory usage is above threshold',
        category: 'system',
        severity: 'warning',
        threshold: 90,
        duration: 300000,
        condition: (metrics) => metrics.memory > 90,
        tags: ['performance', 'resource']
      },
      
      'system.disk.high': {
        name: 'High Disk Usage',
        description: 'Disk usage is above threshold',
        category: 'system',
        severity: 'critical',
        threshold: 85,
        duration: 600000, // 10 minutes
        condition: (metrics) => metrics.disk > 85,
        tags: ['storage', 'resource']
      },
      
      // Workflow Rules
      'workflow.stuck': {
        name: 'Stuck Workflow',
        description: 'Workflow has been running for too long',
        category: 'workflow',
        severity: 'warning',
        threshold: 3600000, // 1 hour
        condition: (data) => data.duration > 3600000,
        tags: ['workflow', 'performance']
      },
      
      'workflow.failure_rate': {
        name: 'High Workflow Failure Rate',
        description: 'Workflow failure rate is above threshold',
        category: 'workflow',
        severity: 'critical',
        threshold: 0.1, // 10%
        duration: 900000, // 15 minutes
        condition: (metrics) => metrics.errorRate > 0.1,
        tags: ['workflow', 'reliability']
      },
      
      // Worker Rules
      'worker.unhealthy': {
        name: 'Unhealthy Worker',
        description: 'Worker is reporting unhealthy status',
        category: 'worker',
        severity: 'warning',
        condition: (data) => data.status === 'unhealthy',
        tags: ['worker', 'health']
      },
      
      'worker.consecutive_failures': {
        name: 'Worker Consecutive Failures',
        description: 'Worker has consecutive task failures',
        category: 'worker',
        severity: 'critical',
        threshold: 5,
        condition: (data) => data.consecutiveFailures >= 5,
        tags: ['worker', 'reliability']
      },
      
      'worker.queue_depth': {
        name: 'High Queue Depth',
        description: 'Worker queue depth is above threshold',
        category: 'worker',
        severity: 'warning',
        threshold: 1000,
        duration: 600000, // 10 minutes
        condition: (data) => data.queueDepth > 1000,
        tags: ['worker', 'performance']
      },
      
      // API Rules
      'api.rate_limit': {
        name: 'API Rate Limit Hit',
        description: 'API rate limit has been exceeded',
        category: 'api',
        severity: 'warning',
        condition: (data) => data.rateLimitHit === true,
        tags: ['api', 'limits']
      },
      
      'api.circuit_breaker': {
        name: 'API Circuit Breaker Open',
        description: 'API circuit breaker is open due to failures',
        category: 'api',
        severity: 'critical',
        condition: (data) => data.circuitBreakerState === 'open',
        tags: ['api', 'availability']
      },
      
      'api.high_error_rate': {
        name: 'High API Error Rate',
        description: 'API error rate is above threshold',
        category: 'api',
        severity: 'warning',
        threshold: 0.05, // 5%
        duration: 600000, // 10 minutes
        condition: (metrics) => metrics.errorRate > 0.05,
        tags: ['api', 'reliability']
      },
      
      'api.slow_response': {
        name: 'Slow API Response',
        description: 'API response time is above threshold',
        category: 'api',
        severity: 'warning',
        threshold: 30000, // 30 seconds
        condition: (data) => data.responseTime > 30000,
        tags: ['api', 'performance']
      },
      
      // Cost Rules
      'cost.budget_warning': {
        name: 'Cost Budget Warning',
        description: 'Cost is approaching budget limit',
        category: 'cost',
        severity: 'warning',
        threshold: 0.75, // 75%
        condition: (data) => data.percentage >= 0.75,
        tags: ['cost', 'budget']
      },
      
      'cost.budget_critical': {
        name: 'Cost Budget Critical',
        description: 'Cost has exceeded critical budget threshold',
        category: 'cost',
        severity: 'critical',
        threshold: 0.90, // 90%
        condition: (data) => data.percentage >= 0.90,
        tags: ['cost', 'budget']
      },
      
      'cost.budget_emergency': {
        name: 'Cost Budget Emergency',
        description: 'Cost has exceeded emergency budget threshold',
        category: 'cost',
        severity: 'critical',
        threshold: 0.95, // 95%
        condition: (data) => data.percentage >= 0.95,
        tags: ['cost', 'budget', 'emergency']
      },
      
      // Database Rules
      'database.connection_pool': {
        name: 'Database Connection Pool Exhausted',
        description: 'Database connection pool is nearly exhausted',
        category: 'database',
        severity: 'critical',
        threshold: 0.9, // 90% of pool
        condition: (metrics) => metrics.connectionUsage > 0.9,
        tags: ['database', 'connections']
      },
      
      'database.slow_query': {
        name: 'Slow Database Query',
        description: 'Database query execution time is above threshold',
        category: 'database',
        severity: 'warning',
        threshold: 5000, // 5 seconds
        condition: (data) => data.queryTime > 5000,
        tags: ['database', 'performance']
      },
      
      // Security Rules
      'security.suspicious_activity': {
        name: 'Suspicious Activity Detected',
        description: 'Potentially malicious activity detected',
        category: 'security',
        severity: 'critical',
        condition: (data) => data.suspicious === true,
        tags: ['security', 'threat']
      },
      
      'security.authentication_failures': {
        name: 'Multiple Authentication Failures',
        description: 'Multiple authentication failures from same source',
        category: 'security',
        severity: 'warning',
        threshold: 5,
        duration: 300000, // 5 minutes
        condition: (data) => data.failureCount >= 5,
        tags: ['security', 'authentication']
      }
    };

    for (const [ruleId, rule] of Object.entries(rules)) {
      this.alertRules.set(ruleId, {
        id: ruleId,
        ...rule,
        enabled: true,
        lastTriggered: null,
        triggerCount: 0
      });
    }

    logger.info('Alert rules initialized', { 
      ruleCount: this.alertRules.size 
    });
  }

  /**
   * Initialize alert channels for notifications
   */
  initializeAlertChannels() {
    const channels = {
      slack: {
        name: 'Slack',
        type: 'webhook',
        url: process.env.SLACK_WEBHOOK_URL,
        enabled: !!process.env.SLACK_WEBHOOK_URL,
        format: 'slack',
        severities: ['warning', 'critical'],
        categories: ['all'],
        send: async (alert, channel) => {
          if (!channel.url) return false;
          
          const color = this.getSeverityColor(alert.severity);
          const emoji = this.getSeverityEmoji(alert.severity);
          
          const payload = {
            text: `${emoji} Alert: ${alert.title}`,
            attachments: [{
              color,
              fields: [
                { title: 'Severity', value: alert.severity.toUpperCase(), short: true },
                { title: 'Category', value: alert.category, short: true },
                { title: 'Service', value: alert.source || 'Unknown', short: true },
                { title: 'Time', value: new Date(alert.timestamp).toISOString(), short: true },
                { title: 'Description', value: alert.description, short: false }
              ],
              footer: 'Connexio AI Monitoring',
              ts: Math.floor(alert.timestamp / 1000)
            }]
          };
          
          if (alert.details) {
            payload.attachments[0].fields.push({
              title: 'Details',
              value: JSON.stringify(alert.details, null, 2),
              short: false
            });
          }
          
          try {
            const response = await axios.post(channel.url, payload, {
              headers: { 'Content-Type': 'application/json' },
              timeout: 10000
            });
            return response.status === 200;
          } catch (error) {
            logger.error('Failed to send Slack alert', {
              error: error.message,
              alertId: alert.id
            });
            return false;
          }
        }
      },
      
      pagerduty: {
        name: 'PagerDuty',
        type: 'api',
        integrationKey: process.env.PAGERDUTY_INTEGRATION_KEY,
        enabled: !!process.env.PAGERDUTY_INTEGRATION_KEY,
        severities: ['critical'],
        categories: ['system', 'workflow', 'api', 'database', 'security'],
        send: async (alert, channel) => {
          if (!channel.integrationKey) return false;
          
          const payload = {
            routing_key: channel.integrationKey,
            event_action: 'trigger',
            dedup_key: alert.id,
            payload: {
              summary: `${alert.title}: ${alert.description}`,
              severity: alert.severity,
              source: alert.source || 'connexio-ai',
              component: alert.category,
              group: 'connexio-ai-alerts',
              class: alert.ruleId,
              custom_details: alert.details || {}
            }
          };
          
          try {
            const response = await axios.post('https://events.pagerduty.com/v2/enqueue', payload, {
              headers: { 'Content-Type': 'application/json' },
              timeout: 10000
            });
            return response.status === 202;
          } catch (error) {
            logger.error('Failed to send PagerDuty alert', {
              error: error.message,
              alertId: alert.id
            });
            return false;
          }
        }
      },
      
      email: {
        name: 'Email',
        type: 'smtp',
        enabled: false, // Requires SMTP configuration
        severities: ['critical'],
        categories: ['system', 'security'],
        recipients: process.env.ALERT_EMAIL_RECIPIENTS?.split(',') || [],
        send: async (alert, channel) => {
          // Email implementation would go here
          logger.info('Email alert not implemented', { alertId: alert.id });
          return false;
        }
      },
      
      webhook: {
        name: 'Generic Webhook',
        type: 'webhook',
        url: process.env.ALERT_WEBHOOK_URL,
        enabled: !!process.env.ALERT_WEBHOOK_URL,
        severities: ['warning', 'critical'],
        categories: ['all'],
        send: async (alert, channel) => {
          if (!channel.url) return false;
          
          try {
            const response = await axios.post(channel.url, alert, {
              headers: { 'Content-Type': 'application/json' },
              timeout: 10000
            });
            return response.status >= 200 && response.status < 300;
          } catch (error) {
            logger.error('Failed to send webhook alert', {
              error: error.message,
              alertId: alert.id
            });
            return false;
          }
        }
      }
    };

    for (const [channelId, channel] of Object.entries(channels)) {
      if (channel.enabled) {
        this.alertChannels.set(channelId, channel);
      }
    }

    logger.info('Alert channels initialized', { 
      enabledChannels: Array.from(this.alertChannels.keys()) 
    });
  }

  /**
   * Initialize escalation policies
   */
  initializeEscalationPolicies() {
    const policies = {
      default: {
        name: 'Default Escalation',
        steps: [
          { delay: 0, channels: ['slack'] },
          { delay: 300000, channels: ['pagerduty'], condition: 'unresolved' }, // 5 minutes
          { delay: 900000, channels: ['email'], condition: 'unresolved' } // 15 minutes
        ]
      },
      
      critical: {
        name: 'Critical Escalation',
        steps: [
          { delay: 0, channels: ['slack', 'pagerduty'] },
          { delay: 180000, channels: ['email'], condition: 'unresolved' } // 3 minutes
        ]
      },
      
      security: {
        name: 'Security Escalation',
        steps: [
          { delay: 0, channels: ['slack', 'pagerduty', 'email'] }
        ]
      },
      
      cost: {
        name: 'Cost Escalation',
        steps: [
          { delay: 0, channels: ['slack'] },
          { delay: 600000, channels: ['email'], condition: 'unresolved' } // 10 minutes
        ]
      }
    };

    for (const [policyId, policy] of Object.entries(policies)) {
      this.escalationPolicies.set(policyId, policy);
    }

    logger.info('Escalation policies initialized', { 
      policyCount: this.escalationPolicies.size 
    });
  }

  /**
   * Process incoming alert data
   */
  processAlert(ruleId, data, source = 'unknown') {
    const rule = this.alertRules.get(ruleId);
    if (!rule || !rule.enabled) {
      return null;
    }

    // Check if alert condition is met
    if (!rule.condition(data)) {
      return null;
    }

    // Check for existing alert
    const existingAlert = this.activeAlerts.get(ruleId);
    if (existingAlert) {
      // Update existing alert
      existingAlert.lastSeen = Date.now();
      existingAlert.occurrenceCount++;
      existingAlert.data = data;
      return existingAlert;
    }

    // Create new alert
    const alert = {
      id: `${ruleId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ruleId,
      title: rule.name,
      description: rule.description,
      category: rule.category,
      severity: rule.severity,
      source,
      timestamp: Date.now(),
      lastSeen: Date.now(),
      occurrenceCount: 1,
      status: 'active',
      data,
      details: this.extractAlertDetails(rule, data),
      tags: rule.tags || [],
      escalationPolicy: this.getEscalationPolicy(rule),
      escalationStep: 0,
      nextEscalation: null,
      notifications: []
    };

    // Set next escalation time
    this.scheduleEscalation(alert);

    // Store alert
    this.activeAlerts.set(ruleId, alert);
    
    // Update rule statistics
    rule.lastTriggered = alert.timestamp;
    rule.triggerCount++;

    // Record metrics
    metricsCollector.recordAlert(rule.category, rule.severity, source);

    // Emit event
    this.emit('alert:created', alert);

    logger.warn('Alert created', {
      alertId: alert.id,
      ruleId,
      severity: alert.severity,
      category: alert.category,
      source
    });

    return alert;
  }

  /**
   * Extract relevant details from alert data
   */
  extractAlertDetails(rule, data) {
    const details = {};
    
    // Extract key metrics based on rule type
    if (rule.threshold !== undefined) {
      details.threshold = rule.threshold;
      details.currentValue = this.extractCurrentValue(rule, data);
    }
    
    if (data.duration !== undefined) {
      details.duration = data.duration;
    }
    
    if (data.errorRate !== undefined) {
      details.errorRate = (data.errorRate * 100).toFixed(2) + '%';
    }
    
    if (data.responseTime !== undefined) {
      details.responseTime = `${data.responseTime}ms`;
    }
    
    if (data.percentage !== undefined) {
      details.percentage = (data.percentage * 100).toFixed(2) + '%';
    }
    
    // Add context-specific details
    if (rule.category === 'worker') {
      details.workerId = data.workerId;
      details.workerType = data.workerType;
    }
    
    if (rule.category === 'api') {
      details.provider = data.providerId;
      details.endpoint = data.endpoint;
    }
    
    if (rule.category === 'workflow') {
      details.workflowId = data.workflowId;
      details.workflowName = data.workflowName;
    }
    
    return details;
  }

  /**
   * Extract current value for threshold comparison
   */
  extractCurrentValue(rule, data) {
    // Map rule types to data fields
    const valueMap = {
      'system.cpu.high': data.cpu,
      'system.memory.high': data.memory,
      'system.disk.high': data.disk,
      'workflow.failure_rate': data.errorRate,
      'worker.consecutive_failures': data.consecutiveFailures,
      'worker.queue_depth': data.queueDepth,
      'api.high_error_rate': data.errorRate,
      'api.slow_response': data.responseTime,
      'cost.budget_warning': data.percentage,
      'cost.budget_critical': data.percentage,
      'cost.budget_emergency': data.percentage
    };
    
    return valueMap[rule.id] || 'unknown';
  }

  /**
   * Get escalation policy for a rule
   */
  getEscalationPolicy(rule) {
    if (rule.category === 'security') return 'security';
    if (rule.category === 'cost') return 'cost';
    if (rule.severity === 'critical') return 'critical';
    return 'default';
  }

  /**
   * Schedule escalation for an alert
   */
  scheduleEscalation(alert) {
    const policy = this.escalationPolicies.get(alert.escalationPolicy);
    if (!policy || alert.escalationStep >= policy.steps.length) {
      return;
    }

    const step = policy.steps[alert.escalationStep];
    alert.nextEscalation = Date.now() + step.delay;
  }

  /**
   * Send alert notifications
   */
  async sendNotifications(alert) {
    const policy = this.escalationPolicies.get(alert.escalationPolicy);
    if (!policy || alert.escalationStep >= policy.steps.length) {
      return;
    }

    const step = policy.steps[alert.escalationStep];
    const notifications = [];

    for (const channelId of step.channels) {
      const channel = this.alertChannels.get(channelId);
      if (!channel) continue;

      // Check if channel should receive this alert
      if (!this.shouldSendToChannel(alert, channel)) {
        continue;
      }

      try {
        const success = await channel.send(alert, channel);
        notifications.push({
          channel: channelId,
          timestamp: Date.now(),
          success,
          escalationStep: alert.escalationStep
        });

        if (success) {
          logger.info('Alert notification sent', {
            alertId: alert.id,
            channel: channelId,
            escalationStep: alert.escalationStep
          });
        } else {
          logger.error('Failed to send alert notification', {
            alertId: alert.id,
            channel: channelId
          });
        }
      } catch (error) {
        logger.error('Error sending alert notification', {
          alertId: alert.id,
          channel: channelId,
          error: error.message
        });
        
        notifications.push({
          channel: channelId,
          timestamp: Date.now(),
          success: false,
          error: error.message,
          escalationStep: alert.escalationStep
        });
      }
    }

    alert.notifications.push(...notifications);
    return notifications;
  }

  /**
   * Check if alert should be sent to a specific channel
   */
  shouldSendToChannel(alert, channel) {
    // Check severity
    if (!channel.severities.includes(alert.severity)) {
      return false;
    }

    // Check category
    if (!channel.categories.includes('all') && !channel.categories.includes(alert.category)) {
      return false;
    }

    // Check suppression
    if (this.isSuppressed(alert)) {
      return false;
    }

    // Check maintenance window
    if (this.inMaintenanceWindow(alert)) {
      return false;
    }

    return true;
  }

  /**
   * Check if alert is suppressed
   */
  isSuppressed(alert) {
    for (const [suppressionId, suppression] of this.suppressions.entries()) {
      if (suppression.ruleId === alert.ruleId || 
          suppression.category === alert.category ||
          suppression.source === alert.source) {
        
        if (Date.now() < suppression.expiresAt) {
          return true;
        } else {
          // Remove expired suppression
          this.suppressions.delete(suppressionId);
        }
      }
    }
    return false;
  }

  /**
   * Check if system is in maintenance window
   */
  inMaintenanceWindow(alert) {
    const now = Date.now();
    
    for (const [windowId, window] of this.maintenanceWindows.entries()) {
      if (now >= window.startTime && now <= window.endTime) {
        if (window.categories.includes('all') || 
            window.categories.includes(alert.category)) {
          return true;
        }
      } else if (now > window.endTime) {
        // Remove expired maintenance window
        this.maintenanceWindows.delete(windowId);
      }
    }
    
    return false;
  }

  /**
   * Resolve an alert
   */
  resolveAlert(ruleId, reason = 'resolved') {
    const alert = this.activeAlerts.get(ruleId);
    if (!alert) return null;

    alert.status = 'resolved';
    alert.resolvedAt = Date.now();
    alert.resolveReason = reason;

    // Move to history
    if (!this.alertHistory.has(ruleId)) {
      this.alertHistory.set(ruleId, []);
    }
    
    const history = this.alertHistory.get(ruleId);
    history.push(alert);
    
    // Keep only last 100 alerts per rule
    if (history.length > 100) {
      history.shift();
    }

    // Remove from active alerts
    this.activeAlerts.delete(ruleId);

    // Send resolution notification to PagerDuty
    this.sendResolutionNotification(alert);

    this.emit('alert:resolved', alert);

    logger.info('Alert resolved', {
      alertId: alert.id,
      ruleId,
      reason,
      duration: alert.resolvedAt - alert.timestamp
    });

    return alert;
  }

  /**
   * Send resolution notification
   */
  async sendResolutionNotification(alert) {
    const pagerdutyChannel = this.alertChannels.get('pagerduty');
    if (pagerdutyChannel && pagerdutyChannel.enabled) {
      const payload = {
        routing_key: pagerdutyChannel.integrationKey,
        event_action: 'resolve',
        dedup_key: alert.id
      };

      try {
        await axios.post('https://events.pagerduty.com/v2/enqueue', payload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000
        });
      } catch (error) {
        logger.error('Failed to send PagerDuty resolution', {
          error: error.message,
          alertId: alert.id
        });
      }
    }
  }

  /**
   * Create alert suppression
   */
  createSuppression(options) {
    const suppression = {
      id: `suppression-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ruleId: options.ruleId,
      category: options.category,
      source: options.source,
      reason: options.reason || 'manual suppression',
      createdAt: Date.now(),
      expiresAt: Date.now() + (options.duration || 3600000), // 1 hour default
      createdBy: options.createdBy || 'system'
    };

    this.suppressions.set(suppression.id, suppression);

    logger.info('Alert suppression created', suppression);

    return suppression;
  }

  /**
   * Create maintenance window
   */
  createMaintenanceWindow(options) {
    const window = {
      id: `maint-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: options.name || 'Maintenance Window',
      description: options.description || '',
      startTime: options.startTime || Date.now(),
      endTime: options.endTime || (Date.now() + 3600000), // 1 hour default
      categories: options.categories || ['all'],
      createdAt: Date.now(),
      createdBy: options.createdBy || 'system'
    };

    this.maintenanceWindows.set(window.id, window);

    logger.info('Maintenance window created', window);

    return window;
  }

  /**
   * Get severity color for notifications
   */
  getSeverityColor(severity) {
    const colors = {
      info: '#36a64f',      // green
      warning: '#ff9500',   // orange
      critical: '#ff0000'   // red
    };
    return colors[severity] || '#808080'; // gray
  }

  /**
   * Get severity emoji for notifications
   */
  getSeverityEmoji(severity) {
    const emojis = {
      info: 'ℹ️',
      warning: '⚠️',
      critical: '🚨'
    };
    return emojis[severity] || '📢';
  }

  /**
   * Process escalations
   */
  async processEscalations() {
    const now = Date.now();
    
    for (const alert of this.activeAlerts.values()) {
      if (alert.nextEscalation && now >= alert.nextEscalation) {
        await this.sendNotifications(alert);
        
        // Move to next escalation step
        alert.escalationStep++;
        this.scheduleEscalation(alert);
        
        if (alert.nextEscalation) {
          logger.info('Alert escalated', {
            alertId: alert.id,
            escalationStep: alert.escalationStep
          });
        }
      }
    }
  }

  /**
   * Start alert processing
   */
  startProcessing() {
    // Process escalations every minute
    this.escalationInterval = setInterval(() => {
      this.processEscalations();
    }, 60000);

    // Cleanup expired data every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 3600000);

    logger.info('Started alert processing');
  }

  /**
   * Cleanup expired data
   */
  cleanup() {
    const now = Date.now();
    const maxAge = 86400000; // 24 hours

    // Clean up expired suppressions
    for (const [id, suppression] of this.suppressions.entries()) {
      if (now > suppression.expiresAt) {
        this.suppressions.delete(id);
      }
    }

    // Clean up expired maintenance windows
    for (const [id, window] of this.maintenanceWindows.entries()) {
      if (now > window.endTime) {
        this.maintenanceWindows.delete(id);
      }
    }

    // Clean up old alert history
    for (const [ruleId, history] of this.alertHistory.entries()) {
      const filtered = history.filter(alert => 
        (now - alert.timestamp) < (7 * 24 * 60 * 60 * 1000) // 7 days
      );
      this.alertHistory.set(ruleId, filtered);
    }
  }

  /**
   * Stop alert processing
   */
  stopProcessing() {
    if (this.escalationInterval) {
      clearInterval(this.escalationInterval);
      this.escalationInterval = null;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    logger.info('Stopped alert processing');
  }

  /**
   * Get alert statistics
   */
  getAlertStats() {
    const stats = {
      activeAlerts: this.activeAlerts.size,
      totalRules: this.alertRules.size,
      enabledRules: Array.from(this.alertRules.values()).filter(r => r.enabled).length,
      activeSuppressions: this.suppressions.size,
      activeMaintenanceWindows: this.maintenanceWindows.size,
      alertsByCategory: {},
      alertsBySeverity: {},
      totalNotificationsSent: 0
    };

    // Analyze active alerts
    for (const alert of this.activeAlerts.values()) {
      stats.alertsByCategory[alert.category] = (stats.alertsByCategory[alert.category] || 0) + 1;
      stats.alertsBySeverity[alert.severity] = (stats.alertsBySeverity[alert.severity] || 0) + 1;
      stats.totalNotificationsSent += alert.notifications.length;
    }

    return stats;
  }

  /**
   * Generate alert report
   */
  generateReport(timeWindow = 86400000) { // 24 hours default
    const now = Date.now();
    const cutoff = now - timeWindow;
    
    const report = {
      timestamp: now,
      timeWindow,
      summary: this.getAlertStats(),
      activeAlerts: Array.from(this.activeAlerts.values()),
      recentAlerts: [],
      topAlertRules: [],
      channelPerformance: {}
    };

    // Collect recent resolved alerts
    for (const history of this.alertHistory.values()) {
      for (const alert of history) {
        if (alert.timestamp >= cutoff) {
          report.recentAlerts.push(alert);
        }
      }
    }

    // Find top alert rules by trigger count
    const sortedRules = Array.from(this.alertRules.values())
      .sort((a, b) => b.triggerCount - a.triggerCount)
      .slice(0, 10);
    
    report.topAlertRules = sortedRules.map(rule => ({
      id: rule.id,
      name: rule.name,
      category: rule.category,
      severity: rule.severity,
      triggerCount: rule.triggerCount,
      lastTriggered: rule.lastTriggered
    }));

    // Channel performance
    for (const [channelId, channel] of this.alertChannels.entries()) {
      let totalSent = 0;
      let totalSuccessful = 0;
      
      for (const alert of [...this.activeAlerts.values(), ...report.recentAlerts]) {
        for (const notification of alert.notifications) {
          if (notification.channel === channelId) {
            totalSent++;
            if (notification.success) totalSuccessful++;
          }
        }
      }
      
      report.channelPerformance[channelId] = {
        totalSent,
        totalSuccessful,
        successRate: totalSent > 0 ? (totalSuccessful / totalSent) * 100 : 0
      };
    }

    return report;
  }
}

// Export singleton instance
const alertManager = new AlertManager();

export { AlertManager, alertManager };
export default alertManager;