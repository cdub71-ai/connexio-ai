/**
 * Azure Cost Management Service
 * Retrieves daily Azure costs broken down by resource type
 */

import { DefaultAzureCredential } from '@azure/identity';
import { createServiceLogger } from '../monitoring/logger.js';

const logger = createServiceLogger('azure-cost-service');

class AzureCostService {
  constructor(options = {}) {
    this.subscriptionId = options.subscriptionId || process.env.AZURE_SUBSCRIPTION_ID;
    this.resourceGroupName = options.resourceGroupName || process.env.AZURE_RESOURCE_GROUP;
    
    // Cost Management API base URL
    this.baseUrl = 'https://management.azure.com';
    this.apiVersion = '2023-11-01';
    
    // Initialize Azure credentials
    this.credential = new DefaultAzureCredential();
    
    // Cost aggregation settings
    this.config = {
      granularity: 'Daily',
      groupBy: [
        { type: 'Dimension', name: 'ResourceType' },
        { type: 'Dimension', name: 'ResourceGroupName' },
        { type: 'Dimension', name: 'ServiceName' }
      ],
      filter: options.filter || null
    };

    if (!this.subscriptionId) {
      throw new Error('Azure subscription ID is required. Set AZURE_SUBSCRIPTION_ID environment variable.');
    }
  }

  /**
   * Retrieve daily costs by resource type for a specific date range
   * @param {Object} options - Query options
   * @param {string} options.startDate - Start date (YYYY-MM-DD)
   * @param {string} options.endDate - End date (YYYY-MM-DD)
   * @param {string[]} options.resourceTypes - Specific resource types to filter
   * @param {string} options.resourceGroup - Specific resource group to filter
   * @returns {Promise<Object>} Daily cost breakdown by resource type
   */
  async getDailyCostsByResourceType(options = {}) {
    try {
      logger.info('Retrieving Azure daily costs by resource type', { options });

      // Default to current date if no dates provided
      const endDate = options.endDate || new Date().toISOString().split('T')[0];
      const startDate = options.startDate || this.getPreviousDay(endDate);

      // Build query payload
      const queryPayload = this.buildCostQuery({
        startDate,
        endDate,
        resourceTypes: options.resourceTypes,
        resourceGroup: options.resourceGroup
      });

      // Execute cost management query
      const costData = await this.executeQueryRequest(queryPayload);

      // Process and format the response
      const processedData = this.processCostData(costData, { startDate, endDate });

      logger.info('Successfully retrieved Azure cost data', {
        recordCount: processedData.totalRecords,
        totalCost: processedData.summary.totalCost,
        dateRange: `${startDate} to ${endDate}`
      });

      return processedData;

    } catch (error) {
      logger.error('Failed to retrieve Azure costs by resource type', { 
        error: error.message,
        stack: error.stack 
      });
      throw error;
    }
  }

  /**
   * Get today's costs by resource type
   * @returns {Promise<Object>} Today's cost breakdown
   */
  async getTodaysCostsByResourceType() {
    const today = new Date().toISOString().split('T')[0];
    return this.getDailyCostsByResourceType({
      startDate: today,
      endDate: today
    });
  }

  /**
   * Get yesterday's costs by resource type
   * @returns {Promise<Object>} Yesterday's cost breakdown
   */
  async getYesterdaysCostsByResourceType() {
    const yesterday = this.getPreviousDay();
    return this.getDailyCostsByResourceType({
      startDate: yesterday,
      endDate: yesterday
    });
  }

  /**
   * Get cost trend over the last N days
   * @param {number} days - Number of days to look back
   * @returns {Promise<Object>} Cost trend data
   */
  async getCostTrend(days = 7) {
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const costData = await this.getDailyCostsByResourceType({
      startDate,
      endDate
    });

    return {
      ...costData,
      trendAnalysis: this.calculateTrendAnalysis(costData.dailyBreakdown)
    };
  }

  /**
   * Build Cost Management API query payload
   * @param {Object} params - Query parameters
   * @returns {Object} Query payload for Azure Cost Management API
   */
  buildCostQuery(params) {
    const { startDate, endDate, resourceTypes, resourceGroup } = params;

    // Base query structure
    const query = {
      type: 'ActualCost',
      dataSet: {
        granularity: this.config.granularity,
        aggregation: {
          totalCost: {
            name: 'PreTaxCost',
            function: 'Sum'
          }
        },
        grouping: this.config.groupBy,
        sorting: [
          {
            direction: 'ascending',
            name: 'UsageDate'
          }
        ]
      },
      timeframe: 'Custom',
      timePeriod: {
        from: `${startDate}T00:00:00+00:00`,
        to: `${endDate}T23:59:59+00:00`
      }
    };

    // Add filters if specified
    const filters = [];

    // Resource group filter
    if (resourceGroup) {
      filters.push({
        dimensions: {
          name: 'ResourceGroupName',
          operator: 'In',
          values: [resourceGroup]
        }
      });
    }

    // Resource type filter
    if (resourceTypes && resourceTypes.length > 0) {
      filters.push({
        dimensions: {
          name: 'ResourceType',
          operator: 'In',
          values: resourceTypes
        }
      });
    }

    // Apply filters if any exist
    if (filters.length > 0) {
      query.dataSet.filter = filters.length === 1 ? filters[0] : {
        and: filters
      };
    }

    return query;
  }

  /**
   * Execute the cost management query
   * @param {Object} queryPayload - Query payload
   * @returns {Promise<Object>} API response
   */
  async executeQueryRequest(queryPayload) {
    try {
      // Get access token
      const tokenResponse = await this.credential.getToken('https://management.azure.com/.default');
      
      const url = `${this.baseUrl}/subscriptions/${this.subscriptionId}/providers/Microsoft.CostManagement/query?api-version=${this.apiVersion}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenResponse.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(queryPayload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Azure Cost Management API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      return data;

    } catch (error) {
      logger.error('Failed to execute Azure Cost Management query', { error: error.message });
      throw error;
    }
  }

  /**
   * Process and format cost data response
   * @param {Object} apiResponse - Raw API response
   * @param {Object} options - Processing options
   * @returns {Object} Formatted cost data
   */
  processCostData(apiResponse, options) {
    const { startDate, endDate } = options;
    
    if (!apiResponse.properties || !apiResponse.properties.rows) {
      return {
        summary: {
          totalCost: 0,
          currency: 'USD',
          dateRange: { startDate, endDate },
          resourceTypeCount: 0
        },
        dailyBreakdown: [],
        resourceTypeBreakdown: [],
        resourceGroupBreakdown: [],
        totalRecords: 0
      };
    }

    const rows = apiResponse.properties.rows;
    const columns = apiResponse.properties.columns.map(col => col.name);

    // Process each row of data
    const processedRows = rows.map(row => {
      const record = {};
      columns.forEach((colName, index) => {
        record[colName] = row[index];
      });
      return record;
    });

    // Group by date
    const dailyBreakdown = this.groupByDate(processedRows);
    
    // Group by resource type
    const resourceTypeBreakdown = this.groupByResourceType(processedRows);
    
    // Group by resource group
    const resourceGroupBreakdown = this.groupByResourceGroup(processedRows);

    // Calculate summary
    const totalCost = processedRows.reduce((sum, record) => sum + (record.PreTaxCost || 0), 0);
    const currency = processedRows.length > 0 ? processedRows[0].Currency : 'USD';

    return {
      summary: {
        totalCost: parseFloat(totalCost.toFixed(2)),
        currency,
        dateRange: { startDate, endDate },
        resourceTypeCount: Object.keys(resourceTypeBreakdown).length,
        resourceGroupCount: Object.keys(resourceGroupBreakdown).length
      },
      dailyBreakdown,
      resourceTypeBreakdown,
      resourceGroupBreakdown,
      totalRecords: processedRows.length,
      rawData: processedRows
    };
  }

  /**
   * Group cost data by date
   * @param {Array} records - Processed records
   * @returns {Object} Daily breakdown
   */
  groupByDate(records) {
    const dailyData = {};

    records.forEach(record => {
      const date = record.UsageDate ? record.UsageDate.split('T')[0] : 'unknown';
      if (!dailyData[date]) {
        dailyData[date] = {
          date,
          totalCost: 0,
          resourceTypes: {},
          records: []
        };
      }

      dailyData[date].totalCost += record.PreTaxCost || 0;
      dailyData[date].records.push(record);

      // Track resource types for this date
      const resourceType = record.ResourceType || 'unknown';
      if (!dailyData[date].resourceTypes[resourceType]) {
        dailyData[date].resourceTypes[resourceType] = 0;
      }
      dailyData[date].resourceTypes[resourceType] += record.PreTaxCost || 0;
    });

    // Convert to array and sort by date
    return Object.values(dailyData)
      .map(day => ({
        ...day,
        totalCost: parseFloat(day.totalCost.toFixed(2)),
        resourceTypes: Object.entries(day.resourceTypes).map(([type, cost]) => ({
          resourceType: type,
          cost: parseFloat(cost.toFixed(2))
        })).sort((a, b) => b.cost - a.cost)
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Group cost data by resource type
   * @param {Array} records - Processed records
   * @returns {Object} Resource type breakdown
   */
  groupByResourceType(records) {
    const typeData = {};

    records.forEach(record => {
      const resourceType = record.ResourceType || 'unknown';
      if (!typeData[resourceType]) {
        typeData[resourceType] = {
          resourceType,
          totalCost: 0,
          resourceGroups: {},
          recordCount: 0
        };
      }

      typeData[resourceType].totalCost += record.PreTaxCost || 0;
      typeData[resourceType].recordCount += 1;

      // Track resource groups for this type
      const resourceGroup = record.ResourceGroupName || 'unknown';
      if (!typeData[resourceType].resourceGroups[resourceGroup]) {
        typeData[resourceType].resourceGroups[resourceGroup] = 0;
      }
      typeData[resourceType].resourceGroups[resourceGroup] += record.PreTaxCost || 0;
    });

    // Convert to array and sort by cost
    return Object.values(typeData)
      .map(type => ({
        ...type,
        totalCost: parseFloat(type.totalCost.toFixed(2)),
        resourceGroups: Object.entries(type.resourceGroups).map(([group, cost]) => ({
          resourceGroup: group,
          cost: parseFloat(cost.toFixed(2))
        })).sort((a, b) => b.cost - a.cost)
      }))
      .sort((a, b) => b.totalCost - a.totalCost);
  }

  /**
   * Group cost data by resource group
   * @param {Array} records - Processed records
   * @returns {Object} Resource group breakdown
   */
  groupByResourceGroup(records) {
    const groupData = {};

    records.forEach(record => {
      const resourceGroup = record.ResourceGroupName || 'unknown';
      if (!groupData[resourceGroup]) {
        groupData[resourceGroup] = {
          resourceGroup,
          totalCost: 0,
          resourceTypes: {},
          recordCount: 0
        };
      }

      groupData[resourceGroup].totalCost += record.PreTaxCost || 0;
      groupData[resourceGroup].recordCount += 1;

      // Track resource types for this group
      const resourceType = record.ResourceType || 'unknown';
      if (!groupData[resourceGroup].resourceTypes[resourceType]) {
        groupData[resourceGroup].resourceTypes[resourceType] = 0;
      }
      groupData[resourceGroup].resourceTypes[resourceType] += record.PreTaxCost || 0;
    });

    // Convert to array and sort by cost
    return Object.values(groupData)
      .map(group => ({
        ...group,
        totalCost: parseFloat(group.totalCost.toFixed(2)),
        resourceTypes: Object.entries(group.resourceTypes).map(([type, cost]) => ({
          resourceType: type,
          cost: parseFloat(cost.toFixed(2))
        })).sort((a, b) => b.cost - a.cost)
      }))
      .sort((a, b) => b.totalCost - a.totalCost);
  }

  /**
   * Calculate trend analysis for daily breakdown
   * @param {Array} dailyBreakdown - Daily cost data
   * @returns {Object} Trend analysis
   */
  calculateTrendAnalysis(dailyBreakdown) {
    if (dailyBreakdown.length < 2) {
      return { trend: 'insufficient_data', analysis: 'Not enough data points for trend analysis' };
    }

    const costs = dailyBreakdown.map(day => day.totalCost);
    const avgCost = costs.reduce((sum, cost) => sum + cost, 0) / costs.length;
    
    // Calculate simple trend (comparing first half to second half)
    const midPoint = Math.floor(costs.length / 2);
    const firstHalfAvg = costs.slice(0, midPoint).reduce((sum, cost) => sum + cost, 0) / midPoint;
    const secondHalfAvg = costs.slice(midPoint).reduce((sum, cost) => sum + cost, 0) / (costs.length - midPoint);
    
    const trendPercentage = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;
    
    let trend = 'stable';
    if (trendPercentage > 10) trend = 'increasing';
    else if (trendPercentage < -10) trend = 'decreasing';

    return {
      trend,
      trendPercentage: parseFloat(trendPercentage.toFixed(2)),
      averageDailyCost: parseFloat(avgCost.toFixed(2)),
      minDailyCost: Math.min(...costs),
      maxDailyCost: Math.max(...costs),
      analysis: this.generateTrendAnalysis(trend, trendPercentage, avgCost)
    };
  }

  /**
   * Generate human-readable trend analysis
   * @param {string} trend - Trend direction
   * @param {number} percentage - Trend percentage
   * @param {number} avgCost - Average cost
   * @returns {string} Analysis text
   */
  generateTrendAnalysis(trend, percentage, avgCost) {
    switch (trend) {
      case 'increasing':
        return `Costs are trending upward with a ${percentage.toFixed(1)}% increase. Average daily cost: $${avgCost.toFixed(2)}`;
      case 'decreasing':
        return `Costs are trending downward with a ${Math.abs(percentage).toFixed(1)}% decrease. Average daily cost: $${avgCost.toFixed(2)}`;
      case 'stable':
        return `Costs are relatively stable with minimal variation. Average daily cost: $${avgCost.toFixed(2)}`;
      default:
        return `Insufficient data for trend analysis. Average daily cost: $${avgCost.toFixed(2)}`;
    }
  }

  /**
   * Get previous day date string
   * @param {string} date - Base date (YYYY-MM-DD)
   * @returns {string} Previous day date
   */
  getPreviousDay(date = null) {
    const baseDate = date ? new Date(date) : new Date();
    baseDate.setDate(baseDate.getDate() - 1);
    return baseDate.toISOString().split('T')[0];
  }

  /**
   * Validate Azure subscription access
   * @returns {Promise<boolean>} Access validation result
   */
  async validateAccess() {
    try {
      logger.info('Validating Azure subscription access');
      
      const tokenResponse = await this.credential.getToken('https://management.azure.com/.default');
      
      // Test with a simple subscription details call
      const url = `${this.baseUrl}/subscriptions/${this.subscriptionId}?api-version=2020-01-01`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${tokenResponse.token}`,
          'Content-Type': 'application/json',
        }
      });

      const isValid = response.ok;
      
      logger.info('Azure access validation result', { isValid, status: response.status });
      
      return isValid;

    } catch (error) {
      logger.error('Azure access validation failed', { error: error.message });
      return false;
    }
  }

  /**
   * Get available resource types in the subscription
   * @returns {Promise<Array>} List of available resource types
   */
  async getAvailableResourceTypes() {
    try {
      const yesterday = this.getPreviousDay();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const costData = await this.getDailyCostsByResourceType({
        startDate: thirtyDaysAgo,
        endDate: yesterday
      });

      const resourceTypes = costData.resourceTypeBreakdown
        .map(item => item.resourceType)
        .filter(type => type !== 'unknown')
        .sort();

      logger.info('Retrieved available resource types', { count: resourceTypes.length });
      
      return resourceTypes;

    } catch (error) {
      logger.error('Failed to get available resource types', { error: error.message });
      return [];
    }
  }
}

export default AzureCostService;