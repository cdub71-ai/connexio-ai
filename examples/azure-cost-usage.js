/**
 * Azure Cost Service Usage Examples
 * Demonstrates how to retrieve Azure daily costs by resource type
 */

import AzureCostService from '../services/azure-cost-service.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function demonstrateAzureCostService() {
  try {
    console.log('🔷 Azure Cost Service Demo\n');

    // Initialize the service
    const azureCostService = new AzureCostService({
      subscriptionId: process.env.AZURE_SUBSCRIPTION_ID,
      resourceGroupName: process.env.AZURE_RESOURCE_GROUP // Optional
    });

    console.log('✅ Azure Cost Service initialized');
    console.log(`📋 Subscription ID: ${process.env.AZURE_SUBSCRIPTION_ID}`);

    // Validate access first
    console.log('\n🔐 Validating Azure access...');
    const hasAccess = await azureCostService.validateAccess();
    
    if (!hasAccess) {
      console.error('❌ Cannot access Azure subscription. Please check:');
      console.log('   1. Azure credentials are properly configured');
      console.log('   2. Subscription ID is correct');
      console.log('   3. Service principal has Cost Management Reader role');
      return;
    }
    
    console.log('✅ Azure access validated successfully');

    // Example 1: Get today's costs by resource type
    console.log('\n📊 Example 1: Today\'s costs by resource type');
    try {
      const todaysCosts = await azureCostService.getTodaysCostsByResourceType();
      
      console.log(`💰 Total cost today: $${todaysCosts.summary.totalCost} ${todaysCosts.summary.currency}`);
      console.log(`📈 Resource types: ${todaysCosts.summary.resourceTypeCount}`);
      
      if (todaysCosts.resourceTypeBreakdown.length > 0) {
        console.log('\nTop 5 resource types by cost:');
        todaysCosts.resourceTypeBreakdown.slice(0, 5).forEach((resource, index) => {
          console.log(`   ${index + 1}. ${resource.resourceType}: $${resource.totalCost}`);
        });
      } else {
        console.log('   No cost data available for today yet');
      }
    } catch (error) {
      console.log(`   ⚠️ Today's data not available: ${error.message}`);
    }

    // Example 2: Get yesterday's costs by resource type
    console.log('\n📊 Example 2: Yesterday\'s costs by resource type');
    const yesterdaysCosts = await azureCostService.getYesterdaysCostsByResourceType();
    
    console.log(`💰 Total cost yesterday: $${yesterdaysCosts.summary.totalCost} ${yesterdaysCosts.summary.currency}`);
    console.log(`📈 Resource types: ${yesterdaysCosts.summary.resourceTypeCount}`);
    
    if (yesterdaysCosts.resourceTypeBreakdown.length > 0) {
      console.log('\nTop 5 resource types by cost:');
      yesterdaysCosts.resourceTypeBreakdown.slice(0, 5).forEach((resource, index) => {
        console.log(`   ${index + 1}. ${resource.resourceType}: $${resource.totalCost}`);
      });
    }

    // Example 3: Get cost breakdown for a specific date range
    console.log('\n📊 Example 3: Cost breakdown for last 7 days');
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const weekCosts = await azureCostService.getDailyCostsByResourceType({
      startDate,
      endDate
    });
    
    console.log(`💰 Total cost (7 days): $${weekCosts.summary.totalCost} ${weekCosts.summary.currency}`);
    console.log(`📅 Date range: ${weekCosts.summary.dateRange.startDate} to ${weekCosts.summary.dateRange.endDate}`);
    
    console.log('\nDaily breakdown:');
    weekCosts.dailyBreakdown.forEach(day => {
      console.log(`   ${day.date}: $${day.totalCost} (${day.resourceTypes.length} resource types)`);
    });

    // Example 4: Get cost trend analysis
    console.log('\n📊 Example 4: Cost trend analysis (last 7 days)');
    const trendData = await azureCostService.getCostTrend(7);
    
    console.log(`📈 Trend: ${trendData.trendAnalysis.trend}`);
    console.log(`📊 Analysis: ${trendData.trendAnalysis.analysis}`);
    console.log(`📉 Min daily cost: $${trendData.trendAnalysis.minDailyCost}`);
    console.log(`📈 Max daily cost: $${trendData.trendAnalysis.maxDailyCost}`);

    // Example 5: Filter by specific resource types
    console.log('\n📊 Example 5: Costs for specific resource types');
    const specificResourceCosts = await azureCostService.getDailyCostsByResourceType({
      startDate,
      endDate,
      resourceTypes: ['microsoft.compute/virtualmachines', 'microsoft.storage/storageaccounts']
    });
    
    console.log(`💰 Filtered total cost: $${specificResourceCosts.summary.totalCost} ${specificResourceCosts.summary.currency}`);
    console.log('Resource breakdown:');
    specificResourceCosts.resourceTypeBreakdown.forEach(resource => {
      console.log(`   ${resource.resourceType}: $${resource.totalCost}`);
    });

    // Example 6: Get available resource types
    console.log('\n📊 Example 6: Available resource types in subscription');
    const availableTypes = await azureCostService.getAvailableResourceTypes();
    
    console.log(`📋 Found ${availableTypes.length} resource types:`);
    availableTypes.slice(0, 10).forEach((type, index) => {
      console.log(`   ${index + 1}. ${type}`);
    });
    
    if (availableTypes.length > 10) {
      console.log(`   ... and ${availableTypes.length - 10} more`);
    }

    console.log('\n✅ Azure Cost Service demo completed successfully!');

  } catch (error) {
    console.error('❌ Demo failed:', error.message);
    console.error('Stack trace:', error.stack);
    
    // Common troubleshooting tips
    console.log('\n🔧 Troubleshooting tips:');
    console.log('1. Ensure AZURE_SUBSCRIPTION_ID environment variable is set');
    console.log('2. Verify Azure credentials are configured (az login or service principal)');
    console.log('3. Check that the identity has "Cost Management Reader" role on the subscription');
    console.log('4. Ensure the subscription has cost data available');
  }
}

// Helper function to show environment setup
function showEnvironmentSetup() {
  console.log('🔧 Environment Setup Required:');
  console.log('');
  console.log('1. Set environment variables in .env file:');
  console.log('   AZURE_SUBSCRIPTION_ID=your-subscription-id');
  console.log('   AZURE_RESOURCE_GROUP=your-resource-group (optional)');
  console.log('');
  console.log('2. Ensure Azure authentication is configured:');
  console.log('   - Run "az login" for user authentication, OR');
  console.log('   - Set service principal environment variables:');
  console.log('     AZURE_CLIENT_ID=your-client-id');
  console.log('     AZURE_CLIENT_SECRET=your-client-secret');
  console.log('     AZURE_TENANT_ID=your-tenant-id');
  console.log('');
  console.log('3. Grant "Cost Management Reader" role to the identity');
  console.log('');
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.env.AZURE_SUBSCRIPTION_ID) {
    showEnvironmentSetup();
    process.exit(1);
  }
  
  demonstrateAzureCostService().catch(console.error);
}

export { demonstrateAzureCostService, showEnvironmentSetup };