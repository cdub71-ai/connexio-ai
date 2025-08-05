#!/usr/bin/env node

/**
 * Auto-scaling CLI Tool for Connexio AI Fly.io Deployment
 * Provides command-line interface for managing auto-scaling
 */

import { Command } from 'commander';
import axios from 'axios';
import chalk from 'chalk';
import Table from 'cli-table3';

const program = new Command();
const AUTOSCALING_API = process.env.AUTOSCALING_API || 'http://connexio-ai-autoscaling.internal:3003';

// Helper function to format timestamps
function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString();
}

// Helper function to format duration
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

// Helper function to make API requests
async function apiRequest(endpoint, method = 'GET', data = null) {
  try {
    const config = {
      method,
      url: `${AUTOSCALING_API}${endpoint}`,
      timeout: 10000,
    };
    
    if (data) {
      config.data = data;
      config.headers = { 'Content-Type': 'application/json' };
    }
    
    const response = await axios(config);
    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(`API Error: ${error.response.status} - ${error.response.data.message || error.response.statusText}`);
    } else if (error.request) {
      throw new Error('Network Error: Unable to connect to auto-scaling service');
    } else {
      throw new Error(`Request Error: ${error.message}`);
    }
  }
}

// Status command
program
  .command('status')
  .description('Show current scaling status for all applications')
  .action(async () => {
    try {
      console.log(chalk.blue('📊 Auto-scaling Status\n'));
      
      const status = await apiRequest('/scaling/status');
      
      const table = new Table({
        head: ['App', 'Current', 'Min', 'Max', 'Regions', 'Last Action', 'Cooldown'],
        colWidths: [25, 10, 8, 8, 15, 15, 12]
      });
      
      for (const [appName, appStatus] of Object.entries(status.applications)) {
        const config = appStatus.config;
        const lastAction = appStatus.lastAction;
        const cooldown = appStatus.cooldownRemaining;
        
        table.push([
          appName.replace('connexio-ai-', ''),
          'N/A', // Would get from metrics
          config.minMachines,
          config.maxMachines,
          config.regions.join(', '),
          lastAction ? `${lastAction.action} (${formatTimestamp(lastAction.timestamp)})` : 'None',
          cooldown > 0 ? formatDuration(cooldown) : 'Ready'
        ]);
      }
      
      console.log(table.toString());
      console.log(chalk.gray(`\nLast updated: ${formatTimestamp(status.timestamp)}`));
      
    } catch (error) {
      console.error(chalk.red('❌ Error getting status:'), error.message);
      process.exit(1);
    }
  });

// Metrics command
program
  .command('metrics')
  .description('Show current metrics for all applications')
  .option('-a, --app <app>', 'Show metrics for specific app')
  .option('-j, --json', 'Output in JSON format')
  .action(async (options) => {
    try {
      console.log(chalk.blue('📈 Application Metrics\n'));
      
      const data = await apiRequest('/scaling/metrics');
      
      if (options.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }
      
      const table = new Table({
        head: ['App', 'CPU %', 'Memory %', 'Machines', 'Queue Depth', 'Status'],
        colWidths: [25, 10, 12, 10, 12, 10]
      });
      
      for (const [appName, metrics] of Object.entries(data.metrics)) {
        if (options.app && !appName.includes(options.app)) continue;
        
        table.push([
          appName.replace('connexio-ai-', ''),
          metrics.cpu ? `${Math.round(metrics.cpu)}%` : 'N/A',
          metrics.memory ? `${Math.round(metrics.memory)}%` : 'N/A',
          `${metrics.activeMachines || 0}/${metrics.totalMachines || 0}`,
          metrics.queue_depth || metrics.enrichment_queue_depth || metrics.active_campaigns || 'N/A',
          metrics.healthy ? chalk.green('Healthy') : chalk.red('Unhealthy')
        ]);
      }
      
      console.log(table.toString());
      console.log(chalk.gray(`\nLast updated: ${formatTimestamp(data.timestamp)}`));
      
    } catch (error) {
      console.error(chalk.red('❌ Error getting metrics:'), error.message);
      process.exit(1);
    }
  });

// Scale command
program
  .command('scale <app> <action> <count>')
  .description('Manually scale an application')
  .option('-f, --force', 'Force scaling without confirmation')
  .action(async (app, action, count, options) => {
    try {
      const targetMachines = parseInt(count);
      if (isNaN(targetMachines) || targetMachines < 1) {
        console.error(chalk.red('❌ Invalid machine count'));
        process.exit(1);
      }
      
      if (!['up', 'down'].includes(action)) {
        console.error(chalk.red('❌ Action must be "up" or "down"'));
        process.exit(1);
      }
      
      const appName = app.startsWith('connexio-ai-') ? app : `connexio-ai-${app}`;
      
      if (!options.force) {
        const { default: inquirer } = await import('inquirer');
        const { confirm } = await inquirer.prompt([{
          type: 'confirm',
          name: 'confirm',
          message: `Scale ${action} ${appName} to ${targetMachines} machines?`,
          default: false
        }]);
        
        if (!confirm) {
          console.log(chalk.yellow('🚫 Scaling cancelled'));
          return;
        }
      }
      
      console.log(chalk.blue(`🔄 Scaling ${action} ${appName} to ${targetMachines} machines...`));
      
      const result = await apiRequest(`/scaling/${appName}/scale-${action}`, 'POST', {
        targetMachines
      });
      
      console.log(chalk.green('✅'), result.message);
      
    } catch (error) {
      console.error(chalk.red('❌ Error scaling application:'), error.message);
      process.exit(1);
    }
  });

// Analyze command
program
  .command('analyze')
  .description('Trigger manual scaling analysis')
  .option('-v, --verbose', 'Show detailed analysis results')
  .action(async (options) => {
    try {
      console.log(chalk.blue('🔍 Running scaling analysis...\n'));
      
      const result = await apiRequest('/scaling/analyze', 'POST');
      
      if (options.verbose) {
        console.log(chalk.green('✅ Analysis completed:\n'));
        console.log(JSON.stringify(result, null, 2));
      } else {
        const summary = result.summary;
        console.log(chalk.green('✅ Analysis completed:'));
        console.log(`  • ${summary.totalApps} applications analyzed`);
        console.log(`  • ${summary.scaleUpActions} scale-up actions`);
        console.log(`  • ${summary.scaleDownActions} scale-down actions`);
        console.log(`  • ${summary.maintainActions} maintained current size`);
        console.log(`  • ${summary.waitActions} waiting in cooldown`);
      }
      
    } catch (error) {
      console.error(chalk.red('❌ Error running analysis:'), error.message);
      process.exit(1);
    }
  });

// History command
program
  .command('history')
  .description('Show scaling history')
  .option('-l, --limit <limit>', 'Limit number of entries', '10')
  .option('-a, --app <app>', 'Filter by application')
  .action(async (options) => {
    try {
      console.log(chalk.blue('📊 Scaling History\n'));
      
      const data = await apiRequest('/scaling/history');
      const limit = parseInt(options.limit) || 10;
      
      const table = new Table({
        head: ['Timestamp', 'App', 'CPU %', 'Memory %', 'Machines', 'Action Needed'],
        colWidths: [20, 25, 10, 12, 10, 15]
      });
      
      for (const entry of data.history.slice(0, limit)) {
        for (const [appName, metrics] of Object.entries(entry.metrics)) {
          if (options.app && !appName.includes(options.app)) continue;
          
          table.push([
            formatTimestamp(entry.timestamp),
            appName.replace('connexio-ai-', ''),
            metrics.cpu ? `${Math.round(metrics.cpu)}%` : 'N/A',
            metrics.memory ? `${Math.round(metrics.memory)}%` : 'N/A',
            `${metrics.activeMachines || 0}`,
            'N/A' // Would calculate from metrics
          ]);
        }
      }
      
      console.log(table.toString());
      
    } catch (error) {
      console.error(chalk.red('❌ Error getting history:'), error.message);
      process.exit(1);
    }
  });

// Config command
program
  .command('config')
  .description('Show auto-scaling configuration')
  .option('-a, --app <app>', 'Show config for specific app')
  .action(async (options) => {
    try {
      console.log(chalk.blue('⚙️  Auto-scaling Configuration\n'));
      
      const data = await apiRequest('/scaling/config');
      
      for (const [appName, config] of Object.entries(data.config)) {
        if (options.app && !appName.includes(options.app)) continue;
        
        console.log(chalk.yellow(`${appName}:`));
        console.log(`  Machines: ${config.minMachines} - ${config.maxMachines}`);
        console.log(`  Regions: ${config.targetRegions.join(', ')}`);
        console.log(`  Scale Up Threshold: ${config.scaleUpThreshold}`);
        console.log(`  Scale Down Threshold: ${config.scaleDownThreshold}`);
        console.log(`  Cooldowns: Up ${config.scaleUpCooldown}s, Down ${config.scaleDownCooldown}s`);
        
        console.log('  Metrics:');
        for (const [metric, metricConfig] of Object.entries(config.metrics)) {
          console.log(`    • ${metric}: target ${metricConfig.target}, weight ${metricConfig.weight}`);
        }
        console.log();
      }
      
    } catch (error) {
      console.error(chalk.red('❌ Error getting config:'), error.message);
      process.exit(1);
    }
  });

// Health command
program
  .command('health')
  .description('Check auto-scaling service health')
  .action(async () => {
    try {
      const health = await apiRequest('/health');
      
      console.log(chalk.green('✅ Auto-scaling service is healthy'));
      console.log(`   Service: ${health.service}`);
      console.log(`   Status: ${health.status}`);
      console.log(`   Uptime: ${formatDuration(health.uptime * 1000)}`);
      console.log(`   Last check: ${formatTimestamp(health.timestamp)}`);
      
    } catch (error) {
      console.error(chalk.red('❌ Auto-scaling service is unhealthy:'), error.message);
      process.exit(1);
    }
  });

// Main program setup
program
  .name('scaling-cli')
  .description('CLI tool for managing Connexio AI auto-scaling')
  .version('1.0.0');

// Parse command line arguments
program.parse();

// If no command provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}