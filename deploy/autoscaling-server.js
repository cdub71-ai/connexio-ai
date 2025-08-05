/**
 * Auto-scaling Server for Fly.io Deployment
 * Provides API endpoints and automated scaling management
 */

import express from 'express';
import cron from 'node-cron';
import { AutoScalingManager } from './autoscaling-config.js';
import { createContextLogger } from '../workers/src/utils/logger.js';

const app = express();
const logger = createContextLogger({ service: 'autoscaling-server' });
const scalingManager = new AutoScalingManager();

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'autoscaling-server',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Get current scaling status
app.get('/scaling/status', (req, res) => {
  try {
    const status = scalingManager.getScalingStatus();
    res.json(status);
  } catch (error) {
    logger.error('Failed to get scaling status', { error: error.message });
    res.status(500).json({
      error: 'Failed to get scaling status',
      message: error.message
    });
  }
});

// Get metrics for all applications
app.get('/scaling/metrics', async (req, res) => {
  try {
    const metrics = await scalingManager.collectMetrics();
    res.json({
      timestamp: new Date().toISOString(),
      metrics
    });
  } catch (error) {
    logger.error('Failed to collect metrics', { error: error.message });
    res.status(500).json({
      error: 'Failed to collect metrics',
      message: error.message
    });
  }
});

// Trigger manual scaling analysis
app.post('/scaling/analyze', async (req, res) => {
  try {
    logger.info('Manual scaling analysis triggered');
    const result = await scalingManager.runAutoScaling();
    res.json(result);
  } catch (error) {
    logger.error('Manual scaling analysis failed', { error: error.message });
    res.status(500).json({
      error: 'Scaling analysis failed',
      message: error.message
    });
  }
});

// Get scaling history
app.get('/scaling/history', (req, res) => {
  try {
    const history = Array.from(scalingManager.metricsHistory.entries())
      .sort(([a], [b]) => b - a) // Most recent first
      .slice(0, 100) // Last 100 entries
      .map(([timestamp, metrics]) => ({
        timestamp: new Date(timestamp).toISOString(),
        metrics
      }));
    
    res.json({
      timestamp: new Date().toISOString(),
      history
    });
  } catch (error) {
    logger.error('Failed to get scaling history', { error: error.message });
    res.status(500).json({
      error: 'Failed to get scaling history',
      message: error.message
    });
  }
});

// Manual scaling actions
app.post('/scaling/:appName/scale-up', async (req, res) => {
  try {
    const { appName } = req.params;
    const { targetMachines } = req.body;
    
    logger.info(`Manual scale-up requested for ${appName}`, { targetMachines });
    
    await scalingManager.scaleUp(appName, targetMachines);
    
    res.json({
      success: true,
      message: `Scaled up ${appName} to ${targetMachines} machines`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Manual scale-up failed', { error: error.message });
    res.status(500).json({
      error: 'Scale-up failed',
      message: error.message
    });
  }
});

app.post('/scaling/:appName/scale-down', async (req, res) => {
  try {
    const { appName } = req.params;
    const { targetMachines } = req.body;
    
    logger.info(`Manual scale-down requested for ${appName}`, { targetMachines });
    
    await scalingManager.scaleDown(appName, targetMachines);
    
    res.json({
      success: true,
      message: `Scaled down ${appName} to ${targetMachines} machines`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Manual scale-down failed', { error: error.message });
    res.status(500).json({
      error: 'Scale-down failed',
      message: error.message
    });
  }
});

// Configuration endpoints
app.get('/scaling/config', (req, res) => {
  try {
    const { SCALING_CONFIG } = require('./autoscaling-config.js');
    res.json({
      timestamp: new Date().toISOString(),
      config: SCALING_CONFIG
    });
  } catch (error) {
    logger.error('Failed to get scaling config', { error: error.message });
    res.status(500).json({
      error: 'Failed to get scaling config',
      message: error.message
    });
  }
});

// Metrics endpoint for Prometheus
app.get('/metrics', async (req, res) => {
  try {
    const metrics = [];
    const status = scalingManager.getScalingStatus();
    const appMetrics = await scalingManager.collectMetrics();
    
    // Export scaling metrics
    for (const [appName, appStatus] of Object.entries(status.applications)) {
      const appConfig = appStatus.config;
      const currentMetrics = appMetrics[appName] || {};
      
      // Machine count metrics
      metrics.push(`# HELP app_machines_current Current number of machines`);
      metrics.push(`# TYPE app_machines_current gauge`);
      metrics.push(`app_machines_current{app="${appName}"} ${currentMetrics.activeMachines || 0}`);
      
      metrics.push(`# HELP app_machines_min Minimum number of machines`);
      metrics.push(`# TYPE app_machines_min gauge`);
      metrics.push(`app_machines_min{app="${appName}"} ${appConfig.minMachines}`);
      
      metrics.push(`# HELP app_machines_max Maximum number of machines`);
      metrics.push(`# TYPE app_machines_max gauge`);
      metrics.push(`app_machines_max{app="${appName}"} ${appConfig.maxMachines}`);
      
      // Utilization metrics
      if (currentMetrics.cpu !== undefined) {
        metrics.push(`# HELP app_cpu_utilization CPU utilization percentage`);
        metrics.push(`# TYPE app_cpu_utilization gauge`);
        metrics.push(`app_cpu_utilization{app="${appName}"} ${currentMetrics.cpu}`);
      }
      
      if (currentMetrics.memory !== undefined) {
        metrics.push(`# HELP app_memory_utilization Memory utilization percentage`);
        metrics.push(`# TYPE app_memory_utilization gauge`);
        metrics.push(`app_memory_utilization{app="${appName}"} ${currentMetrics.memory}`);
      }
      
      // Cooldown metrics
      const cooldownRemaining = scalingManager.getCooldownRemaining(appName);
      metrics.push(`# HELP app_scaling_cooldown_remaining Scaling cooldown remaining in milliseconds`);
      metrics.push(`# TYPE app_scaling_cooldown_remaining gauge`);
      metrics.push(`app_scaling_cooldown_remaining{app="${appName}"} ${cooldownRemaining}`);
    }
    
    // General autoscaling metrics
    const lastActions = Array.from(scalingManager.lastScaleActions.values());
    const scaleUpActions = lastActions.filter(a => a.action === 'scale_up').length;
    const scaleDownActions = lastActions.filter(a => a.action === 'scale_down').length;
    
    metrics.push(`# HELP autoscaling_actions_total Total scaling actions taken`);
    metrics.push(`# TYPE autoscaling_actions_total counter`);
    metrics.push(`autoscaling_actions_total{action="scale_up"} ${scaleUpActions}`);
    metrics.push(`autoscaling_actions_total{action="scale_down"} ${scaleDownActions}`);
    
    res.set('Content-Type', 'text/plain');
    res.send(metrics.join('\n'));
  } catch (error) {
    logger.error('Failed to generate metrics', { error: error.message });
    res.status(500).send('# Error generating metrics');
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled error in autoscaling server', { 
    error: error.message,
    stack: error.stack,
    path: req.path
  });
  
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred'
  });
});

// Schedule automatic scaling checks
const SCALING_SCHEDULE = process.env.SCALING_SCHEDULE || '*/2 * * * *'; // Every 2 minutes

cron.schedule(SCALING_SCHEDULE, async () => {
  try {
    logger.info('Running scheduled auto-scaling check');
    await scalingManager.runAutoScaling();
  } catch (error) {
    logger.error('Scheduled auto-scaling failed', { error: error.message });
  }
});

// Start the server
const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  logger.info('Auto-scaling server started', { 
    port: PORT,
    scalingSchedule: SCALING_SCHEDULE 
  });
  
  // Run initial scaling analysis
  setTimeout(async () => {
    try {
      await scalingManager.runAutoScaling();
    } catch (error) {
      logger.error('Initial scaling analysis failed', { error: error.message });
    }
  }, 30000); // Wait 30 seconds for services to be ready
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

export default app;