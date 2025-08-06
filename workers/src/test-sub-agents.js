#!/usr/bin/env node

/**
 * Test script for Sub-Agent System
 * Tests routing logic and agent responses
 */

const { SubAgentSystem } = require('./services/sub-agent-system');
const { default: Anthropic } = require('@anthropic-ai/sdk');

// Mock Claude client for testing (if no API key)
const claude = process.env.ANTHROPIC_API_KEY ? 
  new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) :
  {
    messages: {
      create: async () => ({
        content: [{ text: 'Mock response for testing' }],
        usage: { input_tokens: 10, output_tokens: 20 }
      })
    }
  };

const subAgentSystem = new SubAgentSystem(claude);

async function testRouting() {
  console.log('🧪 Testing Sub-Agent Routing Logic\n');
  
  const testQuestions = [
    'How do I improve email deliverability?',
    'What is the best way to set up LittleHorse workflows?',
    'How should I write test cases for my API?',
    'Can you help with marketing automation?',
    'What are the best practices for workflow orchestration?',
    'How do I document my API endpoints?',
    'What testing frameworks should I use?',
    'How do I segment my email lists for better campaigns?'
  ];
  
  for (const question of testQuestions) {
    const routing = subAgentSystem.routeToAgent(question);
    console.log(`❓ "${question}"`);
    console.log(`   → ${routing.agent.emoji} ${routing.agent.name} (confidence: ${routing.confidence})`);
    console.log(`   → Scores: ${JSON.stringify(routing.allScores)}\n`);
  }
}

async function testAgents() {
  console.log('👥 Testing Available Agents\n');
  
  const agents = subAgentSystem.listAgents();
  agents.forEach(agent => {
    console.log(`${agent.emoji} ${agent.name} (${agent.id})`);
    console.log(`   Specialties: ${agent.specialties.join(', ')}\n`);
  });
}

async function testAgentResponse() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('⚠️  Skipping live API test - no ANTHROPIC_API_KEY found\n');
    return;
  }
  
  console.log('🤖 Testing Live Agent Response\n');
  
  const testQuestion = 'How can I improve email deliverability rates?';
  console.log(`Question: "${testQuestion}"`);
  
  try {
    const result = await subAgentSystem.processWithAgent(testQuestion);
    console.log(`\n${result.agent.emoji} ${result.agent.name} Response:`);
    console.log(`Confidence: ${result.routing.confidence}`);
    console.log(`Tokens: ${result.usage.input_tokens + result.usage.output_tokens}`);
    console.log(`\n${result.response}\n`);
  } catch (error) {
    console.error('❌ Error testing agent response:', error.message);
  }
}

async function testSpecificAgent() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('⚠️  Skipping specific agent test - no ANTHROPIC_API_KEY found\n');
    return;
  }
  
  console.log('🎯 Testing Specific Agent Selection\n');
  
  const testCases = [
    { agentId: 'marketing-ops', question: 'What are the key email deliverability factors?' },
    { agentId: 'littlehorse', question: 'How do I design efficient workflows?' },
    { agentId: 'qa-docs', question: 'What should I include in API documentation?' }
  ];
  
  for (const testCase of testCases) {
    console.log(`Testing ${testCase.agentId}: "${testCase.question}"`);
    try {
      const result = await subAgentSystem.processWithAgent(testCase.question, testCase.agentId);
      console.log(`✅ ${result.agent.emoji} ${result.agent.name} responded (${result.usage.input_tokens + result.usage.output_tokens} tokens)`);
      console.log(`Response preview: ${result.response.substring(0, 100)}...\n`);
    } catch (error) {
      console.error(`❌ Error with ${testCase.agentId}:`, error.message, '\n');
    }
  }
}

async function runAllTests() {
  console.log('🚀 Sub-Agent System Test Suite');
  console.log('================================\n');
  
  await testAgents();
  await testRouting();
  await testAgentResponse();
  await testSpecificAgent();
  
  console.log('✅ All tests completed!');
  console.log('\n💡 To test in Slack:');
  console.log('• /connexio How do I improve email deliverability?');
  console.log('• /expert marketing-ops What are the key metrics?');
  console.log('• /agents - List all available experts');
}

// CLI interface
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = { testRouting, testAgents, testAgentResponse };