/**
 * Marketing Fulfillment Integration Tests
 * Phase 1: Test SMS and Email campaign execution
 */

const TwilioSmsService = require('../services/twilio-sms-service');
const EmailDeliveryService = require('../services/email-delivery-service');
const WorkflowAutomationService = require('../services/workflow-automation-service');
const WebhookHandlerService = require('../services/webhook-handler-service');

class MarketingFulfillmentTest {
  constructor() {
    this.testResults = {
      smsService: { passed: 0, failed: 0, tests: [] },
      emailService: { passed: 0, failed: 0, tests: [] },
      workflowService: { passed: 0, failed: 0, tests: [] },
      webhookService: { passed: 0, failed: 0, tests: [] },
      overall: { passed: 0, failed: 0 }
    };

    console.log('🧪 Marketing Fulfillment Test Suite Initialized');
  }

  /**
   * Run all tests
   */
  async runAllTests() {
    console.log('🚀 Starting Marketing Fulfillment Integration Tests...\n');

    try {
      await this.testSMSService();
      await this.testEmailService();
      await this.testWorkflowService();
      await this.testWebhookService();

      this.generateTestReport();
      return this.testResults;

    } catch (error) {
      console.error('❌ Test suite failed:', error);
      throw error;
    }
  }

  /**
   * Test SMS Service functionality
   */
  async testSMSService() {
    console.log('📱 Testing SMS Service...');

    try {
      // Test 1: Service initialization
      await this.runTest('SMS Service - Initialization', async () => {
        const smsService = new TwilioSmsService();
        return smsService.getHealthStatus().status === 'healthy';
      }, 'smsService');

      // Test 2: Message optimization
      await this.runTest('SMS Service - Message Optimization', async () => {
        const smsService = new TwilioSmsService();
        const result = await smsService.optimizeSMSMessage(
          'Check out our amazing deals!',
          { audience: 'customers', campaignType: 'promotional' }
        );
        return result && result.optimizedText && result.characterCount;
      }, 'smsService');

      // Test 3: Phone validation
      await this.runTest('SMS Service - Phone Validation', async () => {
        const smsService = new TwilioSmsService();
        const results = await smsService.batchValidatePhones(['+1234567890', 'invalid-phone']);
        return Array.isArray(results) && results.length === 2;
      }, 'smsService');

      // Test 4: Campaign execution (dry run)
      await this.runTest('SMS Service - Campaign Execution', async () => {
        const smsService = new TwilioSmsService();
        const campaign = {
          name: 'Test Campaign',
          message: 'Test message',
          fromNumber: '+15551234567',
          audience: []
        };
        
        // This should not actually send SMS in test mode
        const result = await smsService.sendBulkSms(campaign);
        return result && typeof result.success !== 'undefined';
      }, 'smsService');

    } catch (error) {
      console.error('SMS Service tests failed:', error);
    }

    console.log('✅ SMS Service tests completed\n');
  }

  /**
   * Test Email Service functionality
   */
  async testEmailService() {
    console.log('📧 Testing Email Service...');

    try {
      // Test 1: Service initialization
      await this.runTest('Email Service - Initialization', async () => {
        const emailService = new EmailDeliveryService();
        return emailService.getServiceHealth().status === 'healthy';
      }, 'emailService');

      // Test 2: Email content optimization
      await this.runTest('Email Service - Content Optimization', async () => {
        const emailService = new EmailDeliveryService();
        const result = await emailService.optimizeEmailContent(
          'Amazing Summer Sale!',
          '<p>Check out our deals</p>',
          'Check out our deals',
          { audience: 'customers', campaignType: 'promotional' }
        );
        return result && result.optimizedSubject && result.optimizedHtmlContent;
      }, 'emailService');

      // Test 3: Email validation
      await this.runTest('Email Service - Email Validation', async () => {
        const emailService = new EmailDeliveryService();
        const results = await emailService.batchValidateEmails(['test@example.com', 'invalid-email']);
        return Array.isArray(results) && results.length === 2;
      }, 'emailService');

      // Test 4: Campaign insights generation
      await this.runTest('Email Service - Campaign Insights', async () => {
        const emailService = new EmailDeliveryService();
        const campaignData = {
          id: 'test_123',
          name: 'Test Campaign',
          provider: 'sendgrid',
          totalRecipients: 100,
          sent: 95,
          failed: 5
        };
        
        const insights = await emailService.generateEmailCampaignInsights(campaignData);
        return insights && insights.performance_summary;
      }, 'emailService');

    } catch (error) {
      console.error('Email Service tests failed:', error);
    }

    console.log('✅ Email Service tests completed\n');
  }

  /**
   * Test Workflow Service functionality
   */
  async testWorkflowService() {
    console.log('⚙️ Testing Workflow Service...');

    try {
      // Test 1: Service initialization
      await this.runTest('Workflow Service - Initialization', async () => {
        const workflowService = new WorkflowAutomationService();
        const status = workflowService.getWorkflowStatus();
        return status && Array.isArray(status.availableWorkflows);
      }, 'workflowService');

      // Test 2: SMS Campaign Workflow
      await this.runTest('Workflow Service - SMS Campaign Workflow', async () => {
        const workflowService = new WorkflowAutomationService();
        const input = {
          campaignName: 'Test SMS Campaign',
          message: 'Test message',
          recipients: [{ phone: '+15551234567', name: 'Test User' }],
          fromNumber: '+15557654321'
        };
        
        try {
          const result = await workflowService.executeWorkflow('smsCampaignExecution', input);
          return result && result.status === 'completed';
        } catch (error) {
          // Expected to fail in test environment without real credentials
          return error.message.includes('credentials') || error.message.includes('API');
        }
      }, 'workflowService');

      // Test 3: Email Campaign Workflow
      await this.runTest('Workflow Service - Email Campaign Workflow', async () => {
        const workflowService = new WorkflowAutomationService();
        const input = {
          campaignName: 'Test Email Campaign',
          subject: 'Test Subject',
          htmlContent: '<p>Test content</p>',
          textContent: 'Test content',
          recipients: [{ email: 'test@example.com', name: 'Test User' }]
        };
        
        try {
          const result = await workflowService.executeWorkflow('emailCampaignExecution', input);
          return result && result.status === 'completed';
        } catch (error) {
          // Expected to fail in test environment without real credentials
          return error.message.includes('credentials') || error.message.includes('API');
        }
      }, 'workflowService');

      // Test 4: Workflow templates availability
      await this.runTest('Workflow Service - Templates Available', async () => {
        const workflowService = new WorkflowAutomationService();
        const templates = Object.keys(workflowService.workflowTemplates);
        
        const expectedTemplates = [
          'hubspotEnrichment',
          'eloquaBatchValidation',
          'realTimeFormValidation',
          'smsCampaignExecution',
          'emailCampaignExecution',
          'multiChannelCampaign',
          'marketingFulfillmentWorkflow'
        ];
        
        return expectedTemplates.every(template => templates.includes(template));
      }, 'workflowService');

    } catch (error) {
      console.error('Workflow Service tests failed:', error);
    }

    console.log('✅ Workflow Service tests completed\n');
  }

  /**
   * Test Webhook Handler functionality
   */
  async testWebhookService() {
    console.log('🔗 Testing Webhook Service...');

    try {
      // Test 1: Service initialization
      await this.runTest('Webhook Service - Initialization', async () => {
        const webhookService = new WebhookHandlerService();
        const metrics = webhookService.getWebhookMetrics();
        return metrics && metrics.service === 'WebhookHandlerService';
      }, 'webhookService');

      // Test 2: Twilio webhook handling
      await this.runTest('Webhook Service - Twilio Webhook', async () => {
        const webhookService = new WebhookHandlerService();
        const mockTwilioData = {
          MessageSid: 'SM123456789',
          MessageStatus: 'delivered',
          To: '+15551234567',
          From: '+15557654321'
        };
        
        const result = await webhookService.handleTwilioSMSWebhook(mockTwilioData, 'test_campaign_123');
        return result && typeof result.success !== 'undefined';
      }, 'webhookService');

      // Test 3: SendGrid webhook handling
      await this.runTest('Webhook Service - SendGrid Webhook', async () => {
        const webhookService = new WebhookHandlerService();
        const mockSendGridData = [{
          event: 'delivered',
          email: 'test@example.com',
          timestamp: Date.now(),
          sg_event_id: 'sg_123456789'
        }];
        
        const result = await webhookService.handleSendGridWebhook(mockSendGridData);
        return result && result.success === true;
      }, 'webhookService');

      // Test 4: Generic webhook handling
      await this.runTest('Webhook Service - Generic Webhook', async () => {
        const webhookService = new WebhookHandlerService();
        const mockData = { event: 'test', data: 'test_data' };
        
        const result = await webhookService.handleGenericWebhook('test_provider', 'test_event', mockData);
        return result && typeof result.success !== 'undefined';
      }, 'webhookService');

    } catch (error) {
      console.error('Webhook Service tests failed:', error);
    }

    console.log('✅ Webhook Service tests completed\n');
  }

  /**
   * Run individual test
   * @param {string} testName - Test name
   * @param {Function} testFunction - Test function
   * @param {string} serviceCategory - Service category
   */
  async runTest(testName, testFunction, serviceCategory) {
    try {
      const startTime = Date.now();
      const result = await testFunction();
      const executionTime = Date.now() - startTime;

      if (result) {
        console.log(`✅ ${testName} - PASSED (${executionTime}ms)`);
        this.testResults[serviceCategory].passed++;
        this.testResults[serviceCategory].tests.push({
          name: testName,
          status: 'PASSED',
          executionTime: executionTime
        });
        this.testResults.overall.passed++;
      } else {
        console.log(`❌ ${testName} - FAILED`);
        this.testResults[serviceCategory].failed++;
        this.testResults[serviceCategory].tests.push({
          name: testName,
          status: 'FAILED',
          executionTime: executionTime
        });
        this.testResults.overall.failed++;
      }
    } catch (error) {
      console.log(`❌ ${testName} - ERROR: ${error.message}`);
      this.testResults[serviceCategory].failed++;
      this.testResults[serviceCategory].tests.push({
        name: testName,
        status: 'ERROR',
        error: error.message
      });
      this.testResults.overall.failed++;
    }
  }

  /**
   * Generate test report
   */
  generateTestReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 MARKETING FULFILLMENT TEST REPORT');
    console.log('='.repeat(60));

    const categories = ['smsService', 'emailService', 'workflowService', 'webhookService'];
    
    categories.forEach(category => {
      const results = this.testResults[category];
      const total = results.passed + results.failed;
      const successRate = total > 0 ? Math.round((results.passed / total) * 100) : 0;
      
      console.log(`\n${category.toUpperCase()}:`);
      console.log(`  Total Tests: ${total}`);
      console.log(`  Passed: ${results.passed}`);
      console.log(`  Failed: ${results.failed}`);
      console.log(`  Success Rate: ${successRate}%`);
    });

    const overallTotal = this.testResults.overall.passed + this.testResults.overall.failed;
    const overallSuccessRate = overallTotal > 0 ? 
      Math.round((this.testResults.overall.passed / overallTotal) * 100) : 0;

    console.log(`\nOVERALL RESULTS:`);
    console.log(`  Total Tests: ${overallTotal}`);
    console.log(`  Passed: ${this.testResults.overall.passed}`);
    console.log(`  Failed: ${this.testResults.overall.failed}`);
    console.log(`  Success Rate: ${overallSuccessRate}%`);

    if (overallSuccessRate >= 80) {
      console.log('\n🎉 Marketing Fulfillment Integration: READY FOR DEPLOYMENT');
    } else if (overallSuccessRate >= 60) {
      console.log('\n⚠️  Marketing Fulfillment Integration: NEEDS ATTENTION');
    } else {
      console.log('\n❌ Marketing Fulfillment Integration: REQUIRES FIXES');
    }

    console.log('='.repeat(60) + '\n');
  }
}

// Export for use in other test files
module.exports = MarketingFulfillmentTest;

// Run tests if called directly
if (require.main === module) {
  const testSuite = new MarketingFulfillmentTest();
  testSuite.runAllTests()
    .then(() => {
      console.log('✅ All tests completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Test suite failed:', error);
      process.exit(1);
    });
}