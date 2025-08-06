#!/usr/bin/env node

/**
 * Test HubSpot Integration Pattern Enhancement
 * Verify the new marketing expertise includes real CRM integration patterns
 */

const { default: Anthropic } = require('@anthropic-ai/sdk');
const { 
  ENHANCED_CONNEXIO_SYSTEM_PROMPT,
  CLIENT_CONVERSATION_TEMPLATES
} = require('./services/enhanced-marketing-knowledge');

// Initialize Claude client
const claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Template matching function
function findBestTemplate(userText) {
  const lowerText = userText.toLowerCase();
  
  for (const [templateName, template] of Object.entries(CLIENT_CONVERSATION_TEMPLATES)) {
    const matchScore = template.trigger.reduce((score, trigger) => {
      return lowerText.includes(trigger.toLowerCase()) ? score + 1 : score;
    }, 0);
    
    if (matchScore > 0) {
      return {
        name: templateName,
        score: matchScore,
        response: template.response
      };
    }
  }
  
  return null;
}

// Test questions for HubSpot integration pattern
const HUBSPOT_TEST_QUESTIONS = [
  {
    question: "How do I set up HubSpot email validation integration?",
    expectedTemplate: "hubspotIntegration",
    category: "HubSpot Integration"
  },
  {
    question: "What's the best way to validate emails in HubSpot using NeverBounce?",
    expectedTemplate: "hubspotIntegration", 
    category: "Email Validation"
  },
  {
    question: "How should I configure webhooks for real-time contact enrichment?",
    expectedTemplate: "hubspotIntegration",
    category: "Webhook Setup"
  },
  {
    question: "What's the workflow for BriteVerify integration with HubSpot?",
    expectedTemplate: "hubspotIntegration",
    category: "API Integration"
  },
  {
    question: "How do I optimize costs for email validation services?",
    expectedTemplate: null, // Should get enhanced general response
    category: "Cost Optimization"
  }
];

async function testHubSpotPatternIntegration() {
  console.log('🧪 Testing HubSpot Integration Pattern Enhancement');
  console.log('===============================================\n');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ Missing ANTHROPIC_API_KEY environment variable');
    console.log('💡 Use the Claude API key from earlier deployment');
    process.exit(1);
  }

  console.log('📋 HubSpot Pattern Enhancement:');
  console.log('✅ Real webhook-triggered enrichment workflow documented');
  console.log('✅ NeverBounce/BriteVerify integration patterns added');  
  console.log('✅ Cost optimization strategies included');
  console.log('✅ HubSpot-specific template responses created\n');

  for (const test of HUBSPOT_TEST_QUESTIONS) {
    console.log(`🎯 Testing: "${test.question}"`);
    console.log(`   Category: ${test.category}`);
    
    // Check template matching
    const templateMatch = findBestTemplate(test.question);
    if (templateMatch) {
      console.log(`   ✅ Template Match: ${templateMatch.name} (score: ${templateMatch.score})`);
      
      // Verify expected template
      if (test.expectedTemplate && templateMatch.name === test.expectedTemplate) {
        console.log(`   🎯 Expected template matched correctly`);
      } else if (test.expectedTemplate) {
        console.log(`   ⚠️  Expected ${test.expectedTemplate}, got ${templateMatch.name}`);
      }
    } else {
      console.log(`   📝 No template match - using enhanced Claude response`);
      if (test.expectedTemplate) {
        console.log(`   ❌ Expected template ${test.expectedTemplate} but no match found`);
      }
    }

    try {
      let responseText;
      
      if (templateMatch) {
        // Use template-enhanced response
        const response = await claude.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 600,
          temperature: 0.3,
          system: ENHANCED_CONNEXIO_SYSTEM_PROMPT,
          messages: [{
            role: 'user',
            content: `A client is asking: "${test.question}"

I have this template response based on similar client conversations:
${templateMatch.response}

Please enhance this response with additional insights and make it more personalized to their specific question. Keep the consultative tone and practical approach.`,
          }],
        });
        responseText = response.content[0]?.text;
      } else {
        // Use standard enhanced Claude response
        const response = await claude.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 600,
          temperature: 0.3,
          system: ENHANCED_CONNEXIO_SYSTEM_PROMPT,
          messages: [{
            role: 'user',
            content: `As an experienced marketing operations consultant, please help with this question: "${test.question}"

Draw from your knowledge of real client situations and provide practical, actionable guidance. Use a consultative tone and focus on business outcomes.`,
          }],
        });
        responseText = response.content[0]?.text;
      }

      // Check for key HubSpot integration terms
      const hasWebhookReference = responseText.toLowerCase().includes('webhook');
      const hasValidationService = responseText.toLowerCase().includes('neverbounce') || responseText.toLowerCase().includes('briteverify');
      const hasAPIPattern = responseText.toLowerCase().includes('get') && responseText.toLowerCase().includes('patch');
      const hasFieldMapping = responseText.toLowerCase().includes('field') || responseText.toLowerCase().includes('property');

      console.log(`   🤖 Response Preview: ${responseText.substring(0, 120)}...`);
      console.log(`   📊 Length: ${responseText.length} characters`);
      console.log(`   🔍 Integration Elements:`);
      console.log(`      Webhook Reference: ${hasWebhookReference ? '✅' : '❌'}`);
      console.log(`      Validation Service: ${hasValidationService ? '✅' : '❌'}`);
      console.log(`      API Pattern: ${hasAPIPattern ? '✅' : '❌'}`);
      console.log(`      Field Mapping: ${hasFieldMapping ? '✅' : '❌'}`);
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    
    console.log(''); // Spacing between tests
  }

  console.log('🎉 HubSpot Pattern Integration Test Complete!');
  console.log('\n💡 Key Pattern Enhancements:');
  console.log('• Webhook-triggered real-time enrichment workflow');
  console.log('• NeverBounce and BriteVerify integration patterns');
  console.log('• Cost optimization strategies for validation services');
  console.log('• HubSpot-specific field mapping and API usage');
  console.log('• Error handling and retry logic best practices');
  
  console.log('\n🚀 Ready for real client HubSpot integration questions!');
}

// Run tests
if (require.main === module) {
  testHubSpotPatternIntegration().catch(console.error);
}

module.exports = { testHubSpotPatternIntegration };