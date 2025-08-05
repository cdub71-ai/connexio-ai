/**
 * Auto-scaling Configuration and Monitoring for Fly.io Deployment
 * Provides intelligent scaling based on workload metrics
 */

import axios from 'axios';
import { createContextLogger } from '../workers/src/utils/logger.js';

const logger = createContextLogger({ service: 'autoscaling-manager' });

// Auto-scaling configuration for each application
const SCALING_CONFIG = {
  'connexio-ai-littlehorse': {
    minMachines: 2,
    maxMachines: 8,
    targetRegions: ['iad', 'ord', 'dfw'],
    metrics: {
      cpu: { target: 70, weight: 0.4 },
      memory: { target: 80, weight: 0.3 },
      active_workflows: { target: 100, weight: 0.3 }
    },
    scaleUpCooldown: 120, // 2 minutes
    scaleDownCooldown: 300, // 5 minutes
    scaleUpThreshold: 0.8,
    scaleDownThreshold: 0.3
  },
  
  'connexio-ai-workers': {
    minMachines: 2,
    maxMachines: 15,
    targetRegions: ['iad', 'ord'],
    metrics: {
      cpu: { target: 65, weight: 0.3 },
      memory: { target: 75, weight: 0.2 },
      queue_depth: { target: 50, weight: 0.3 },
      task_completion_rate: { target: 0.85, weight: 0.2 }
    },
    scaleUpCooldown: 90,
    scaleDownCooldown: 240,
    scaleUpThreshold: 0.75,
    scaleDownThreshold: 0.25
  },
  
  'connexio-ai-enrichment-workers': {
    minMachines: 2,
    maxMachines: 20,
    targetRegions: ['iad', 'ord', 'dfw'],
    metrics: {
      cpu: { target: 60, weight: 0.2 },
      memory: { target: 70, weight: 0.2 },
      enrichment_queue_depth: { target: 100, weight: 0.4 },
      api_rate_limit_usage: { target: 0.8, weight: 0.2 }
    },
    scaleUpCooldown: 60, // Fast scaling for data processing
    scaleDownCooldown: 180,
    scaleUpThreshold: 0.8,
    scaleDownThreshold: 0.2
  },
  
  'connexio-ai-orchestration-workers': {
    minMachines: 3,
    maxMachines: 12,
    targetRegions: ['iad', 'ord'],
    metrics: {
      cpu: { target: 65, weight: 0.3 },
      memory: { target: 70, weight: 0.2 },
      active_campaigns: { target: 30, weight: 0.4 },
      campaign_success_rate: { target: 0.9, weight: 0.1 }
    },
    scaleUpCooldown: 120,
    scaleDownCooldown: 300,
    scaleUpThreshold: 0.75,
    scaleDownThreshold: 0.3
  }
};

class AutoScalingManager {
  constructor() {
    this.scalingActions = new Map();
    this.lastScaleActions = new Map();
    this.metricsHistory = new Map();
  }

  /**
   * Collect metrics from all services
   */
  async collectMetrics() {
    const metrics = {};
    
    try {
      // Collect from each application
      for (const appName of Object.keys(SCALING_CONFIG)) {
        metrics[appName] = await this.getAppMetrics(appName);
      }
      
      // Store in history for trend analysis
      const timestamp = Date.now();
      this.metricsHistory.set(timestamp, metrics);
      
      // Keep only last 24 hours of metrics
      const cutoff = timestamp - (24 * 60 * 60 * 1000);
      for (const [time] of this.metricsHistory) {
        if (time < cutoff) {
          this.metricsHistory.delete(time);
        }
      }
      
      return metrics;
    } catch (error) {
      logger.error('Failed to collect metrics', { error: error.message });
      throw error;
    }
  }

  /**
   * Get metrics for a specific application
   */
  async getAppMetrics(appName) {
    try {
      // Get machine status from Fly.io API
      const machineStatus = await this.getFlyMachineStatus(appName);
      
      // Get application-specific metrics
      const appMetrics = await this.getApplicationMetrics(appName);
      
      return {
        ...machineStatus,
        ...appMetrics,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`Failed to get metrics for ${appName}`, { error: error.message });
      return {
        cpu: 0,
        memory: 0,
        activeMachines: 0,
        totalMachines: 0,
        healthy: false
      };
    }
  }

  /**
   * Get machine status from Fly.io API
   */
  async getFlyMachineStatus(appName) {
    try {
      // This would use the Fly.io API to get machine metrics
      // For now, returning mock data structure
      return {
        activeMachines: 2,
        totalMachines: 2,
        cpu: Math.random() * 100,
        memory: Math.random() * 100,
        regions: ['iad'],
        healthy: true
      };
    } catch (error) {
      logger.error(`Failed to get Fly machine status for ${appName}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Get application-specific metrics
   */
  async getApplicationMetrics(appName) {
    try {
      let metricsUrl;
      
      switch (appName) {
        case 'connexio-ai-littlehorse':
          metricsUrl = 'http://connexio-ai-littlehorse.internal:1822/metrics';
          break;
        case 'connexio-ai-workers':
          metricsUrl = 'http://connexio-ai-workers.internal:3001/metrics';
          break;
        case 'connexio-ai-enrichment-workers':
          metricsUrl = 'http://connexio-ai-enrichment-workers.internal:3001/metrics';
          break;
        case 'connexio-ai-orchestration-workers':
          metricsUrl = 'http://connexio-ai-orchestration-workers.internal:3001/metrics';
          break;
        default:
          return {};
      }
      
      const response = await axios.get(metricsUrl, { timeout: 5000 });
      return this.parsePrometheusMetrics(response.data, appName);
    } catch (error) {
      logger.warn(`Failed to get application metrics for ${appName}`, { error: error.message });
      return {};
    }
  }

  /**
   * Parse Prometheus metrics format
   */
  parsePrometheusMetrics(metricsText, appName) {
    const metrics = {};
    const lines = metricsText.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('#') || !line.trim()) continue;
      
      const [metricName, value] = line.split(' ');
      if (!metricName || !value) continue;
      
      // Extract relevant metrics based on app type
      if (appName === 'connexio-ai-littlehorse' && metricName.includes('workflow')) {
        metrics.active_workflows = parseFloat(value);
      } else if (appName.includes('workers') && metricName.includes('queue')) {
        metrics.queue_depth = parseFloat(value);
      } else if (metricName.includes('campaign')) {
        metrics.active_campaigns = parseFloat(value);
      }
    }
    
    return metrics;
  }

  /**
   * Calculate scaling score for an application
   */
  calculateScalingScore(appName, metrics) {
    const config = SCALING_CONFIG[appName];
    if (!config) return 0;
    
    let weightedScore = 0;
    let totalWeight = 0;
    
    for (const [metricName, metricConfig] of Object.entries(config.metrics)) {
      const currentValue = metrics[metricName];
      if (currentValue === undefined) continue;
      
      let score;
      if (metricName.includes('rate') || metricName.includes('success')) {
        // For rate metrics, lower is worse (needs scaling up)
        score = currentValue / metricConfig.target;
      } else {
        // For utilization metrics, higher is worse (needs scaling up)
        score = currentValue / metricConfig.target;
      }
      
      weightedScore += score * metricConfig.weight;
      totalWeight += metricConfig.weight;
    }
    
    return totalWeight > 0 ? weightedScore / totalWeight : 0;
  }

  /**
   * Determine scaling action for an application
   */
  determineScalingAction(appName, metrics) {
    const config = SCALING_CONFIG[appName];
    const scalingScore = this.calculateScalingScore(appName, metrics);
    const lastAction = this.lastScaleActions.get(appName);
    const now = Date.now();
    
    // Check cooldown periods
    if (lastAction) {
      const timeSinceLastAction = now - lastAction.timestamp;
      const cooldownPeriod = lastAction.action === 'scale_up' 
        ? config.scaleUpCooldown * 1000 
        : config.scaleDownCooldown * 1000;
      
      if (timeSinceLastAction < cooldownPeriod) {
        return { action: 'wait', reason: 'cooldown_active', score: scalingScore };
      }
    }
    
    const currentMachines = metrics.activeMachines || config.minMachines;
    
    // Determine action based on thresholds
    if (scalingScore >= config.scaleUpThreshold && currentMachines < config.maxMachines) {
      return {
        action: 'scale_up',
        reason: 'high_utilization',
        score: scalingScore,
        targetMachines: Math.min(currentMachines + 1, config.maxMachines)
      };
    } else if (scalingScore <= config.scaleDownThreshold && currentMachines > config.minMachines) {
      return {
        action: 'scale_down',
        reason: 'low_utilization', 
        score: scalingScore,
        targetMachines: Math.max(currentMachines - 1, config.minMachines)
      };
    }
    
    return { action: 'maintain', reason: 'within_thresholds', score: scalingScore };
  }

  /**
   * Execute scaling action
   */
  async executeScalingAction(appName, action) {
    try {
      logger.info(`Executing scaling action for ${appName}`, action);
      
      if (action.action === 'scale_up') {
        await this.scaleUp(appName, action.targetMachines);
      } else if (action.action === 'scale_down') {
        await this.scaleDown(appName, action.targetMachines);
      }
      
      // Record the action
      this.lastScaleActions.set(appName, {
        ...action,
        timestamp: Date.now()
      });
      
      return true;
    } catch (error) {
      logger.error(`Failed to execute scaling action for ${appName}`, { 
        error: error.message, 
        action 
      });
      return false;
    }
  }

  /**
   * Scale up an application
   */
  async scaleUp(appName, targetMachines) {
    const config = SCALING_CONFIG[appName];
    
    // Clone machines to target regions
    const regionsToScale = config.targetRegions.slice(0, targetMachines);
    
    for (const region of regionsToScale) {
      await this.cloneMachine(appName, region);
    }
    
    logger.info(`Scaled up ${appName} to ${targetMachines} machines`);
  }

  /**
   * Scale down an application
   */
  async scaleDown(appName, targetMachines) {
    // Remove machines from least active regions first
    await this.removeMachine(appName, targetMachines);
    
    logger.info(`Scaled down ${appName} to ${targetMachines} machines`);
  }

  /**
   * Clone a machine in a specific region
   */
  async cloneMachine(appName, region) {
    // This would use flyctl or Fly.io API
    logger.info(`Cloning machine for ${appName} in region ${region}`);
    
    // Mock implementation - in reality would call:
    // flyctl machine clone --app ${appName} --region ${region}
  }

  /**
   * Remove a machine from the least active region
   */
  async removeMachine(appName, targetCount) {
    // This would use flyctl or Fly.io API
    logger.info(`Removing machine from ${appName}, target count: ${targetCount}`);
    
    // Mock implementation - in reality would call:
    // flyctl machine destroy --app ${appName} [machine-id]
  }

  /**
   * Run auto-scaling analysis and actions
   */
  async runAutoScaling() {
    try {
      logger.info('Starting auto-scaling analysis');
      
      const metrics = await this.collectMetrics();
      const actions = {};
      
      // Analyze each application
      for (const [appName, appMetrics] of Object.entries(metrics)) {
        const action = this.determineScalingAction(appName, appMetrics);
        actions[appName] = action;
        
        // Execute scaling actions
        if (action.action === 'scale_up' || action.action === 'scale_down') {
          await this.executeScalingAction(appName, action);
        }
      }
      
      logger.info('Auto-scaling analysis completed', { 
        actions: Object.keys(actions).reduce((acc, app) => {
          acc[app] = actions[app].action;
          return acc;
        }, {})
      });
      
      return {
        timestamp: new Date().toISOString(),
        metrics,
        actions,
        summary: this.generateScalingSummary(actions)
      };
      
    } catch (error) {
      logger.error('Auto-scaling run failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate scaling summary
   */
  generateScalingSummary(actions) {
    const summary = {
      totalApps: Object.keys(actions).length,
      scaleUpActions: 0,
      scaleDownActions: 0,
      maintainActions: 0,
      waitActions: 0
    };
    
    for (const action of Object.values(actions)) {
      switch (action.action) {
        case 'scale_up':
          summary.scaleUpActions++;
          break;
        case 'scale_down':
          summary.scaleDownActions++;
          break;
        case 'maintain':
          summary.maintainActions++;
          break;
        case 'wait':
          summary.waitActions++;
          break;
      }
    }
    
    return summary;
  }

  /**
   * Get scaling status for all applications
   */
  getScalingStatus() {
    const status = {};
    
    for (const appName of Object.keys(SCALING_CONFIG)) {
      const config = SCALING_CONFIG[appName];
      const lastAction = this.lastScaleActions.get(appName);
      
      status[appName] = {
        config: {
          minMachines: config.minMachines,
          maxMachines: config.maxMachines,
          regions: config.targetRegions
        },
        lastAction: lastAction || null,
        cooldownRemaining: this.getCooldownRemaining(appName)
      };
    }
    
    return {
      timestamp: new Date().toISOString(),
      applications: status
    };
  }

  /**
   * Get remaining cooldown time for an application
   */
  getCooldownRemaining(appName) {
    const config = SCALING_CONFIG[appName];
    const lastAction = this.lastScaleActions.get(appName);
    
    if (!lastAction) return 0;
    
    const now = Date.now();
    const cooldownPeriod = lastAction.action === 'scale_up' 
      ? config.scaleUpCooldown * 1000 
      : config.scaleDownCooldown * 1000;
    
    const elapsed = now - lastAction.timestamp;
    return Math.max(0, cooldownPeriod - elapsed);
  }
}

export { AutoScalingManager, SCALING_CONFIG };