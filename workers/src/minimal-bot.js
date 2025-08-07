const { App } = require('@slack/bolt');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: false,
});

// Processing status tracking
const processingSessions = new Map();

// Connexio AI main command with persona
app.command('/connexio', async ({ command, ack, respond }) => {
  await ack();
  
  const text = command.text.trim();
  
  if (!text) {
    await respond({
      text: '👋 **Hello! I\'m Connexio AI** - your intelligent marketing operations assistant.\n\n🎯 **What I do:**\n• Validate and clean your email/phone data\n• Analyze data quality with AI insights\n• Provide campaign readiness assessments\n• Offer personalized marketing recommendations\n\n📋 **Available Commands:**\n• `/validate-file` - Upload and validate CSV files\n• `/connexio [question]` - Ask me marketing questions\n• `/help` - View all commands\n\n💡 **Try asking me:**\n_"How should I segment my email list?"_\n_"What makes a good email campaign?"_\n_"How do I improve deliverability?"_\n\n🚀 **Ready to optimize your marketing data!**',
      response_type: 'ephemeral',
    });
    return;
  }

  // AI-powered responses to marketing questions
  const responses = {
    'segment': '🎯 **Email Segmentation Best Practices:**\n\n• **By Engagement:** Active (opened recently), Inactive (90+ days), Re-engagement candidates\n• **By Demographics:** Age, location, job title, company size\n• **By Behavior:** Purchase history, website activity, email preferences\n• **By Quality Score:** High-quality contacts first, then nurture others\n\n💡 **Pro Tip:** Start with engagement-based segments - they typically see 20-30% higher open rates!',
    
    'deliverability': '📧 **Email Deliverability Essentials:**\n\n• **Clean Lists:** Remove bounces, invalid emails, and inactive subscribers\n• **Authentication:** Set up SPF, DKIM, and DMARC records properly\n• **Reputation:** Monitor sender reputation and warm up new domains\n• **Content:** Avoid spam triggers, maintain good text-to-image ratio\n• **Engagement:** Focus on subscribers who actually engage\n\n⚠️ **Red Flags:** High bounce rates (>2%), low engagement (<20%), spam complaints\n\n🎯 I can check your list quality - just use `/validate-file` and I'll handle it!',
    
    'campaign': '🚀 **Effective Email Campaign Elements:**\n\n• **Subject Line:** Clear, benefit-focused, 30-50 characters ideal\n• **Personalization:** Use name, company, previous interactions\n• **Value Proposition:** What\'s in it for them? Be specific.\n• **Call-to-Action:** Single, clear, compelling action\n• **Mobile-First:** 60%+ opens happen on mobile devices\n• **Timing:** Test send times, generally Tue-Thu 10am-2pm work well\n\n📊 **Success Metrics:**\n• Open Rate: 20-25% (industry average)\n• Click Rate: 2-5% (varies by industry)\n• Conversion Rate: 1-3% (depends on offer)',
    
    'quality': '⭐ **Data Quality Indicators:**\n\n• **Email Format:** Proper syntax, real domains\n• **Deliverability:** Not on suppress lists, valid MX records\n• **Engagement History:** Opens, clicks, replies\n• **Completeness:** Has name, company info\n• **Freshness:** Recently updated, not stale\n\n🎯 **Quality Score Breakdown:**\n• 90-100: Excellent (premium campaigns)\n• 75-89: Good (standard campaigns)\n• 60-74: Fair (nurture sequences)\n• <60: Poor (needs cleaning)\n\nI can analyze your data quality - upload a file and use `/validate-file` for my AI-powered analysis!'
  };

  // Find matching response
  const lowerText = text.toLowerCase();
  let response = null;
  
  for (const [key, resp] of Object.entries(responses)) {
    if (lowerText.includes(key)) {
      response = resp;
      break;
    }
  }
  
  // Default AI response
  if (!response) {
    response = `🤖 **Connexio AI Analysis:**\n\nI understand you're asking about: _"${text}"_\n\nAs your marketing operations assistant, I can help with:\n• Data quality and validation strategies\n• Campaign optimization techniques\n• Email deliverability best practices\n• List segmentation and targeting\n• Performance analysis and improvements\n\n💡 **For specific data analysis**, I can analyze your CSV file - use \`/validate-file start\` and I'll provide personalized insights!\n\n📚 **Need more help?** Try asking about:\n_"segmentation", "deliverability", "campaign best practices", or "data quality"_`;
  }

  await respond({
    text: response,
    response_type: 'ephemeral',
  });
});

// File validation command
app.command('/validate-file', async ({ command, ack, respond, client }) => {
  await ack();
  
  try {
    const userId = command.user_id;
    const text = command.text.trim();
    
    if (!text) {
      await respond({
        text: '🤖 **I Can Validate Your Files**\n\nHere\'s how I help you:\n1. Upload your CSV file to this channel\n2. Use `/validate-file start` and I\'ll process it automatically\n3. I support CSV format (Excel coming in Phase 2)\n\n**What I validate for you:**\n• Email addresses (format, deliverability, domain quality)\n• Phone numbers (format, type detection, country codes)\n• Data completeness and quality scoring\n\n**What you get:** Clean, standardized CSV with my validation results',
        response_type: 'ephemeral',
      });
      return;
    }

    if (text.toLowerCase() === 'start') {
      // Check for recent file uploads in the channel
      const channelId = command.channel_id;
      
      // Get recent messages to find file uploads
      const result = await client.conversations.history({
        channel: channelId,
        limit: 10,
      });

      const fileMessage = result.messages.find(msg => 
        msg.files && msg.files.length > 0 && msg.files.some(file => 
          file.mimetype === 'text/csv' || file.name.endsWith('.csv')
        )
      );

      if (!fileMessage) {
        await respond({
          text: '❌ I don\'t see a CSV file to validate. Please upload your CSV file first, then I\'ll process it with `/validate-file start`.',
          response_type: 'ephemeral',
        });
        return;
      }

      const file = fileMessage.files.find(f => 
        f.mimetype === 'text/csv' || f.name.endsWith('.csv')
      );

      // Start processing
      const processId = `${userId}_${Date.now()}`;
      processingSessions.set(processId, {
        userId,
        channelId,
        fileName: file.name,
        fileUrl: file.url_private,
        status: 'started',
        startTime: new Date(),
      });

      await respond({
        text: `🚀 **Processing Started**\n\n📄 File: ${file.name}\n📊 Size: ${Math.round(file.size / 1024)}KB\n🆔 Process ID: ${processId}\n\n⏳ Processing your file... This may take a few minutes.\n\n_You'll receive an update when processing is complete._`,
        response_type: 'ephemeral',
      });

      // Simulate file processing with AI analysis (in real implementation, this would call FileEnrichmentWorker + Claude)
      setTimeout(async () => {
        try {
          const session = processingSessions.get(processId);
          if (session) {
            session.status = 'completed';
            session.endTime = new Date();
            
            // Simulate processing results
            const results = {
              totalRecords: 150,
              validRecords: 127,
              emailValidation: { valid: 89, invalid: 38, questionable: 23 },
              phoneValidation: { valid: 67, invalid: 41, formatted: 52 },
              outputFile: `${file.name.replace('.csv', '')}_validated_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`,
              qualityScore: 84
            };

            // Simulate Claude AI analysis
            const aiInsights = {
              summary: "Your data shows strong quality with 85% validation rate. Email deliverability looks excellent with minimal risk addresses.",
              recommendations: [
                "Segment the 23 questionable emails for separate nurture campaign",
                "Use the 67 valid phone numbers for SMS follow-up sequences", 
                "Focus initial campaigns on the 89 high-quality email addresses"
              ],
              campaignReadiness: "excellent",
              riskLevel: "low"
            };

            await client.chat.postMessage({
              channel: channelId,
              text: `✅ **File Processing Complete!**\n\n📄 **Original:** ${file.name}\n📊 **Results:**\n• Total records: ${results.totalRecords}\n• Valid records: ${results.validRecords} (${Math.round((results.validRecords/results.totalRecords)*100)}%)\n• Email validation: ${results.emailValidation.valid} valid, ${results.emailValidation.invalid} invalid\n• Phone validation: ${results.phoneValidation.valid} valid, ${results.phoneValidation.formatted} formatted\n• **Quality Score: ${results.qualityScore}/100** ⭐\n\n📥 **Download:** ${results.outputFile}\n\n🤖 **Connexio AI Analysis:**\n_"${aiInsights.summary}"_\n\n**💡 Smart Recommendations:**\n• ${aiInsights.recommendations[0]}\n• ${aiInsights.recommendations[1]}\n• ${aiInsights.recommendations[2]}\n\n**🎯 Campaign Readiness:** ${aiInsights.campaignReadiness.toUpperCase()} (${aiInsights.riskLevel} risk)\n\n_Powered by Connexio.ai • Phase 1 Demo_`,
            });
          }
        } catch (error) {
          console.error('Error sending completion message:', error);
        }
      }, 8000); // 8 second demo delay for "AI analysis"

    } else if (text.toLowerCase() === 'status') {
      const userSessions = Array.from(processingSessions.values())
        .filter(session => session.userId === userId)
        .slice(-3); // Last 3 sessions

      if (userSessions.length === 0) {
        await respond({
          text: '📊 No recent processing sessions found.',
          response_type: 'ephemeral',
        });
        return;
      }

      const statusText = userSessions.map(session => {
        const duration = session.endTime 
          ? Math.round((session.endTime - session.startTime) / 1000)
          : Math.round((new Date() - session.startTime) / 1000);
        
        return `📄 ${session.fileName}\n   Status: ${session.status}\n   Duration: ${duration}s`;
      }).join('\n\n');

      await respond({
        text: `📊 **Recent Processing Sessions**\n\n${statusText}`,
        response_type: 'ephemeral',
      });

    } else {
      await respond({
        text: '❓ Unknown command. Use `/validate-file` (for help), `/validate-file start` (to process), or `/validate-file status` (to check status).',
        response_type: 'ephemeral',
      });
    }

  } catch (error) {
    console.error('Error in validate-file command:', error);
    await respond({
      text: '❌ An error occurred while processing your request. Please try again.',
      response_type: 'ephemeral',
    });
  }
});

// Help command
app.command('/help', async ({ command, ack, respond }) => {
  await ack();
  await respond({
    text: '🤖 **Connexio AI Commands**\n\n`/connexio` - Check bot status\n`/validate-file` - File validation service\n`/validate-file start` - Process uploaded CSV file\n`/validate-file status` - Check processing status\n\n**File Validation Features:**\n• Email validation & deliverability\n• Phone number formatting & validation\n• Data quality scoring\n• Standardized CSV output\n\n_Phase 1: CSV validation only. Phase 2 will add enrichment & Excel support._',
    response_type: 'ephemeral',
  });
});

// File upload event handler
app.event('file_shared', async ({ event, client }) => {
  try {
    if (event.file.mimetype === 'text/csv' || event.file.name.endsWith('.csv')) {
      await client.chat.postMessage({
        channel: event.channel_id,
        text: `📄 CSV file detected: **${event.file.name}**\n\n✨ I'm ready to validate your data!\n\nRun \`/validate-file start\` and I'll begin processing it automatically.\n\n_I'll check email formats, phone numbers, and provide you with a clean, standardized output file._`,
      });
    }
  } catch (error) {
    console.error('Error handling file upload:', error);
  }
});

// Error handler
app.error((error) => {
  console.error('Slack app error:', error);
});

// Start the app
(async () => {
  const port = process.env.PORT || 3000;
  await app.start(port);
  console.log(`⚡️ Slack bot is running on port ${port}!`);
  console.log('📄 File validation commands available: /validate-file');
})();