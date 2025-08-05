import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

class AnthropicService {
  constructor() {
    this.client = new Anthropic({
      apiKey: config.anthropic.apiKey,
    });
  }

  async processMessage(message, context = {}) {
    try {
      const response = await this.client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `Context: You are Connexio.ai, an AI Marketing Ops Agent. You help execute marketing campaigns through Slack commands.
            
Available actions:
- Create email campaigns via Sureshot
- Send SMS/MMS campaigns via Sureshot  
- Generate marketing content
- Analyze campaign performance
- Schedule campaign workflows

User message: ${message}
Context: ${JSON.stringify(context)}

Provide a helpful response and suggest specific actions if needed.`,
          },
        ],
      });

      return response.content[0].text;
    } catch (error) {
      logger.error('Anthropic API error:', error);
      throw new Error('Failed to process message with AI');
    }
  }

  async generateCampaignContent(campaignType, audience, objectives) {
    try {
      const response = await this.client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: `Generate marketing campaign content:
            
Campaign Type: ${campaignType}
Target Audience: ${audience}
Objectives: ${objectives}

Please provide:
1. Subject line/headline
2. Main message content
3. Call-to-action
4. Additional copy variants

Format as JSON with clear structure.`,
          },
        ],
      });

      return JSON.parse(response.content[0].text);
    } catch (error) {
      logger.error('Campaign content generation error:', error);
      throw new Error('Failed to generate campaign content');
    }
  }
}

export const anthropicService = new AnthropicService();