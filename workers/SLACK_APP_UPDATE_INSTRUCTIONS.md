# 🔧 Complete Slack App Update Instructions

## 📋 **Pre-Demo Checklist: Update Slack App with New Slash Commands**

### 🎯 **Goal**: Enable all 9 slash commands for your live customer demo

---

## 🚀 **Method 1: App Manifest (Recommended - 2 minutes)**

### **Step 1: Access Your Slack App**
1. Go to **https://api.slack.com/apps**
2. Sign in with your Slack workspace credentials
3. Find and click on **"Connexio AI"** (your existing app)

### **Step 2: Navigate to App Manifest**
1. In the left sidebar, click **"App Manifest"**
2. You'll see your current app configuration in JSON format

### **Step 3: Replace Manifest Content**
1. **Select ALL content** in the manifest editor (Ctrl/Cmd + A)
2. **Delete** the existing content
3. **Copy the complete manifest** from the file `/workers/slack-app-manifest.json`
4. **Paste** the new manifest into the editor

### **Step 4: Save Changes**
1. Click **"Save Changes"** (green button)
2. Review the changes summary - you should see **6 new slash commands** being added:
   - `/enrich-file`
   - `/deliverability-check` 
   - `/segment-strategy`
   - `/campaign-audit`
   - `/create-campaign`
   - `/campaign-status`
3. Click **"Update App"** to apply changes

### **Step 5: Verify Installation**
1. The app should show **"Updated successfully"**
2. Go to **"Install App"** in the sidebar
3. Click **"Reinstall to Workspace"** if prompted
4. Authorize the updated permissions

---

## 🛠️ **Method 2: Manual Command Addition (10 minutes)**

### **Step 1: Access Slash Commands**
1. Go to **https://api.slack.com/apps**
2. Select **"Connexio AI"** app
3. Click **"Slash Commands"** in the left sidebar

### **Step 2: Add Each New Command**
Click **"Create New Command"** for each command below:

#### **Command 1: File Enrichment**
```
Command: /enrich-file
Request URL: https://connexio-slack-simple.fly.dev/slack/events
Short Description: Enrich CSV files with external data sources
Usage Hint: [description] - Apollo, Clearbit, Hunter enrichment
Escape channels, users, and links sent to your app: ☐ (unchecked)
```

#### **Command 2: Deliverability Check**
```
Command: /deliverability-check
Request URL: https://connexio-slack-simple.fly.dev/slack/events
Short Description: Analyze email deliverability and domain reputation
Usage Hint: [email/domain] - DNS, SPF, DKIM analysis
Escape channels, users, and links sent to your app: ☐ (unchecked)
```

#### **Command 3: Segmentation Strategy**
```
Command: /segment-strategy
Request URL: https://connexio-slack-simple.fly.dev/slack/events
Short Description: AI-powered audience segmentation and targeting
Usage Hint: [audience description] - Strategic segmentation
Escape channels, users, and links sent to your app: ☐ (unchecked)
```

#### **Command 4: Campaign Audit**
```
Command: /campaign-audit
Request URL: https://connexio-slack-simple.fly.dev/slack/events
Short Description: Comprehensive campaign performance analysis
Usage Hint: [campaign details] - Performance optimization
Escape channels, users, and links sent to your app: ☐ (unchecked)
```

#### **Command 5: Create Campaign**
```
Command: /create-campaign
Request URL: https://connexio-slack-simple.fly.dev/slack/events
Short Description: Create new marketing campaigns
Usage Hint: [campaign details] - Campaign creation
Escape channels, users, and links sent to your app: ☐ (unchecked)
```

#### **Command 6: Campaign Status**
```
Command: /campaign-status
Request URL: https://connexio-slack-simple.fly.dev/slack/events
Short Description: Check campaign status and metrics
Usage Hint: [campaign id] - Status monitoring
Escape channels, users, and links sent to your app: ☐ (unchecked)
```

### **Step 3: Save Each Command**
- Click **"Save"** after entering each command
- Verify the command appears in your slash commands list

---

## ✅ **Verification Steps (Critical for Demo Success)**

### **Test in Your Slack Workspace**
Open any Slack channel and test these commands:

```bash
# Test core functionality
/connexio help
# Expected: Shows all 9 available commands

# Test new commands show help when called without parameters
/enrich-file
/deliverability-check
/segment-strategy
/campaign-audit

# Expected: Each shows detailed usage instructions
```

### **Verify All Commands Are Listed**
When you type `/connexio help`, you should see:

**✅ Expected Command List:**
- `/connexio` - AI marketing consultant
- `/validate-file` - File validation service
- `/enrich-file` - 🆕 Data enrichment
- `/deliverability-check` - 🆕 Email deliverability
- `/segment-strategy` - 🆕 AI segmentation  
- `/campaign-audit` - 🆕 Campaign analysis
- `/create-campaign` - Campaign creation
- `/campaign-status` - Campaign monitoring
- `/help` - Command help

---

## 🚨 **Troubleshooting Common Issues**

### **Issue: Commands Don't Appear**
**Solution:**
1. Check that Request URL is exactly: `https://connexio-slack-simple.fly.dev/slack/events`
2. Verify app is installed in the workspace
3. Try typing `/` in Slack - new commands should appear in autocomplete

### **Issue: Commands Return Errors**
**Solution:**
1. Check app has proper OAuth scopes:
   - `commands`
   - `chat:write`
   - `files:read`
   - `channels:history`
   - `users:read`
   - `app_mentions:read`

### **Issue: Bot Doesn't Respond**
**Solution:**
1. Verify Event Subscriptions URL: `https://connexio-slack-simple.fly.dev/slack/events`
2. Check that bot events include:
   - `file_shared`
   - `app_mention`

---

## 🎯 **Demo Day Preparation**

### **Final Demo Checklist** ✅
- [ ] App manifest updated successfully
- [ ] All 9 slash commands working
- [ ] `/connexio help` shows complete command list
- [ ] Test commands respond with professional help text
- [ ] Bot responds to @mentions
- [ ] No timeout errors in any commands

### **Demo Script Suggestions**

**Opening:**
> "Let me show you our enterprise AI marketing automation platform integrated directly in Slack..."

**Command Demo:**
```bash
# Start with AI assistant
/connexio help

# Show data operations
/enrich-file contact database with 1000 leads

# Display strategic capabilities  
/segment-strategy e-commerce customer base

# Demonstrate performance analysis
/campaign-audit Q4 email campaigns
```

**Closing:**
> "As you can see, Connexio AI provides consultant-level marketing operations with enterprise reliability - all accessible through simple Slack commands."

---

## 📞 **Need Help?**

If you encounter issues during the update:

1. **Check the manifest file**: `/workers/slack-app-manifest.json`
2. **Review detailed troubleshooting**: `/workers/scripts/update-slack-commands.md`
3. **Test services**: Run `/workers/scripts/test-lightweight-services.js`

---

## 🎊 **You're Ready!**

Once commands are updated, your **live customer demo** will showcase:
- **9 professional slash commands**
- **Enterprise-grade AI responses**
- **Immediate response times**
- **Professional marketing operations platform**

**Your Connexio AI platform will impress! 🚀**