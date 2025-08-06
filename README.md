# 🤖 Connexio AI - Marketing Operations Assistant

AI-powered marketing operations assistant that validates data, analyzes files, and provides expert marketing advice through Slack integration.

## 🎯 **Current Features**

### ✅ **Phase 1 - File Validation & Enhanced AI Assistant (LIVE)**
- **CSV File Validation**: Email and phone number validation with quality scoring
- **Enhanced AI Marketing Assistant**: Claude-powered with REAL client-agency conversation training
- **Slack Integration**: Seamless bot commands and file upload detection  
- **Data Quality Analysis**: 19 standardized output columns with validation results
- **🆕 Real Client Training**: AI responses based on actual marketing operations consulting experience

### 🚀 **Live Deployment**
- **Slack Bot**: https://connexio-slack-simple.fly.dev/
- **File Processing**: Phase 1 complete with AI insights
- **Enhanced Claude Integration**: Trained on real client conversations (anonymized)
- **Consultant-Level Expertise**: Responses matching experienced marketing ops professionals

## 📱 **Slack Commands**

### Primary Commands
- `/connexio` - Meet your enhanced AI marketing consultant
- `/connexio [question]` - Ask marketing questions (powered by Claude AI + real client training)
- `/validate-file` - File validation service with AI insights
- `/validate-file start` - Process uploaded CSV file
- `/validate-file status` - Check processing status
- `/help` - View all available commands

### Enhanced AI Features
- **Smart Template Matching**: Recognizes common client question patterns
- **Consultant-Level Responses**: "I've seen this approach work well for other clients..."
- **Real Client Experience**: Trained on anonymized Sureshot-client conversations
- **Specific Metrics**: Provides actual performance improvements (e.g., "15-30% deliverability improvement")
- **Expert Frameworks**: Deliverability troubleshooting, segmentation strategy, automation planning

### File Processing Features
- **Email Validation**: Format validation and deliverability analysis
- **Phone Validation**: International formatting and validation
- **Quality Scoring**: Comprehensive data quality assessment
- **AI Insights**: Intelligent campaign recommendations based on real client patterns
- **Standardized Output**: 19-column format with validation results

## 🏗️ **Architecture**

### Core Components
- **Enhanced Slack Bot** (`claude-enhanced-bot.js`) - Main Slack integration with enhanced Claude AI
- **Real Client Training** (`enhanced-marketing-knowledge.js`) - Extracted client-agency expertise
- **Thread Extraction System** (`slack-thread-extractor.js`) - Anonymized conversation processing
- **File Processing** (`file-enrichment-worker.js`) - CSV validation and analysis
- **Claude Integration** (`claude-file-analyzer.js`) - AI-powered insights with client patterns
- **Little Horse** - Workflow orchestration (ready for Phase 2)
- **Fly.io Deployment** - Production hosting

### Technology Stack
- **Node.js** - Runtime environment
- **Slack Bolt** - Slack app framework
- **Claude AI** - Anthropic's AI for marketing expertise
- **Little Horse** - Workflow orchestration platform
- **Fly.io** - Cloud deployment platform

## 🚀 **Quick Start**

### Prerequisites
- Node.js 18+ installed
- Slack workspace with admin access
- Claude API key from Anthropic
- Fly.io account (for deployment)

### Local Development
```bash
# Clone the repository
git clone <repository-url>
cd connexio-ai/workers

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys

# Start development server
npm run dev
```

### Environment Variables
```bash
# Slack Configuration
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret

# Claude AI
ANTHROPIC_API_KEY=sk-ant-api03-your-key

# Little Horse (optional for Phase 1)
LITTLEHORSE_API_HOST=localhost
LITTLEHORSE_API_PORT=2023
```

## 📋 **Project Structure**

```
connexio-ai/
├── workers/                          # Main application directory
│   ├── src/
│   │   ├── claude-enhanced-bot.js    # Main Slack bot with Claude AI
│   │   ├── services/
│   │   │   ├── claude-file-analyzer.js    # AI-powered file analysis
│   │   │   ├── file-parsing-service.js    # CSV parsing utilities
│   │   │   └── file-output-service.js     # Standardized output generation
│   │   └── workers/
│   │       └── file-enrichment-worker.js  # Phase 1 file processing
│   ├── scripts/
│   │   └── update-slack-app.sh       # Slack configuration automation
│   ├── .github/workflows/            # CI/CD automation
│   ├── slack-app-manifest.json       # Slack app configuration
│   ├── fly-simple.toml              # Fly.io deployment config
│   └── SLACK_AUTOMATION.md          # Deployment documentation
```

## 🎯 **Current Status & Roadmap**

### ✅ **Completed (Phase 1 + Enhanced AI)**
- [x] CSV file upload and parsing
- [x] Email validation (format, domain, deliverability analysis)
- [x] Phone number validation and formatting
- [x] Data quality scoring system
- [x] Claude AI integration for marketing insights
- [x] **🆕 Real client conversation extraction and anonymization**
- [x] **🆕 Enhanced Claude training with client-agency expertise**
- [x] **🆕 Smart template matching for common marketing questions**
- [x] **🆕 Consultant-level AI responses with specific metrics**
- [x] Slack bot with intelligent commands
- [x] Standardized 19-column output format
- [x] Fly.io deployment with automation
- [x] File upload detection and processing

### 🔄 **Phase 2 (Planned)**
- [ ] External data enrichment (Apollo.io, Leadspace)
- [ ] Excel file support (.xlsx/.xls)
- [ ] Advanced email deliverability checking
- [ ] International phone number validation
- [ ] List hygiene and deduplication
- [ ] Bulk processing for large files

### 🎯 **Phase 3 (Future)**
- [ ] Marketing automation platform integrations
- [ ] Campaign execution workflows
- [ ] Real-time data sync and monitoring
- [ ] Advanced analytics and reporting

## 🚀 **Deployment**

### Fly.io Production Deployment
```bash
# Deploy to production
cd workers
flyctl deploy --config fly-simple.toml

# Check deployment status
flyctl status --app connexio-slack-simple

# View logs
flyctl logs --app connexio-slack-simple
```

### Slack App Configuration
1. Import `slack-app-manifest.json` to your Slack app
2. Update slash command URLs to point to your Fly.io deployment
3. Install the app to your workspace
4. Test with `/connexio` and file uploads

## 📊 **Testing**

### Manual Testing Checklist
- [ ] `/connexio` shows assistant greeting
- [ ] `/connexio [question]` returns AI marketing advice
- [ ] CSV file upload triggers bot detection
- [ ] `/validate-file start` processes uploaded files
- [ ] Download links work for processed files
- [ ] AI insights provide meaningful recommendations

### Sample Test Questions (Enhanced AI)
**Template-Matched Questions:**
- "How do I improve email deliverability?" → Expert troubleshooting framework
- "What's the best way to segment our email list?" → Engagement-based strategies  
- "How should we set up marketing automation?" → High-impact workflow planning

**General Enhanced Questions:**
- "What metrics should we track for email campaigns?" → Business-focused analytics
- "Our CRM integration isn't working properly" → Systematic troubleshooting approach
- "How should I clean my marketing database?" → Data hygiene best practices

## 🧠 **Enhanced AI Training**

### **Real Client Conversation Integration**
Connexio AI has been enhanced with training data extracted from actual client-agency conversations:

**Data Source:** Anonymized Sureshot-Xceleration client channel  
**Extraction:** 54 messages + 38 thread replies processed with privacy protection  
**Training Enhancement:** Claude AI trained on real marketing operations consulting patterns

### **Key AI Enhancements:**
- **Consultant Persona:** Responses match experienced marketing ops professionals
- **Real Experience References:** "I've seen this approach work well for other clients"
- **Specific Metrics:** Provides actual performance improvements from client work
- **Template Matching:** Smart detection of common client question patterns
- **Industry Context:** Responses based on real client challenges and solutions

### **Privacy & Anonymization:**
- All personal names replaced with professional personas
- Email addresses, phone numbers, and URLs anonymized
- Focus preserved on marketing tactics and strategies
- Full compliance with data privacy requirements

### **Files Created:**
- `src/services/enhanced-marketing-knowledge.js` - Real client training data
- `src/services/slack-thread-extractor.js` - Conversation extraction system
- `src/test-enhanced-claude.js` - AI enhancement testing framework
- `thread-data/` - Processed conversation insights (gitignored)
- `ENHANCED_CLAUDE_DEPLOYMENT.md` - Complete enhancement documentation

## 🤝 **Contributing**

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 **License**

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 **Support**

For support and questions:
- Create an issue in the GitHub repository
- Check the `SLACK_AUTOMATION.md` for deployment help
- Review Fly.io logs for troubleshooting

---

**🎉 Enhanced AI Now Live - Ready for User Testing!**

**Current Focus:** Gathering user feedback on enhanced Claude AI with real client training data. The bot now provides consultant-level marketing operations expertise based on actual client-agency conversations.

**Try the enhanced AI:** `/connexio How do I improve email deliverability?` and experience the difference!