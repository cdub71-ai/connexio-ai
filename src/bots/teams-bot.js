import { ActivityHandler, MessageFactory, TeamsActivityHandler } from 'botbuilder';
import { config } from '../config/index.js';
import { anthropicService } from '../services/anthropic.js';
import { sureshotService } from '../services/sureshot.js';
import { logger } from '../utils/logger.js';

class TeamsBot extends TeamsActivityHandler {
  constructor() {
    super();

    this.onMessage(async (context, next) => {
      const userMessage = context.activity.text;
      
      try {
        if (userMessage.startsWith('/connexio')) {
          const command = userMessage.replace('/connexio', '').trim();
          const aiResponse = await anthropicService.processMessage(command, {
            platform: 'teams',
            userId: context.activity.from.id,
            channelId: context.activity.channelData?.channel?.id,
          });

          await context.sendActivity(MessageFactory.text(aiResponse));
        } else if (userMessage.startsWith('/create-campaign')) {
          await this.handleCreateCampaign(context);
        } else if (userMessage.startsWith('/campaign-status')) {
          const campaignId = userMessage.replace('/campaign-status', '').trim();
          await this.handleCampaignStatus(context, campaignId);
        } else {
          const aiResponse = await anthropicService.processMessage(userMessage, {
            platform: 'teams',
            userId: context.activity.from.id,
            channelId: context.activity.channelData?.channel?.id,
          });

          await context.sendActivity(MessageFactory.text(aiResponse));
        }
      } catch (error) {
        logger.error('Teams message error:', error);
        await context.sendActivity(MessageFactory.text('Sorry, I encountered an error processing your message.'));
      }

      await next();
    });

    this.onMembersAdded(async (context, next) => {
      const membersAdded = context.activity.membersAdded;
      const welcomeText = '👋 Welcome to Connexio.ai! I\'m your AI Marketing Ops Agent. Try:\n\n' +
                         '• `/connexio help` - Get started\n' +
                         '• `/create-campaign` - Create marketing campaigns\n' +
                         '• `/campaign-status [ID]` - Check campaign status';

      for (let cnt = 0; cnt < membersAdded.length; ++cnt) {
        if (membersAdded[cnt].id !== context.activity.recipient.id) {
          await context.sendActivity(MessageFactory.text(welcomeText));
        }
      }

      await next();
    });
  }

  async handleCreateCampaign(context) {
    const card = {
      type: 'AdaptiveCard',
      version: '1.2',
      body: [
        {
          type: 'TextBlock',
          text: '🚀 Campaign Creator',
          weight: 'Bolder',
          size: 'Medium',
        },
        {
          type: 'TextBlock',
          text: 'What type of campaign would you like to create?',
          wrap: true,
        },
      ],
      actions: [
        {
          type: 'Action.Submit',
          title: 'Email Campaign',
          data: { action: 'create_email_campaign' },
        },
        {
          type: 'Action.Submit',
          title: 'SMS Campaign',
          data: { action: 'create_sms_campaign' },
        },
      ],
    };

    await context.sendActivity(MessageFactory.attachment({
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: card,
    }));
  }

  async handleCampaignStatus(context, campaignId) {
    if (!campaignId) {
      await context.sendActivity(MessageFactory.text('Please provide a campaign ID: `/campaign-status CAMPAIGN_ID`'));
      return;
    }

    try {
      const status = await sureshotService.getCampaignStatus(campaignId);
      const statusMessage = `📊 **Campaign Status: ${campaignId}**\n\n` +
                           `Status: ${status.status}\n` +
                           `Created: ${status.createdAt}\n` +
                           `Sent: ${status.sentCount || 0}\n` +
                           `Opens: ${status.openCount || 0}\n` +
                           `Clicks: ${status.clickCount || 0}`;

      await context.sendActivity(MessageFactory.text(statusMessage));
    } catch (error) {
      logger.error('Teams campaign status error:', error);
      await context.sendActivity(MessageFactory.text('Error retrieving campaign status.'));
    }
  }

  async onTeamsCardActionInvoke(context) {
    const action = context.activity.value.action;
    
    try {
      if (action === 'create_email_campaign') {
        await context.sendActivity(MessageFactory.text('📧 Email campaign creation initiated...'));
        // TODO: Implement email campaign creation flow
      } else if (action === 'create_sms_campaign') {
        await context.sendActivity(MessageFactory.text('📱 SMS campaign creation initiated...'));
        // TODO: Implement SMS campaign creation flow
      }
    } catch (error) {
      logger.error('Teams card action error:', error);
      await context.sendActivity(MessageFactory.text('Error processing action.'));
    }

    return { statusCode: 200 };
  }
}

export const teamsBot = new TeamsBot();