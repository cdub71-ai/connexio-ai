# 🔄 Update Slack App with New Commands

## ⚠️ **ACTION REQUIRED**: Update Slack App Configuration

You need to update your Slack app with the **6 new slash commands** we just implemented.

### 🚀 **Quick Update Steps:**

#### **Option 1: App Manifest (Recommended)**
1. Go to https://api.slack.com/apps
2. Select your **Connexio AI** app
3. Go to **App Manifest** in the sidebar  
4. Copy the contents from `slack-app-manifest.json` in this repository
5. Paste and click **Save Changes**
6. Click **Update App** to apply changes

#### **Option 2: Manual Slash Commands**
1. Go to https://api.slack.com/apps
2. Select your **Connexio AI** app
3. Go to **Slash Commands** in the sidebar
4. Click **Create New Command** for each new command:

**New Commands to Add:**
```
Command: /enrich-file
URL: https://connexio-slack-simple.fly.dev/slack/events  
Description: Enrich CSV files with external data sources
Usage Hint: [description] - Apollo, Clearbit, Hunter enrichment

Command: /deliverability-check
URL: https://connexio-slack-simple.fly.dev/slack/events
Description: Analyze email deliverability and domain reputation  
Usage Hint: [email/domain] - DNS, SPF, DKIM analysis

Command: /segment-strategy
URL: https://connexio-slack-simple.fly.dev/slack/events
Description: AI-powered audience segmentation and targeting
Usage Hint: [audience description] - Strategic segmentation

Command: /campaign-audit
URL: https://connexio-slack-simple.fly.dev/slack/events
Description: Comprehensive campaign performance analysis
Usage Hint: [campaign details] - Performance optimization

Command: /create-campaign
URL: https://connexio-slack-simple.fly.dev/slack/events
Description: Create new marketing campaigns
Usage Hint: [campaign details] - Campaign creation

Command: /campaign-status  
URL: https://connexio-slack-simple.fly.dev/slack/events
Description: Check campaign status and metrics
Usage Hint: [campaign id] - Status monitoring
```

### ✅ **Verification Steps:**

After updating, test these commands in Slack:
- `/connexio help` - Should show all 9 commands
- `/enrich-file` - Should show enrichment help
- `/deliverability-check` - Should show deliverability help  
- `/segment-strategy` - Should show segmentation help
- `/campaign-audit` - Should show audit help

### 📋 **Current Command Status:**

| Command | Status | Description |
|---------|--------|-------------|
| `/connexio` | ✅ Existing | AI marketing consultant |
| `/validate-file` | ✅ Existing | File validation service |  
| `/help` | ✅ Existing | Command help |
| `/enrich-file` | 🆕 **NEW** | Data enrichment |
| `/deliverability-check` | 🆕 **NEW** | Email deliverability |
| `/segment-strategy` | 🆕 **NEW** | AI segmentation |
| `/campaign-audit` | 🆕 **NEW** | Campaign analysis |
| `/create-campaign` | ✅ Existing | Campaign creation |
| `/campaign-status` | ✅ Existing | Campaign monitoring |

### 🎯 **For Customer Demo:**

Once updated, your live customer demo will have access to:
- **9 total slash commands**
- **Enterprise-grade functionality** 
- **Immediate responses** (no timeouts)
- **Professional marketing operations** through Slack

### 🔍 **Troubleshooting:**

If commands don't work after update:
1. Check that the **Request URL** matches: `https://connexio-slack-simple.fly.dev/slack/events`
2. Verify the app is **installed in the workspace**
3. Test with `/connexio help` to confirm all commands are registered
4. Check Slack app **Event Subscriptions** are pointing to the correct URL

---

**⚡ Update this before your customer demo tomorrow!**