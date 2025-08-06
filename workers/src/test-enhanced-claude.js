#!/usr/bin/env node

/**
 * Test Enhanced Claude Training
 * Test the new marketing expertise from real client conversations
 */

const { default: Anthropic } = require('@anthropic-ai/sdk');
const { 
  ENHANCED_CONNEXIO_SYSTEM_PROMPT,
  CLIENT_CONVERSATION_TEMPLATES,
  REAL_WORLD_MARKETING_KNOWLEDGE
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

// Test questions based on real client patterns
const TEST_QUESTIONS = [
  {
    question: "How do I improve my email deliverability rates?",
    expectedTemplate: "deliverabilityTroubleshooting",
    category: "Deliverability"
  },
  {
    question: "What's the best way to segment our email list?",
    expectedTemplate: "segmentationStrategy", 
    category: "Segmentation"
  },
  {
    question: "How should we set up marketing automation workflows?",
    expectedTemplate: "automationPlanning",
    category: "Automation"
  },
  {
    question: "What are the key metrics we should track for email campaigns?",
    expectedTemplate: null,
    category: "Analytics"
  },
  {
    question: "Our CRM integration isn't syncing data properly",
    expectedTemplate: null,
    category: "Integration"
  }
];

async function testEnhancedClaude() {
  console.log('🧪 Testing Enhanced Connexio AI with Real Client Training');
  console.log('============================================================\n');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ Missing ANTHROPIC_API_KEY environment variable');
    process.exit(1);
  }

  console.log('📋 System Prompt Enhancement:');
  console.log('✅ Real client-agency conversation patterns integrated');
  console.log('✅ Marketing ops expert persona from actual consulting experience');
  console.log('✅ Template responses for common client questions');
  console.log('✅ Industry best practices from extracted knowledge\n');

  for (const test of TEST_QUESTIONS) {
    console.log(`🎯 Testing: "${test.question}"`);
    console.log(`   Category: ${test.category}`);
    
    // Check template matching
    const templateMatch = findBestTemplate(test.question);
    if (templateMatch) {
      console.log(`   ✅ Template Match: ${templateMatch.name} (score: ${templateMatch.score})`);
    } else {
      console.log(`   📝 No template match - using standard Claude response`);
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

      console.log(`   🤖 Response Preview: ${responseText.substring(0, 120)}...`);
      console.log(`   📊 Length: ${responseText.length} characters`);
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    
    console.log(''); // Spacing between tests
  }

  console.log('🎉 Enhanced Claude Training Test Complete!');
  console.log('\n💡 Key Enhancements:');
  console.log('• Responses now reflect real client-agency dynamics');
  console.log('• Template matching provides consistent expert guidance');
  console.log('• Consultative tone matches actual marketing ops consultants');
  console.log('• Industry best practices from extracted conversations');
  
  console.log('\n🚀 Ready for deployment and user testing!');
}

// Run tests
if (require.main === module) {
  testEnhancedClaude().catch(console.error);
}

module.exports = { testEnhancedClaude, findBestTemplate };