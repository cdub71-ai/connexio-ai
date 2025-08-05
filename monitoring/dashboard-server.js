/**
 * System Health Dashboard Server
 * Comprehensive monitoring dashboard with real-time data and visualizations
 */

import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';

import { metricsCollector } from './metrics-collector.js';
import { workflowMonitor } from './workflow-monitor.js';
import { workerHealthMonitor } from './worker-health-monitor.js';
import { apiIntegrationMonitor } from './api-integration-monitor.js';
import { costTracker } from './cost-tracker.js';
import { alertManager } from './alert-manager.js';
import { createServiceLogger, createCorrelationMiddleware } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = createServiceLogger('dashboard-server');
const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.DASHBOARD_CORS_ORIGIN || "*",
    methods: ["GET", "POST"]
  }
});

class DashboardServer {
  constructor() {
    this.connectedClients = new Set();
    this.realtimeUpdateInterval = null;
    this.dashboardData = new Map();
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.startRealtimeUpdates();
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    app.use(cors());
    app.use(express.json());
    app.use(createCorrelationMiddleware());
    app.use(metricsCollector.createHTTPMiddleware('dashboard-server'));
    
    // Serve static dashboard files
    app.use('/static', express.static(path.join(__dirname, 'dashboard', 'static')));
    
    // Error handling
    app.use((error, req, res, next) => {
      logger.error('Dashboard server error', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method
      });
      
      res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred'
      });
    });
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // Health check
    app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'dashboard-server',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        connectedClients: this.connectedClients.size
      });
    });

    // Main dashboard
    app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'dashboard', 'index.html'));
    });

    // System overview
    app.get('/api/overview', async (req, res) => {
      try {
        const overview = await this.generateSystemOverview();
        res.json(overview);
      } catch (error) {
        logger.error('Failed to generate system overview', { error: error.message });
        res.status(500).json({ error: 'Failed to generate overview' });
      }
    });

    // Workflow monitoring
    app.get('/api/workflows', (req, res) => {
      try {
        const data = {
          active: workflowMonitor.getActiveWorkflows(),
          stats: workflowMonitor.getWorkflowStats(),
          tasks: workflowMonitor.getTaskStats(),
          report: workflowMonitor.generateReport()
        };
        res.json(data);
      } catch (error) {
        logger.error('Failed to get workflow data', { error: error.message });
        res.status(500).json({ error: 'Failed to get workflow data' });
      }
    });

    // Worker health
    app.get('/api/workers', (req, res) => {
      try {
        const data = {
          health: workerHealthMonitor.getHealthStatus(),
          types: workerHealthMonitor.getWorkerTypeStats(),
          report: workerHealthMonitor.generateHealthReport()
        };
        res.json(data);
      } catch (error) {
        logger.error('Failed to get worker data', { error: error.message });
        res.status(500).json({ error: 'Failed to get worker data' });
      }
    });

    // API integration monitoring
    app.get('/api/integrations', (req, res) => {
      try {
        const data = {
          providers: apiIntegrationMonitor.getProviderStats(),
          quotas: apiIntegrationMonitor.getQuotaUsage(),
          report: apiIntegrationMonitor.generateReport()
        };
        res.json(data);
      } catch (error) {
        logger.error('Failed to get API integration data', { error: error.message });
        res.status(500).json({ error: 'Failed to get API integration data' });
      }
    });

    // Cost tracking
    app.get('/api/costs', (req, res) => {
      try {
        const data = {
          summary: costTracker.getAllCostData(),
          report: costTracker.generateCostReport(),
          export: costTracker.exportCostData('summary', 86400000) // 24 hours
        };
        res.json(data);
      } catch (error) {
        logger.error('Failed to get cost data', { error: error.message });
        res.status(500).json({ error: 'Failed to get cost data' });
      }
    });

    // Alerts
    app.get('/api/alerts', (req, res) => {
      try {
        const data = {
          stats: alertManager.getAlertStats(),
          active: Array.from(alertManager.activeAlerts.values()),
          report: alertManager.generateReport()
        };
        res.json(data);
      } catch (error) {
        logger.error('Failed to get alert data', { error: error.message });
        res.status(500).json({ error: 'Failed to get alert data' });
      }
    });

    // Metrics (Prometheus format)
    app.get('/metrics', async (req, res) => {
      try {
        const metrics = await metricsCollector.getMetrics();
        res.set('Content-Type', 'text/plain');
        res.send(metrics);
      } catch (error) {
        logger.error('Failed to get metrics', { error: error.message });
        res.status(500).send('# Error generating metrics');
      }
    });

    // Historical data
    app.get('/api/history/:component/:timerange', (req, res) => {
      try {
        const { component, timerange } = req.params;
        const data = this.getHistoricalData(component, timerange);
        res.json(data);
      } catch (error) {
        logger.error('Failed to get historical data', { 
          error: error.message,
          component: req.params.component,
          timerange: req.params.timerange
        });
        res.status(500).json({ error: 'Failed to get historical data' });
      }
    });

    // System configuration
    app.get('/api/config', (req, res) => {
      try {
        const config = {
          monitoring: {
            metricsCollectionInterval: 15000,
            healthCheckInterval: 30000,
            alertProcessingInterval: 60000
          },
          alerting: {
            rules: alertManager.alertRules.size,
            channels: alertManager.alertChannels.size,
            policies: alertManager.escalationPolicies.size
          },
          integrations: {
            providers: apiIntegrationMonitor.apiProviders.size,
            activeProviders: Array.from(apiIntegrationMonitor.apiProviders.values())
              .filter(p => p.status === 'active').length
          }
        };
        res.json(config);
      } catch (error) {
        logger.error('Failed to get config', { error: error.message });
        res.status(500).json({ error: 'Failed to get config' });
      }
    });

    // Manual actions
    app.post('/api/actions/resolve-alert/:alertId', (req, res) => {
      try {
        const { alertId } = req.params;
        const { reason } = req.body;
        
        const alert = alertManager.resolveAlert(alertId, reason || 'Manual resolution');
        if (alert) {
          res.json({ success: true, alert });
        } else {
          res.status(404).json({ error: 'Alert not found' });
        }
      } catch (error) {
        logger.error('Failed to resolve alert', { 
          error: error.message,
          alertId: req.params.alertId
        });
        res.status(500).json({ error: 'Failed to resolve alert' });
      }
    });

    app.post('/api/actions/create-suppression', (req, res) => {
      try {
        const suppression = alertManager.createSuppression(req.body);
        res.json({ success: true, suppression });
      } catch (error) {
        logger.error('Failed to create suppression', { error: error.message });
        res.status(500).json({ error: 'Failed to create suppression' });
      }
    });

    app.post('/api/actions/maintenance-window', (req, res) => {
      try {
        const window = alertManager.createMaintenanceWindow(req.body);
        res.json({ success: true, window });
      } catch (error) {
        logger.error('Failed to create maintenance window', { error: error.message });
        res.status(500).json({ error: 'Failed to create maintenance window' });
      }
    });
  }

  /**
   * Setup WebSocket for real-time updates
   */
  setupWebSocket() {
    io.on('connection', (socket) => {
      this.connectedClients.add(socket.id);
      
      logger.info('Dashboard client connected', { 
        socketId: socket.id,
        totalClients: this.connectedClients.size
      });

      // Send initial data
      this.sendInitialData(socket);

      // Handle client requests
      socket.on('request:overview', async () => {
        try {
          const overview = await this.generateSystemOverview();
          socket.emit('data:overview', overview);
        } catch (error) {
          logger.error('Failed to send overview data', { error: error.message });
        }
      });

      socket.on('request:workflows', () => {
        const data = {
          active: workflowMonitor.getActiveWorkflows(),
          stats: workflowMonitor.getWorkflowStats()
        };
        socket.emit('data:workflows', data);
      });

      socket.on('request:workers', () => {
        const data = {
          health: workerHealthMonitor.getHealthStatus(),
          types: workerHealthMonitor.getWorkerTypeStats()
        };
        socket.emit('data:workers', data);
      });

      socket.on('request:alerts', () => {
        const data = {
          active: Array.from(alertManager.activeAlerts.values()),
          stats: alertManager.getAlertStats()
        };
        socket.emit('data:alerts', data);
      });

      socket.on('disconnect', () => {
        this.connectedClients.delete(socket.id);
        
        logger.info('Dashboard client disconnected', { 
          socketId: socket.id,
          totalClients: this.connectedClients.size
        });
      });
    });
  }

  /**
   * Send initial data to newly connected client
   */
  async sendInitialData(socket) {
    try {
      const data = {
        overview: await this.generateSystemOverview(),
        workflows: {
          active: workflowMonitor.getActiveWorkflows(),
          stats: workflowMonitor.getWorkflowStats().slice(0, 10) // Top 10
        },
        workers: {
          health: workerHealthMonitor.getHealthStatus(),
          types: workerHealthMonitor.getWorkerTypeStats()
        },
        integrations: {
          providers: apiIntegrationMonitor.getProviderStats().slice(0, 10),
          quotas: apiIntegrationMonitor.getQuotaUsage()
        },
        costs: {
          summary: Object.fromEntries(
            Array.from(costTracker.costData.entries()).slice(0, 10)
          )
        },
        alerts: {
          active: Array.from(alertManager.activeAlerts.values()).slice(0, 20),
          stats: alertManager.getAlertStats()
        }
      };

      socket.emit('initial:data', data);
    } catch (error) {
      logger.error('Failed to send initial data', { 
        error: error.message,
        socketId: socket.id
      });
    }
  }

  /**
   * Generate comprehensive system overview
   */
  async generateSystemOverview() {
    const now = Date.now();
    
    // System metrics
    const systemMetrics = metricsCollector.getSystemMetrics();
    
    // Workflow overview
    const activeWorkflows = workflowMonitor.getActiveWorkflows();
    const workflowStats = workflowMonitor.getWorkflowStats();
    
    // Worker overview
    const workerHealth = workerHealthMonitor.getHealthStatus();
    const workerTypes = workerHealthMonitor.getWorkerTypeStats();
    
    // API overview
    const apiProviders = apiIntegrationMonitor.getProviderStats();
    const quotaUsage = apiIntegrationMonitor.getQuotaUsage();
    
    // Cost overview
    const costReport = costTracker.generateCostReport(86400000); // 24 hours
    
    // Alert overview
    const alertStats = alertManager.getAlertStats();
    const activeAlerts = Array.from(alertManager.activeAlerts.values());
    
    // Calculate overall health score
    const healthScore = this.calculateSystemHealthScore({
      systemMetrics,
      workflowStats,
      workerHealth,
      apiProviders,
      activeAlerts
    });

    return {
      timestamp: now,
      healthScore,
      system: {
        uptime: process.uptime(),
        memory: systemMetrics.memory,
        cpu: systemMetrics.cpu,
        version: process.version,
        environment: process.env.NODE_ENV || 'development'
      },
      workflows: {
        active: activeWorkflows.length,
        totalTypes: workflowStats.length,
        successRate: this.calculateSuccessRate(workflowStats),
        avgDuration: this.calculateAvgDuration(workflowStats)
      },
      workers: {
        healthy: workerHealth?.status === 'healthy' ? 1 : 0,
        total: workerTypes.reduce((sum, type) => sum + type.totalWorkers, 0),
        types: workerTypes.length,
        totalTasks: workerTypes.reduce((sum, type) => sum + type.totalTasks, 0)
      },
      apis: {
        active: apiProviders.filter(p => p.status === 'active').length,
        total: apiProviders.length,
        totalRequests: apiProviders.reduce((sum, p) => sum + p.stats.totalRequests, 0),
        avgSuccessRate: this.calculateAPISuccessRate(apiProviders),
        totalCost: apiProviders.reduce((sum, p) => sum + p.stats.totalCost, 0)
      },
      costs: {
        daily: costReport.summary.totalCost,
        budgetUtilization: this.calculateBudgetUtilization(costReport.summary.budgetUtilization),
        topProvider: this.getTopCostProvider(costReport.summary.costByProvider)
      },
      alerts: {
        active: alertStats.activeAlerts,
        critical: alertStats.alertsBySeverity.critical || 0,
        warnings: alertStats.alertsBySeverity.warning || 0,
        recentAlerts: activeAlerts.slice(0, 5).map(alert => ({
          id: alert.id,
          title: alert.title,
          severity: alert.severity,
          category: alert.category,
          timestamp: alert.timestamp
        }))
      }
    };
  }

  /**
   * Calculate overall system health score (0-1)
   */
  calculateSystemHealthScore(data) {
    let score = 1.0;
    let factors = 0;

    // System metrics factor (25%)
    if (data.systemMetrics.memory) {
      const memoryScore = Math.max(0, 1 - (data.systemMetrics.memory.heapUsed / data.systemMetrics.memory.heapTotal));
      score += memoryScore * 0.25;
      factors++;
    }

    // Workflow success rate factor (25%)
    const workflowSuccessRate = this.calculateSuccessRate(data.workflowStats);
    if (workflowSuccessRate !== null) {
      score += workflowSuccessRate * 0.25;
      factors++;
    }

    // Worker health factor (25%)
    if (data.workerHealth && data.workerHealth.status === 'healthy') {
      score += 0.25;
    }
    factors++;

    // API health factor (15%)
    const apiSuccessRate = this.calculateAPISuccessRate(data.apiProviders);
    if (apiSuccessRate !== null) {
      score += apiSuccessRate * 0.15;
      factors++;
    }

    // Alert factor (10%) - penalize active critical alerts
    const criticalAlerts = data.activeAlerts.filter(a => a.severity === 'critical').length;
    const alertPenalty = Math.min(0.1, criticalAlerts * 0.02); // 2% penalty per critical alert
    score -= alertPenalty;

    return Math.max(0, Math.min(1, score / Math.max(1, factors)));
  }

  /**
   * Calculate workflow success rate
   */
  calculateSuccessRate(workflowStats) {
    if (!workflowStats || workflowStats.length === 0) return null;
    
    let totalStarted = 0;
    let totalCompleted = 0;
    
    for (const stat of workflowStats) {
      totalStarted += stat.totalStarted || 0;
      totalCompleted += stat.totalCompleted || 0;
    }
    
    return totalStarted > 0 ? totalCompleted / totalStarted : null;
  }

  /**
   * Calculate average workflow duration
   */
  calculateAvgDuration(workflowStats) {
    if (!workflowStats || workflowStats.length === 0) return 0;
    
    const durations = workflowStats.map(s => s.avgDuration || 0).filter(d => d > 0);
    return durations.length > 0 ? durations.reduce((sum, d) => sum + d, 0) / durations.length : 0;
  }

  /**
   * Calculate API success rate
   */
  calculateAPISuccessRate(apiProviders) {
    if (!apiProviders || apiProviders.length === 0) return null;
    
    let totalRequests = 0;
    let totalSuccessful = 0;
    
    for (const provider of apiProviders) {
      totalRequests += provider.stats.totalRequests || 0;
      totalSuccessful += provider.stats.successfulRequests || 0;
    }
    
    return totalRequests > 0 ? totalSuccessful / totalRequests : null;
  }

  /**
   * Calculate budget utilization
   */
  calculateBudgetUtilization(budgetData) {
    if (!budgetData) return 0;
    
    const utilizationValues = Object.values(budgetData).map(b => b.daily || 0);
    return utilizationValues.length > 0 ? 
      utilizationValues.reduce((sum, u) => sum + u, 0) / utilizationValues.length : 0;
  }

  /**
   * Get top cost provider
   */
  getTopCostProvider(costByProvider) {
    if (!costByProvider) return null;
    
    let maxCost = 0;
    let topProvider = null;
    
    for (const [provider, cost] of Object.entries(costByProvider)) {
      if (cost > maxCost) {
        maxCost = cost;
        topProvider = provider;
      }
    }
    
    return topProvider;
  }

  /**
   * Get historical data for components
   */
  getHistoricalData(component, timerange) {
    // This would implement historical data retrieval
    // For now, return mock structure
    const now = Date.now();
    const ranges = {
      '1h': 3600000,
      '6h': 6 * 3600000,
      '24h': 24 * 3600000,
      '7d': 7 * 24 * 3600000
    };
    
    const window = ranges[timerange] || ranges['24h'];
    const points = 50; // Number of data points
    const interval = window / points;
    
    const data = [];
    for (let i = 0; i < points; i++) {
      const timestamp = now - window + (i * interval);
      data.push({
        timestamp,
        value: Math.random() * 100 // Mock data
      });
    }
    
    return {
      component,
      timerange,
      data,
      summary: {
        min: Math.min(...data.map(d => d.value)),
        max: Math.max(...data.map(d => d.value)),
        avg: data.reduce((sum, d) => sum + d.value, 0) / data.length
      }
    };
  }

  /**
   * Start real-time updates
   */
  startRealtimeUpdates() {
    // Send updates every 30 seconds
    this.realtimeUpdateInterval = setInterval(async () => {
      if (this.connectedClients.size === 0) return;
      
      try {
        const overview = await this.generateSystemOverview();
        io.emit('update:overview', overview);
        
        // Send specific updates
        const workflows = {
          active: workflowMonitor.getActiveWorkflows(),
          stats: workflowMonitor.getWorkflowStats().slice(0, 10)
        };
        io.emit('update:workflows', workflows);
        
        const workers = {
          health: workerHealthMonitor.getHealthStatus(),
          types: workerHealthMonitor.getWorkerTypeStats()
        };
        io.emit('update:workers', workers);
        
        const alerts = {
          active: Array.from(alertManager.activeAlerts.values()),
          stats: alertManager.getAlertStats()
        };
        io.emit('update:alerts', alerts);
        
      } catch (error) {
        logger.error('Failed to send real-time updates', { error: error.message });
      }
    }, 30000);
    
    logger.info('Started real-time dashboard updates');
  }

  /**
   * Stop real-time updates
   */
  stopRealtimeUpdates() {
    if (this.realtimeUpdateInterval) {
      clearInterval(this.realtimeUpdateInterval);
      this.realtimeUpdateInterval = null;
    }
    
    logger.info('Stopped real-time dashboard updates');
  }

  /**
   * Start the dashboard server
   */
  start(port = process.env.DASHBOARD_PORT || 3004) {
    server.listen(port, () => {
      logger.info('Dashboard server started', { 
        port,
        environment: process.env.NODE_ENV || 'development'
      });
      
      // Setup event listeners for monitoring components
      this.setupEventListeners();
    });
    
    return server;
  }

  /**
   * Setup event listeners for monitoring components
   */
  setupEventListeners() {
    // Alert events
    alertManager.on('alert:created', (alert) => {
      io.emit('alert:new', alert);
    });
    
    alertManager.on('alert:resolved', (alert) => {
      io.emit('alert:resolved', alert);
    });
    
    // Workflow events
    workflowMonitor.on('workflow:stuck', (data) => {
      io.emit('workflow:stuck', data);
    });
    
    // Worker events
    workerHealthMonitor.on('worker:status_change', (data) => {
      io.emit('worker:status_change', data);
    });
    
    workerHealthMonitor.on('worker:consecutive_failures', (data) => {
      io.emit('worker:consecutive_failures', data);
    });
    
    // API events
    apiIntegrationMonitor.on('circuit_breaker:open', (data) => {
      io.emit('api:circuit_breaker_open', data);
    });
    
    apiIntegrationMonitor.on('provider:unhealthy', (data) => {
      io.emit('api:provider_unhealthy', data);
    });
    
    // Cost events
    costTracker.on('budget:alert', (alert) => {
      io.emit('cost:budget_alert', alert);
    });
    
    costTracker.on('budget:emergency', (alert) => {
      io.emit('cost:budget_emergency', alert);
    });
  }

  /**
   * Stop the dashboard server
   */
  stop() {
    this.stopRealtimeUpdates();
    
    if (server) {
      server.close();
      logger.info('Dashboard server stopped');
    }
  }
}

// Export singleton instance
const dashboardServer = new DashboardServer();

export { DashboardServer, dashboardServer };
export default dashboardServer;