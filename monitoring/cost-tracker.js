/**
 * API Cost Tracking and Budget Management System
 * Comprehensive cost tracking for all external API usage
 */

import { metricsCollector } from './metrics-collector.js';
import { createServiceLogger } from './logger.js';
import EventEmitter from 'events';

const logger = createServiceLogger('cost-tracker');

class CostTracker extends EventEmitter {
  constructor() {
    super();
    
    // Cost tracking data
    this.costData = new Map();
    this.budgets = new Map();
    this.costHistory = new Map();
    this.alerts = new Map();
    
    // Cost calculation rules
    this.costRules = new Map();
    
    // Monitoring intervals
    this.trackingInterval = null;
    this.budgetCheckInterval = null;
    this.reportingInterval = null;
    
    this.initializeCostRules();
    this.initializeBudgets();
    this.startTracking();
  }

  /**
   * Initialize cost calculation rules for each API provider
   */
  initializeCostRules() {
    const rules = {
      anthropic: {
        provider: 'Anthropic Claude',
        currency: 'USD',
        billing: 'token-based',
        models: {
          'claude-3-5-sonnet-20241022': {
            input_cost_per_token: 0.000003,
            output_cost_per_token: 0.000015,
            max_tokens: 200000
          },
          'claude-3-haiku-20240307': {
            input_cost_per_token: 0.00000025,
            output_cost_per_token: 0.00000125,
            max_tokens: 200000
          }
        },
        calculateCost: (usage) => {
          const model = usage.model || 'claude-3-5-sonnet-20241022';
          const modelConfig = rules.anthropic.models[model];
          if (!modelConfig) return 0;
          
          const inputCost = (usage.input_tokens || 0) * modelConfig.input_cost_per_token;
          const outputCost = (usage.output_tokens || 0) * modelConfig.output_cost_per_token;
          
          return inputCost + outputCost;
        }
      },
      
      slack: {
        provider: 'Slack API',
        currency: 'USD',
        billing: 'request-based',
        rates: {
          message_send: 0.0001,
          file_upload: 0.0002,
          channel_create: 0.0005,
          user_lookup: 0.00005,
          base_request: 0.00001
        },
        calculateCost: (usage) => {
          const operation = usage.operation || 'base_request';
          const rate = rules.slack.rates[operation] || rules.slack.rates.base_request;
          return rate * (usage.count || 1);
        }
      },
      
      twilio: {
        provider: 'Twilio',
        currency: 'USD',
        billing: 'usage-based',
        rates: {
          sms_us: 0.0075,
          sms_international: 0.05,
          mms_us: 0.02,
          mms_international: 0.06,
          voice_minute_us: 0.013,
          voice_minute_international: 0.05,
          lookup: 0.005
        },
        calculateCost: (usage) => {
          const service = usage.service || 'sms_us';
          const rate = rules.twilio.rates[service] || 0;
          const units = usage.units || 1;
          
          if (service.includes('voice')) {
            // Voice is billed per minute
            return rate * Math.ceil(units / 60);
          }
          
          return rate * units;
        }
      },
      
      apollo: {
        provider: 'Apollo.io',
        currency: 'USD',
        billing: 'credit-based',
        rates: {
          person_enrichment: 0.02,
          company_enrichment: 0.03,
          person_search: 0.05,
          company_search: 0.07,
          email_finder: 0.01,
          phone_finder: 0.02,
          technographics: 0.04
        },
        calculateCost: (usage) => {
          const operation = usage.operation || 'person_enrichment';
          const rate = rules.apollo.rates[operation] || 0;
          return rate * (usage.credits || 1);
        }
      },
      
      leadspace: {
        provider: 'Leadspace',
        currency: 'USD',
        billing: 'enrichment-based',
        rates: {
          basic_enrichment: 0.03,
          premium_enrichment: 0.08,
          company_enrichment: 0.05,
          intent_data: 0.12,
          technographics: 0.06
        },
        calculateCost: (usage) => {
          const enrichmentType = usage.enrichment_type || 'basic_enrichment';
          const rate = rules.leadspace.rates[enrichmentType] || 0;
          return rate * (usage.records || 1);
        }
      },
      
      sureshot: {
        provider: 'Sureshot',
        currency: 'USD',
        billing: 'campaign-based',
        rates: {
          email_send: 0.001,
          campaign_setup: 0.10,
          template_processing: 0.02,
          analytics_report: 0.05,
          a_b_test: 0.15
        },
        calculateCost: (usage) => {
          const operation = usage.operation || 'email_send';
          const rate = rules.sureshot.rates[operation] || 0;
          return rate * (usage.count || 1);
        }
      },
      
      microsoft: {
        provider: 'Microsoft Graph',
        currency: 'USD',
        billing: 'request-based',
        rates: {
          graph_request: 0.0005,
          teams_message: 0.001,
          calendar_access: 0.0008,
          file_access: 0.0003,
          user_lookup: 0.0002
        },
        calculateCost: (usage) => {
          const operation = usage.operation || 'graph_request';
          const rate = rules.microsoft.rates[operation] || 0;  
          return rate * (usage.requests || 1);
        }
      }
    };

    for (const [providerId, rule] of Object.entries(rules)) {
      this.costRules.set(providerId, rule);
    }

    logger.info('Cost calculation rules initialized', { 
      providers: Object.keys(rules) 
    });
  }

  /**
   * Initialize budget configurations
   */
  initializeBudgets() {
    const budgets = {
      anthropic: {
        daily: 50.00,
        monthly: 1000.00,
        yearly: 10000.00,
        alerts: {
          warning: 0.75, // 75% of budget
          critical: 0.90, // 90% of budget
          emergency: 0.95 // 95% of budget
        }
      },
      
      slack: {
        daily: 5.00,
        monthly: 100.00,
        yearly: 1000.00,
        alerts: {
          warning: 0.80,
          critical: 0.90,
          emergency: 0.95
        }
      },
      
      twilio: {
        daily: 25.00,
        monthly: 500.00,
        yearly: 5000.00,
        alerts: {
          warning: 0.75,
          critical: 0.85,
          emergency: 0.95
        }
      },
      
      apollo: {
        daily: 100.00,
        monthly: 2000.00,
        yearly: 20000.00,
        alerts: {
          warning: 0.70,
          critical: 0.85,
          emergency: 0.95
        }
      },
      
      leadspace: {
        daily: 75.00,
        monthly: 1500.00,
        yearly: 15000.00,
        alerts: {
          warning: 0.70,
          critical: 0.85,
          emergency: 0.95
        }
      },
      
      sureshot: {
        daily: 30.00,
        monthly: 600.00,
        yearly: 6000.00,
        alerts: {
          warning: 0.75,
          critical: 0.90,
          emergency: 0.95
        }
      },
      
      microsoft: {
        daily: 10.00,
        monthly: 200.00,
        yearly: 2000.00,
        alerts: {
          warning: 0.80,
          critical: 0.90,
          emergency: 0.95
        }
      },
      
      total: {
        daily: 295.00,
        monthly: 6000.00,
        yearly: 60000.00,
        alerts: {
          warning: 0.75,
          critical: 0.85,
          emergency: 0.95
        }
      }
    };

    for (const [providerId, budget] of Object.entries(budgets)) {
      this.budgets.set(providerId, {
        ...budget,
        current: {
          daily: 0,
          monthly: 0,
          yearly: 0
        },
        resetTimes: {
          daily: this.getNextResetTime('daily'),
          monthly: this.getNextResetTime('monthly'),
          yearly: this.getNextResetTime('yearly')
        }
      });

      // Initialize cost tracking
      this.costData.set(providerId, {
        providerId,
        totalCost: 0,
        dailyCost: 0,
        monthlyCost: 0,
        yearlyCost: 0,
        lastReset: {
          daily: Date.now(),
          monthly: Date.now(),
          yearly: Date.now()
        },
        transactions: [],
        breakdown: new Map()
      });
    }

    logger.info('Budget configurations initialized', { 
      providers: Object.keys(budgets) 
    });
  }

  /**
   * Get next reset time for budget periods
   */
  getNextResetTime(period) {
    const now = new Date();
    
    switch (period) {
      case 'daily':
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        return tomorrow.getTime();
        
      case 'monthly':
        const nextMonth = new Date(now);
        nextMonth.setMonth(now.getMonth() + 1, 1);
        nextMonth.setHours(0, 0, 0, 0);
        return nextMonth.getTime();
        
      case 'yearly':
        const nextYear = new Date(now);
        nextYear.setFullYear(now.getFullYear() + 1, 0, 1);
        nextYear.setHours(0, 0, 0, 0);
        return nextYear.getTime();
        
      default:
        return Date.now() + 86400000; // 24 hours
    }
  }

  /**
   * Record API usage and calculate cost
   */
  recordUsage(providerId, usage) {
    const costRule = this.costRules.get(providerId);
    if (!costRule) {
      logger.warn('No cost rule found for provider', { providerId });
      return 0;
    }

    const cost = costRule.calculateCost(usage);
    const timestamp = Date.now();

    // Create transaction record
    const transaction = {
      id: `${providerId}-${timestamp}-${Math.random().toString(36).substr(2, 9)}`,
      providerId,
      timestamp,
      cost,
      currency: costRule.currency,
      usage,
      operation: usage.operation || 'unknown',
      metadata: usage.metadata || {}
    };

    // Update cost data
    const costData = this.costData.get(providerId);
    if (costData) {
      costData.totalCost += cost;
      costData.dailyCost += cost;
      costData.monthlyCost += cost;
      costData.yearlyCost += cost;
      costData.transactions.push(transaction);

      // Keep only last 10000 transactions per provider
      if (costData.transactions.length > 10000) {
        costData.transactions = costData.transactions.slice(-10000);
      }

      // Update breakdown by operation
      const operation = transaction.operation;
      if (!costData.breakdown.has(operation)) {
        costData.breakdown.set(operation, {
          operation,
          totalCost: 0,
          count: 0,
          avgCost: 0
        });
      }

      const breakdown = costData.breakdown.get(operation);
      breakdown.totalCost += cost;
      breakdown.count += 1;
      breakdown.avgCost = breakdown.totalCost / breakdown.count;
    }

    // Update budget tracking
    const budget = this.budgets.get(providerId);
    if (budget) {
      budget.current.daily += cost;
      budget.current.monthly += cost;
      budget.current.yearly += cost;
    }

    // Update total budget
    const totalBudget = this.budgets.get('total');
    if (totalBudget) {
      totalBudget.current.daily += cost;
      totalBudget.current.monthly += cost;
      totalBudget.current.yearly += cost;
    }

    // Record metrics
    metricsCollector.recordAPICost(providerId, transaction.operation, cost);

    // Check for budget alerts
    this.checkBudgetAlerts(providerId, cost);

    // Store in history
    this.storeInHistory(providerId, transaction);

    logger.debug('Usage recorded', {
      providerId,
      cost,
      operation: transaction.operation,
      totalDailyCost: costData?.dailyCost
    });

    this.emit('usage:recorded', { providerId, transaction });

    return cost;
  }

  /**
   * Store transaction in history for analysis
   */
  storeInHistory(providerId, transaction) {
    if (!this.costHistory.has(providerId)) {
      this.costHistory.set(providerId, []);
    }

    const history = this.costHistory.get(providerId);
    history.push(transaction);

    // Keep only last 30 days of history
    const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
    this.costHistory.set(providerId, history.filter(t => t.timestamp >= cutoff));
  }

  /**
   * Check for budget alerts
   */
  checkBudgetAlerts(providerId, recentCost) {
    const budget = this.budgets.get(providerId);
    if (!budget) return;

    const alerts = budget.alerts;
    const periods = ['daily', 'monthly', 'yearly'];

    for (const period of periods) {
      const current = budget.current[period];
      const limit = budget[period];
      const percentage = current / limit;

      // Check each alert threshold
      for (const [alertType, threshold] of Object.entries(alerts)) {
        if (percentage >= threshold) {
          const alertKey = `${providerId}-${period}-${alertType}`;
          
          // Avoid duplicate alerts within 1 hour
          const lastAlert = this.alerts.get(alertKey);
          if (lastAlert && (Date.now() - lastAlert) < 3600000) {
            continue;
          }

          this.alerts.set(alertKey, Date.now());

          const alert = {
            type: 'budget_alert',
            severity: alertType,
            providerId,
            period,
            current,
            limit,
            percentage: percentage * 100,
            threshold: threshold * 100,
            remainingBudget: limit - current,
            timestamp: Date.now()
          };

          this.emit('budget:alert', alert);

          logger.warn('Budget alert triggered', alert);

          // Emergency action - consider rate limiting
          if (alertType === 'emergency') {
            this.emit('budget:emergency', {
              ...alert,
              action: 'consider_rate_limiting'
            });
          }
        }
      }
    }

    // Check total budget
    const totalBudget = this.budgets.get('total');
    if (totalBudget) {
      this.checkBudgetAlerts('total', 0); // Check without adding cost again
    }
  }

  /**
   * Reset budget periods
   */
  resetBudgets() {
    const now = Date.now();

    for (const [providerId, budget] of this.budgets.entries()) {
      let hasReset = false;

      // Check each period
      for (const period of ['daily', 'monthly', 'yearly']) {
        if (now >= budget.resetTimes[period]) {
          budget.current[period] = 0;
          budget.resetTimes[period] = this.getNextResetTime(period);
          hasReset = true;

          // Reset cost data period
          const costData = this.costData.get(providerId);
          if (costData) {
            costData[`${period}Cost`] = 0;
            costData.lastReset[period] = now;
          }

          logger.info('Budget reset', { providerId, period });
        }
      }

      if (hasReset) {
        this.emit('budget:reset', { providerId, timestamp: now });
      }
    }
  }

  /**
   * Get cost summary for a provider
   */
  getCostSummary(providerId) {
    const costData = this.costData.get(providerId);
    const budget = this.budgets.get(providerId);
    
    if (!costData || !budget) {
      return null;
    }

    const summary = {
      providerId,
      current: {
        daily: costData.dailyCost,
        monthly: costData.monthlyCost,
        yearly: costData.yearlyCost,
        total: costData.totalCost
      },
      budgets: {
        daily: budget.daily,
        monthly: budget.monthly,
        yearly: budget.yearly
      },
      usage: {
        daily: (costData.dailyCost / budget.daily) * 100,
        monthly: (costData.monthlyCost / budget.monthly) * 100,
        yearly: (costData.yearlyCost / budget.yearly) * 100
      },
      remaining: {
        daily: Math.max(0, budget.daily - costData.dailyCost),
        monthly: Math.max(0, budget.monthly - costData.monthlyCost),
        yearly: Math.max(0, budget.yearly - costData.yearlyCost)
      },
      breakdown: Array.from(costData.breakdown.values()),
      recentTransactions: costData.transactions.slice(-10),
      alerts: this.getActiveAlerts(providerId)
    };

    return summary;
  }

  /**
   * Get active alerts for a provider
   */
  getActiveAlerts(providerId) {
    const activeAlerts = [];
    const now = Date.now();
    const oneHour = 3600000;

    for (const [alertKey, timestamp] of this.alerts.entries()) {
      if (alertKey.startsWith(providerId) && (now - timestamp) < oneHour) {
        const [provider, period, alertType] = alertKey.split('-');
        activeAlerts.push({
          provider,
          period,
          alertType,
          timestamp,
          age: now - timestamp
        });
      }
    }

    return activeAlerts;
  }

  /**
   * Generate cost report
   */
  generateCostReport(timeWindow = 86400000) { // 24 hours default
    const now = Date.now();
    const cutoff = now - timeWindow;
    
    const report = {
      timestamp: now,
      timeWindow,
      summary: {
        totalCost: 0,
        totalTransactions: 0,
        averageCostPerTransaction: 0,
        costByProvider: {},
        costByOperation: {},
        budgetUtilization: {}
      },
      providers: [],
      alerts: [],
      trends: this.calculateCostTrends(),
      projections: this.calculateCostProjections()
    };

    // Analyze each provider
    for (const [providerId, costData] of this.costData.entries()) {
      if (providerId === 'total') continue;

      const recentTransactions = costData.transactions.filter(t => t.timestamp >= cutoff);
      const recentCost = recentTransactions.reduce((sum, t) => sum + t.cost, 0);
      
      report.summary.totalCost += recentCost;
      report.summary.totalTransactions += recentTransactions.length;
      report.summary.costByProvider[providerId] = recentCost;

      // Provider details
      const providerReport = {
        providerId,
        cost: recentCost,
        transactions: recentTransactions.length,
        averageCost: recentTransactions.length > 0 ? recentCost / recentTransactions.length : 0,
        operationBreakdown: {},
        budget: this.getCostSummary(providerId)
      };

      // Operation breakdown
      for (const transaction of recentTransactions) {
        if (!providerReport.operationBreakdown[transaction.operation]) {
          providerReport.operationBreakdown[transaction.operation] = {
            cost: 0,
            count: 0,
            avgCost: 0
          };
        }
        
        const opBreakdown = providerReport.operationBreakdown[transaction.operation];
        opBreakdown.cost += transaction.cost;
        opBreakdown.count += 1;
        opBreakdown.avgCost = opBreakdown.cost / opBreakdown.count;

        // Global operation breakdown
        if (!report.summary.costByOperation[transaction.operation]) {
          report.summary.costByOperation[transaction.operation] = 0;
        }
        report.summary.costByOperation[transaction.operation] += transaction.cost;
      }

      report.providers.push(providerReport);

      // Budget utilization
      const budget = this.budgets.get(providerId);
      if (budget) {
        report.summary.budgetUtilization[providerId] = {
          daily: (budget.current.daily / budget.daily) * 100,
          monthly: (budget.current.monthly / budget.monthly) * 100,
          yearly: (budget.current.yearly / budget.yearly) * 100
        };
      }
    }

    // Calculate averages
    if (report.summary.totalTransactions > 0) {
      report.summary.averageCostPerTransaction = report.summary.totalCost / report.summary.totalTransactions;
    }

    // Collect recent alerts
    const oneDay = 86400000;
    for (const [alertKey, timestamp] of this.alerts.entries()) {
      if ((now - timestamp) < oneDay) {
        const [providerId, period, alertType] = alertKey.split('-');
        report.alerts.push({
          providerId,
          period,
          alertType,
          timestamp,
          age: now - timestamp
        });
      }
    }

    return report;
  }

  /**
   * Calculate cost trends
   */
  calculateCostTrends() {
    const trends = {};
    const now = Date.now();
    const oneDayAgo = now - 86400000;
    const twoDaysAgo = now - (2 * 86400000);
    const oneWeekAgo = now - (7 * 86400000);

    for (const [providerId, costData] of this.costData.entries()) {
      if (providerId === 'total') continue;

      const todayTransactions = costData.transactions.filter(t => t.timestamp >= oneDayAgo);
      const yesterdayTransactions = costData.transactions.filter(t => t.timestamp >= twoDaysAgo && t.timestamp < oneDayAgo);
      const weekTransactions = costData.transactions.filter(t => t.timestamp >= oneWeekAgo);

      const todayCost = todayTransactions.reduce((sum, t) => sum + t.cost, 0);
      const yesterdayCost = yesterdayTransactions.reduce((sum, t) => sum + t.cost, 0);
      const weekCost = weekTransactions.reduce((sum, t) => sum + t.cost, 0);

      trends[providerId] = {
        dailyChange: yesterdayCost > 0 ? ((todayCost - yesterdayCost) / yesterdayCost) * 100 : 0,
        weeklyAverage: weekCost / 7,
        weeklyTrend: weekCost > 0 ? ((todayCost - (weekCost / 7)) / (weekCost / 7)) * 100 : 0
      };
    }

    return trends;
  }

  /**
   * Calculate cost projections
   */
  calculateCostProjections() {
    const projections = {};
    const now = Date.now();
    const oneWeekAgo = now - (7 * 86400000);

    for (const [providerId, costData] of this.costData.entries()) {
      if (providerId === 'total') continue;

      const weekTransactions = costData.transactions.filter(t => t.timestamp >= oneWeekAgo);
      const weekCost = weekTransactions.reduce((sum, t) => sum + t.cost, 0);
      const dailyAverage = weekCost / 7;

      const budget = this.budgets.get(providerId);
      if (budget) {
        projections[providerId] = {
          dailyAverage,
          monthlyProjection: dailyAverage * 30,
          yearlyProjection: dailyAverage * 365,
          budgetRunway: {}, // Days until budget is exhausted
        };

        // Calculate runway
        if (dailyAverage > 0) {
          projections[providerId].budgetRunway = {
            daily: Math.max(0, (budget.daily - budget.current.daily) / dailyAverage),
            monthly: Math.max(0, (budget.monthly - budget.current.monthly) / dailyAverage),
            yearly: Math.max(0, (budget.yearly - budget.current.yearly) / dailyAverage)
          };
        }
      }
    }

    return projections;
  }

  /**
   * Start cost tracking
   */
  startTracking() {
    // Budget checks every 5 minutes
    this.budgetCheckInterval = setInterval(() => {
      this.resetBudgets();
    }, 300000);

    // Generate reports every hour
    this.reportingInterval = setInterval(() => {
      const report = this.generateCostReport();
      this.emit('cost:report', report);
    }, 3600000);

    logger.info('Started cost tracking');
  }

  /**
   * Stop cost tracking
   */
  stopTracking() {
    if (this.budgetCheckInterval) {
      clearInterval(this.budgetCheckInterval);
      this.budgetCheckInterval = null;
    }

    if (this.reportingInterval) {
      clearInterval(this.reportingInterval);
      this.reportingInterval = null;
    }

    logger.info('Stopped cost tracking');
  }

  /**
   * Get all cost data
   */
  getAllCostData() {
    const data = {};
    
    for (const [providerId, costData] of this.costData.entries()) {
      data[providerId] = {
        ...costData,
        breakdown: Array.from(costData.breakdown.values()),
        budget: this.getCostSummary(providerId)
      };
    }

    return data;
  }

  /**
   * Export cost data for analysis
   */
  exportCostData(format = 'json', timeWindow = null) {
    const cutoff = timeWindow ? Date.now() - timeWindow : 0;
    const exportData = {
      timestamp: Date.now(),
      timeWindow,
      providers: {}
    };

    for (const [providerId, costData] of this.costData.entries()) {
      const transactions = costData.transactions.filter(t => t.timestamp >= cutoff);
      
      exportData.providers[providerId] = {
        providerId,
        totalCost: transactions.reduce((sum, t) => sum + t.cost, 0),
        transactionCount: transactions.length,
        transactions: format === 'detailed' ? transactions : transactions.length,
        breakdown: Array.from(costData.breakdown.values()),
        budget: this.getCostSummary(providerId)
      };
    }

    return exportData;
  }
}

// Export singleton instance
const costTracker = new CostTracker();

export { CostTracker, costTracker };
export default costTracker;