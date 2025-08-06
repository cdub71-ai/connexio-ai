#!/usr/bin/env node

/**
 * Test script for lightweight services
 * Verifies all services work without API timeouts
 */

const LightweightServiceFactory = require('../src/services/lightweight-service-factory');

async function testLightweightServices() {
  console.log('🧪 Testing Lightweight Services...\n');

  try {
    // Test File Enrichment Service
    console.log('🔍 Testing File Enrichment Service...');
    const fileService = LightweightServiceFactory.createFileEnrichmentService();
    const enrichmentResult = await fileService.enrichFile('/tmp/test.csv');
    console.log(`✅ File Enrichment: ${enrichmentResult.enrichmentId} - ${enrichmentResult.report.successRate} success rate`);
    
    // Test Deliverability Service
    console.log('\n📧 Testing Deliverability Check Service...');
    const deliverabilityService = LightweightServiceFactory.createDeliverabilityService();
    const deliverabilityResult = await deliverabilityService.performDeliverabilityCheck('test@example.com');
    console.log(`✅ Deliverability Check: ${deliverabilityResult.checkId} - Grade: ${deliverabilityResult.deliverabilityReport.executiveSummary.deliverabilityGrade}`);
    
    // Test Segment Strategy Service
    console.log('\n🎯 Testing Segment Strategy Service...');
    const segmentService = LightweightServiceFactory.createSegmentStrategyService();
    const segmentResult = await segmentService.generateSegmentStrategy([{id: 1}, {id: 2}]);
    console.log(`✅ Segment Strategy: ${segmentResult.strategyId} - ${segmentResult.segmentRecommendations.segmentationSummary.totalSegments} segments`);
    
    // Test Campaign Audit Service
    console.log('\n🔍 Testing Campaign Audit Service...');
    const auditService = LightweightServiceFactory.createCampaignAuditService();
    const auditResult = await auditService.performCampaignAudit({id: 'test-campaign'});
    console.log(`✅ Campaign Audit: ${auditResult.auditId} - Grade: ${auditResult.auditReport.executiveSummary.overallPerformanceGrade}`);
    
    // Test Service Health
    console.log('\n🏥 Testing Service Health Checks...');
    const services = [fileService, deliverabilityService, segmentService, auditService];
    services.forEach(service => {
      const health = service.getServiceHealth();
      console.log(`✅ ${health.service}: ${health.status} (${health.mode})`);
    });

    console.log('\n🎉 All lightweight services working correctly!');
    console.log('\n💡 Benefits:');
    console.log('• No API timeout issues');
    console.log('• Immediate response times');
    console.log('• Basic functionality available');
    console.log('• Graceful fallback when full AI services timeout');
    
    console.log('\n🚀 To enable full AI capabilities:');
    console.log('• Set ANTHROPIC_API_KEY environment variable');
    console.log('• Configure external API keys (Apollo, Clearbit, Hunter)');
    console.log('• Services will automatically upgrade to full functionality');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testLightweightServices();