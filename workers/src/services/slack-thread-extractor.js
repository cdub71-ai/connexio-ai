const { WebClient } = require('@slack/web-api');
const fs = require('fs').promises;
const path = require('path');

/**
 * Slack Thread Extractor for Client Channel Analysis
 * Extracts conversation data for Claude AI training
 */
class SlackThreadExtractor {
  constructor(botToken) {
    this.client = new WebClient(botToken);
    this.channelId = null; // Will be set when we find the channel
    this.participants = {
      'client': { 
        name: 'CLIENT_PROGRAM_MANAGER', 
        role: 'Client Program Manager', 
        persona: 'Strategic client asking for campaign guidance and results',
        userId: null,
        realNames: ['britt', 'forestal'] // for identification only
      },
      'pm': { 
        name: 'SURESHOT_PROGRAM_MANAGER', 
        role: 'Sureshot Program Manager', 
        persona: 'Project coordinator managing client relationships and deliverables',
        userId: null,
        realNames: ['russ', 'hammond']
      },
      'expert': { 
        name: 'MARKETING_OPS_EXPERT', 
        role: 'Marketing Operations Expert', 
        persona: 'Technical expert providing implementation guidance and best practices',
        userId: null,
        realNames: ['steve', 'organ']
      }
    };
  }

  /**
   * Find the client-xceleration channel
   */
  async findChannel() {
    try {
      console.log('🔍 Searching for client-xceleration channel...');
      
      const response = await this.client.conversations.list({
        types: 'public_channel,private_channel',
        limit: 1000
      });

      const channel = response.channels.find(ch => 
        ch.name.includes('client-xceleration') || 
        ch.name.includes('xceleration')
      );

      if (channel) {
        this.channelId = channel.id;
        console.log(`✅ Found channel: ${channel.name} (${channel.id})`);
        return channel;
      } else {
        console.log('❌ Channel not found. Available channels:');
        response.channels.forEach(ch => {
          if (ch.name.includes('client') || ch.name.includes('xcel')) {
            console.log(`   - ${ch.name} (${ch.id})`);
          }
        });
        return null;
      }
    } catch (error) {
      console.error('Error finding channel:', error);
      return null;
    }
  }

  /**
   * Identify key participants in the channel
   */
  async identifyParticipants() {
    if (!this.channelId) return false;

    try {
      console.log('👥 Identifying key participants...');
      
      const members = await this.client.conversations.members({
        channel: this.channelId
      });

      // Get user info for each member
      for (const userId of members.members) {
        const userInfo = await this.client.users.info({ user: userId });
        const user = userInfo.user;
        
        const name = user.real_name || user.name;
        const lowerName = name.toLowerCase();
        
        // Match participants by name patterns (for identification only)
        for (const [key, participant] of Object.entries(this.participants)) {
          const matches = participant.realNames.some(namePattern => 
            lowerName.includes(namePattern.toLowerCase())
          );
          
          if (matches) {
            participant.userId = userId;
            participant.slackName = user.name;
            console.log(`   ✅ Found ${participant.name}: ${participant.persona}`);
            break;
          }
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error identifying participants:', error);
      return false;
    }
  }

  /**
   * Extract all messages from the channel
   */
  async extractMessages() {
    if (!this.channelId) return [];

    try {
      console.log('📥 Extracting all channel messages...');
      
      let allMessages = [];
      let cursor = null;
      let messageCount = 0;

      do {
        const response = await this.client.conversations.history({
          channel: this.channelId,
          limit: 200,
          cursor: cursor
        });

        allMessages = allMessages.concat(response.messages);
        messageCount += response.messages.length;
        cursor = response.response_metadata?.next_cursor;
        
        console.log(`   📊 Extracted ${messageCount} messages so far...`);
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } while (cursor);

      console.log(`✅ Total messages extracted: ${allMessages.length}`);
      return allMessages.reverse(); // Chronological order
      
    } catch (error) {
      console.error('Error extracting messages:', error);
      return [];
    }
  }

  /**
   * Extract thread replies for messages that have them
   */
  async extractThreadReplies(messages) {
    console.log('🧵 Extracting thread replies...');
    
    const messagesWithThreads = [];
    let threadCount = 0;

    for (const message of messages) {
      if (message.thread_ts && message.thread_ts === message.ts) {
        // This is a parent message with replies
        try {
          const threadResponse = await this.client.conversations.replies({
            channel: this.channelId,
            ts: message.thread_ts
          });

          messagesWithThreads.push({
            ...message,
            thread_replies: threadResponse.messages.slice(1) // Exclude parent
          });

          threadCount += threadResponse.messages.length - 1;
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error) {
          console.log(`   ⚠️ Could not fetch thread for message ${message.ts}`);
          messagesWithThreads.push(message);
        }
      } else {
        messagesWithThreads.push(message);
      }
    }

    console.log(`✅ Extracted ${threadCount} thread replies`);
    return messagesWithThreads;
  }

  /**
   * Process and analyze messages for marketing insights
   */
  async processForMarketingInsights(messages) {
    console.log('🎯 Processing messages for marketing insights...');
    
    const insights = {
      conversations: [],
      marketingTopics: [],
      clientQuestions: [],
      expertSolutions: [],
      tactics: [],
      metadata: {
        totalMessages: messages.length,
        dateRange: {
          start: null,
          end: null
        },
        participants: this.participants
      }
    };

    // Sort messages chronologically
    const sortedMessages = messages.sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));
    
    if (sortedMessages.length > 0) {
      insights.metadata.dateRange.start = new Date(parseFloat(sortedMessages[0].ts) * 1000);
      insights.metadata.dateRange.end = new Date(parseFloat(sortedMessages[sortedMessages.length - 1].ts) * 1000);
    }

    let conversationThreads = [];
    let currentThread = [];

    for (const message of sortedMessages) {
      if (message.type !== 'message' || message.subtype === 'bot_message') continue;

      const participant = this.identifyMessageParticipant(message.user);
      const timestamp = new Date(parseFloat(message.ts) * 1000);
      
      const processedMessage = {
        text: this.anonymizeMessage(message.text),
        user_id: this.anonymizeUserId(message.user), // Anonymized user reference
        participant: participant,
        timestamp: timestamp,
        thread_ts: message.thread_ts,
        replies: (message.thread_replies || []).map(reply => ({
          ...reply,
          text: this.anonymizeMessage(reply.text),
          user_id: this.anonymizeUserId(reply.user)
        }))
      };

      // Group messages into conversation threads
      if (currentThread.length === 0 || 
          (timestamp - currentThread[currentThread.length - 1].timestamp) < 30 * 60 * 1000) {
        // Same conversation (within 30 minutes)
        currentThread.push(processedMessage);
      } else {
        // New conversation
        if (currentThread.length > 0) {
          conversationThreads.push([...currentThread]);
        }
        currentThread = [processedMessage];
      }

      // Identify marketing topics
      this.identifyMarketingTopics(message.text, insights.marketingTopics);
      
      // Categorize by participant role
      if (participant?.role === 'Client Program Manager') {
        insights.clientQuestions.push({
          text: processedMessage.text, // Already anonymized
          timestamp: timestamp,
          context: currentThread.length > 1 ? currentThread[currentThread.length - 2].text : null,
          persona: participant.persona
        });
      } else if (participant?.role === 'Marketing Operations Expert') {
        insights.expertSolutions.push({
          text: processedMessage.text, // Already anonymized
          timestamp: timestamp,
          context: currentThread.length > 1 ? currentThread[currentThread.length - 2].text : null,
          persona: participant.persona
        });
      }
    }

    // Add final thread
    if (currentThread.length > 0) {
      conversationThreads.push(currentThread);
    }

    insights.conversations = conversationThreads;
    
    console.log(`✅ Processed into ${conversationThreads.length} conversation threads`);
    console.log(`   📈 Found ${insights.marketingTopics.length} marketing topics`);
    console.log(`   ❓ Found ${insights.clientQuestions.length} client questions`);
    console.log(`   💡 Found ${insights.expertSolutions.length} expert solutions`);

    return insights;
  }

  /**
   * Identify which participant sent a message
   */
  identifyMessageParticipant(userId) {
    for (const [key, participant] of Object.entries(this.participants)) {
      if (participant.userId === userId) {
        return participant;
      }
    }
    return null;
  }

  /**
   * Identify marketing topics and tactics in text
   */
  identifyMarketingTopics(text, topics) {
    const lowerText = text.toLowerCase();
    
    const marketingKeywords = [
      'email', 'campaign', 'segmentation', 'deliverability', 'open rate',
      'click rate', 'conversion', 'lead generation', 'nurture', 'automation',
      'personalization', 'a/b test', 'analytics', 'roi', 'attribution',
      'funnel', 'pipeline', 'scoring', 'qualification', 'crm', 'database'
    ];

    marketingKeywords.forEach(keyword => {
      if (lowerText.includes(keyword)) {
        const existing = topics.find(t => t.topic === keyword);
        if (existing) {
          existing.count++;
        } else {
          topics.push({ topic: keyword, count: 1 });
        }
      }
    });
  }

  /**
   * Export processed data
   */
  async exportData(insights, outputDir = './thread-data') {
    try {
      await fs.mkdir(outputDir, { recursive: true });
      
      const timestamp = new Date().toISOString().split('T')[0];
      
      // Export full insights
      await fs.writeFile(
        path.join(outputDir, `xceleration-insights-${timestamp}.json`),
        JSON.stringify(insights, null, 2)
      );

      // Export Claude training format
      const trainingData = this.formatForClaudeTraining(insights);
      await fs.writeFile(
        path.join(outputDir, `claude-training-${timestamp}.txt`),
        trainingData
      );

      // Export conversation summaries
      const conversationSummary = this.createConversationSummary(insights);
      await fs.writeFile(
        path.join(outputDir, `conversation-summary-${timestamp}.md`),
        conversationSummary
      );

      console.log(`✅ Data exported to ${outputDir}/`);
      console.log(`   📊 Full insights: xceleration-insights-${timestamp}.json`);
      console.log(`   🤖 Claude training: claude-training-${timestamp}.txt`);
      console.log(`   📝 Summary: conversation-summary-${timestamp}.md`);
      
      return outputDir;

    } catch (error) {
      console.error('Error exporting data:', error);
      return null;
    }
  }

  /**
   * Format data for Claude training
   */
  formatForClaudeTraining(insights) {
    let trainingText = `# Marketing Operations Knowledge Base
# Extracted from Client-Agency Channel (Anonymized)

## Key Personas:
- CLIENT_PROGRAM_MANAGER: Strategic client asking for campaign guidance and results
- SURESHOT_PROGRAM_MANAGER: Project coordinator managing client relationships and deliverables  
- MARKETING_OPS_EXPERT: Technical expert providing implementation guidance and best practices

## Real-World Marketing Tactics and Solutions:

`;

    // Add expert solutions with context
    insights.expertSolutions.forEach((solution, index) => {
      if (solution.context) {
        trainingText += `### Client Question (${solution.persona}):\n${solution.context}\n\n`;
        trainingText += `### Expert Solution (${solution.persona}):\n${solution.text}\n\n---\n\n`;
      }
    });

    trainingText += `## Common Marketing Topics:\n`;
    insights.marketingTopics
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)
      .forEach(topic => {
        trainingText += `- ${topic.topic} (mentioned ${topic.count} times)\n`;
      });

    return trainingText;
  }

  /**
   * Create conversation summary
   */
  createConversationSummary(insights) {
    const summary = `# Xceleration Client Channel Analysis

## Overview
- **Total Messages**: ${insights.metadata.totalMessages}
- **Date Range**: ${insights.metadata.dateRange.start?.toDateString()} - ${insights.metadata.dateRange.end?.toDateString()}
- **Conversation Threads**: ${insights.conversations.length}

## Key Participants
${Object.entries(insights.metadata?.participants || {}).map(([key, p]) => 
  `- **${p.name}** (${p.role}): ${p.userId ? '✅ Found' : '❌ Not found'}`
).join('\n')}

## Marketing Topics (Top 10)
${insights.marketingTopics
  .sort((a, b) => b.count - a.count)
  .slice(0, 10)
  .map(topic => `- ${topic.topic}: ${topic.count} mentions`)
  .join('\n')}

## Client Questions: ${insights.clientQuestions.length}
## Expert Solutions: ${insights.expertSolutions.length}

## Next Steps
1. Review extracted conversations for key marketing tactics
2. Integrate successful strategies into Connexio AI training
3. Create specialized prompts based on real client interactions
`;

    return summary;
  }

  /**
   * Anonymize message text by removing personal references
   */
  anonymizeMessage(text) {
    if (!text) return text;
    
    let anonymized = text;
    
    // Replace names with persona references
    for (const [key, participant] of Object.entries(this.participants)) {
      participant.realNames.forEach(name => {
        const regex = new RegExp(name, 'gi');
        anonymized = anonymized.replace(regex, participant.name);
      });
    }
    
    // Remove @mentions and replace with roles
    anonymized = anonymized.replace(/<@U[A-Z0-9]+>/g, (match) => {
      const userId = match.slice(2, -1);
      const participant = this.identifyMessageParticipant(userId);
      return participant ? `@${participant.name}` : '@TEAM_MEMBER';
    });
    
    // Generic anonymization patterns
    const anonymizations = [
      // Email addresses
      { pattern: /[\w.-]+@[\w.-]+\.\w+/g, replacement: 'EMAIL_ADDRESS' },
      // Phone numbers
      { pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, replacement: 'PHONE_NUMBER' },
      // URLs (preserve marketing tool references)
      { pattern: /https?:\/\/(?!.*(?:eloqua|marketo|hubspot|salesforce))[\w.-]+/g, replacement: 'CLIENT_URL' }
    ];
    
    anonymizations.forEach(({ pattern, replacement }) => {
      anonymized = anonymized.replace(pattern, replacement);
    });
    
    return anonymized;
  }

  /**
   * Convert user ID to anonymized reference
   */
  anonymizeUserId(userId) {
    const participant = this.identifyMessageParticipant(userId);
    return participant ? participant.name : 'UNKNOWN_USER';
  }

  /**
   * Main extraction workflow
   */
  async extractAndProcess() {
    console.log('🚀 Starting Slack Thread Extraction for Xceleration Channel');
    console.log('================================================================');

    // Step 1: Find channel
    const channel = await this.findChannel();
    if (!channel) {
      console.log('❌ Cannot continue without channel access');
      return null;
    }

    // Step 2: Identify participants
    await this.identifyParticipants();

    // Step 3: Extract messages
    const messages = await this.extractMessages();
    if (messages.length === 0) {
      console.log('❌ No messages found');
      return null;
    }

    // Step 4: Extract thread replies
    const messagesWithThreads = await this.extractThreadReplies(messages);

    // Step 5: Process for insights
    const insights = await this.processForMarketingInsights(messagesWithThreads);

    // Step 6: Export data
    const outputDir = await this.exportData(insights);

    console.log('\n🎉 Thread extraction completed successfully!');
    return { insights, outputDir };
  }
}

module.exports = { SlackThreadExtractor };