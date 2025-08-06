import Anthropic from '@anthropic-ai/sdk';

/**
 * Test Claude API connection
 */
async function testClaudeAPI() {
  console.log('🧪 Testing Claude API Connection...\n');

  try {
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: 30000,
    });

    console.log('📡 Making test request to Claude API...');

    const response = await client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 100,
      temperature: 0.3,
      system: 'You are Connexio AI, a helpful marketing operations assistant.',
      messages: [
        {
          role: 'user',
          content: 'Hello! Please confirm you are working correctly and introduce yourself briefly.',
        },
      ],
    });

    const message = response.content[0]?.text;

    console.log('✅ Claude API Response:');
    console.log('=' .repeat(50));
    console.log(message);
    console.log('=' .repeat(50));
    
    console.log('\n📊 API Usage:');
    console.log('- Input tokens:', response.usage.input_tokens);
    console.log('- Output tokens:', response.usage.output_tokens);
    console.log('- Total tokens:', response.usage.input_tokens + response.usage.output_tokens);
    
    console.log('\n🎉 Claude API is working correctly!');
    return true;

  } catch (error) {
    console.error('❌ Claude API Error:');
    console.error('- Status:', error.status || 'Unknown');
    console.error('- Message:', error.message);
    
    if (error.status === 401) {
      console.error('\n🔑 Authentication Error: Please check your API key');
    } else if (error.status === 429) {
      console.error('\n⏱️ Rate Limit: Please wait before trying again');
    } else if (error.status === 500) {
      console.error('\n🔧 Server Error: Anthropic API may be experiencing issues');
    }
    
    return false;
  }
}

// Run test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testClaudeAPI().catch(console.error);
}

export default testClaudeAPI;