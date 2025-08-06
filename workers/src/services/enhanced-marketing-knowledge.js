/**
 * Enhanced Marketing Knowledge Base
 * Created from real client-agency conversations (anonymized)
 * Integrated into Connexio AI for authentic marketing expertise
 */

// Real-world marketing expertise extracted from client conversations
const REAL_WORLD_MARKETING_KNOWLEDGE = {
  // Client persona patterns - how clients actually ask questions
  clientPatterns: {
    concerns: [
      "How do we improve our email deliverability rates?",
      "What's causing our low open rates?", 
      "How can we better segment our database?",
      "Our CRM integration isn't working properly",
      "We need to automate our lead nurture process"
    ],
    priorities: [
      "ROI measurement and attribution",
      "Campaign performance optimization", 
      "Data quality and list hygiene",
      "Marketing automation workflows",
      "Integration between systems"
    ],
    painPoints: [
      "Deliverability issues affecting campaign reach",
      "Manual processes taking too much time",
      "Lack of visibility into campaign performance",
      "Poor data quality impacting targeting",
      "Disconnected systems causing data silos"
    ]
  },

  // Expert solutions - how marketing ops experts actually solve problems
  expertSolutions: {
    deliverability: {
      assessment: "Start with a comprehensive deliverability audit including sender reputation, authentication setup, and list quality analysis",
      quickWins: [
        "Implement SPF, DKIM, and DMARC authentication",
        "Remove hard bounces and complainers immediately", 
        "Segment active vs inactive subscribers",
        "Use double opt-in for new subscribers"
      ],
      longTerm: [
        "Establish consistent sending patterns",
        "Monitor sender reputation metrics",
        "Build engagement-based sending strategies",
        "Implement sunset policies for inactive subscribers"
      ]
    },
    
    segmentation: {
      approach: "Behavioral segmentation typically outperforms demographic - focus on engagement patterns and purchase behavior",
      strategies: [
        "Engagement-based: Active, inactive, re-engagement candidates",
        "Lifecycle stage: New subscribers, customers, advocates",
        "Behavioral: Purchase history, website activity, email preferences",
        "Predictive: Likelihood to purchase, churn risk, lifetime value"
      ],
      implementation: "Start simple with 3-5 segments, then expand based on performance data"
    },

    automation: {
      priorities: "Focus on high-impact, repetitive tasks first - welcome series, abandoned cart, and re-engagement campaigns",
      workflow_design: [
        "Map the customer journey before building workflows",
        "Use triggers based on behavior, not just time",
        "Build in testing and optimization from the start", 
        "Always include exit criteria and frequency caps"
      ],
      measurement: "Track workflow-specific metrics: conversion rates by step, drop-off points, and overall campaign attribution"
    },

    integration: {
      approach: "API-first integrations are more reliable than native connectors for complex use cases",
      planning: [
        "Document all data flows before starting integration",
        "Establish data governance and field mapping standards",
        "Plan for data cleansing and deduplication",
        "Set up monitoring and error handling"
      ],
      testing: "Always test with small data sets first, validate field mapping, and monitor for data quality issues"
    },

    hubspotEnrichment: {
      workflow: "Webhook-triggered real-time enrichment with AI deduplication is the gold standard for CRM integrations",
      pattern: [
        "HubSpot webhook triggers on contact create/update",
        "🧠 Claude deduplication check against existing contacts",
        "Execute merge strategy if duplicates found (most complete record wins)",
        "Retrieve contact details with selective field retrieval", 
        "Validate email address exists before processing",
        "Use validation service (NeverBounce/BriteVerify)",
        "Map results back to custom HubSpot properties",
        "Update contact record with enriched data"
      ],
      optimization: [
        "🧠 AI deduplication first - saves 20-30% on validation costs by avoiding duplicates",
        "Only validate new or changed email addresses",
        "Drop records without email addresses early",
        "Use batch processing for bulk operations",
        "Implement proper retry logic for API failures", 
        "Track cost per enrichment for ROI analysis",
        "Intelligent merge strategies preserve engagement history and data completeness"
      ],
      fieldMapping: "Create custom properties for validation results: email_validation_status, email_deliverable, data_quality_score"
    },

    eloquaValidation: {
      workflow: "AI-powered batch deduplication + email validation is the most essential data quality process for Eloqua campaigns",
      pattern: [
        "Discover available contact fields using GET /api/REST/1.0/assets/contact/fields",
        "Present email field options to user for source field selection",
        "🧠 Claude batch deduplication analysis before validation (saves 15-25% on API costs)",
        "Execute intelligent merge strategy for duplicate groups",
        "Process deduplicated contacts in batches (recommended: 1000 per batch)",
        "Validate emails using FreshAddress or BriteVerify APIs",
        "Map validation results to contact fields or Custom Data Objects",
        "Update Eloqua contacts via PUT /api/REST/2.0/data/contacts"
      ],
      bestPractices: [
        "🧠 Run Claude deduplication FIRST - can reduce dataset by 15-30% before validation",
        "Always discover fields first - clients often have multiple email fields",
        "Pre-filter invalid email formats before API calls to save costs", 
        "Use contact fields for simple status, CDOs for detailed validation history",
        "Batch processing at 1000 contacts balances API efficiency with error isolation",
        "Track validation costs and measure deliverability improvements",
        "AI merge strategies preserve engagement data and choose most complete records",
        "Fuzzy matching catches variations that exact matching misses (nicknames, company abbreviations)"
      ],
      serviceSelection: "FreshAddress for comprehensive validation (96% accuracy), BriteVerify for faster processing",
      resultMapping: "Support both contact field updates and CDO creation based on client reporting needs"
    }
  },

  // Real conversation patterns from client-agency interactions
  conversationPatterns: {
    clientQuestions: {
      strategic: [
        "What's the best approach for our industry?",
        "How do other companies handle this challenge?",
        "What should our priorities be for next quarter?"
      ],
      tactical: [
        "Can you walk me through the setup process?", 
        "What tools would you recommend?",
        "How long should this campaign run?"
      ],
      troubleshooting: [
        "Why isn't this working as expected?",
        "Our numbers look different than usual",
        "Something seems off with our data"
      ]
    },

    expertResponses: {
      strategic: "Let me share what we've seen work well for similar companies in your industry...",
      tactical: "Here's the step-by-step approach I'd recommend, starting with...",
      troubleshooting: "Let's diagnose this systematically. First, let's check..."
    }
  },

  // Industry best practices discovered through real client work
  bestPractices: {
    emailMarketing: [
      "Maintain list hygiene - remove bounces within 24 hours",
      "Test send times for your specific audience",
      "Use progressive profiling to gather data gradually",
      "Always include clear unsubscribe options",
      "Monitor engagement trends, not just open rates"
    ],
    
    dataQuality: [
      "🧠 AI-powered deduplication before all processing - prevents duplicate costs and improves accuracy",
      "Validate emails at point of capture, not just in batch",
      "Standardize phone number formats for better matching", 
      "Use consistent naming conventions across all systems",
      "Regular data audits should be part of monthly processes",
      "Implement data governance rules, don't just rely on technology",
      "Claude deduplication catches fuzzy matches that rule-based systems miss",
      "Merge strategy should preserve engagement data and most complete records"
    ],

    campaignOptimization: [
      "A/B test one element at a time for clear insights",
      "Focus on engagement quality over quantity",
      "Use behavioral triggers instead of batch-and-blast",
      "Measure business impact, not just marketing metrics",
      "Document what works for future campaign planning"
    ]
  },

  // Common tools and technologies discussed in real client conversations  
  toolsAndTech: {
    recommended: [
      "Marketing automation: Focus on platform that integrates well with your CRM",
      "Email validation: Real-time validation prevents most deliverability issues",
      "Analytics: Choose tools that track full customer journey, not just campaign metrics",
      "Data integration: API-based solutions are more flexible than pre-built connectors"
    ],
    
    evaluationCriteria: [
      "Integration capabilities with existing tech stack",
      "Scalability to handle growth in data and volume", 
      "Support quality and response times",
      "Total cost of ownership, not just licensing fees",
      "Security and compliance features"
    ]
  }
};

// Enhanced system prompt incorporating real client-agency dynamics
const ENHANCED_CONNEXIO_SYSTEM_PROMPT = `You are Connexio AI, a Marketing Operations expert with deep experience from real client-agency relationships.

🎯 **Your Expertise comes from real client work:**
You've learned from actual conversations between marketing ops experts and their clients, understanding both strategic challenges and tactical implementation details.

📊 **How you help clients:**
- **Strategic Guidance**: Like a seasoned marketing ops consultant, you provide industry best practices and proven approaches
- **Tactical Solutions**: You give step-by-step implementation guidance based on what actually works
- **Problem Solving**: You diagnose issues systematically, just like expert consultants do with their clients

🗣️ **Your Communication Style:**
- **Client-focused**: You understand business priorities and speak in terms of ROI and business impact
- **Practical**: You provide actionable recommendations that can be implemented immediately  
- **Consultative**: You ask clarifying questions to understand specific situations before giving advice
- **Experienced**: You can reference what works for "companies in similar situations" or "other clients"

💡 **Your Knowledge Base includes:**
- Real deliverability challenges and proven solutions
- Effective segmentation strategies that drive results
- Marketing automation workflows that convert
- Data quality practices that improve campaign performance
- Integration approaches that actually work in practice

🎯 **Client Conversation Patterns You Understand:**
- **Strategic questions**: "What's the best approach for our industry?"
- **Tactical requests**: "Can you walk me through the setup process?"
- **Troubleshooting**: "Why isn't this working as expected?"

Always respond as an experienced marketing operations consultant who has successfully solved similar challenges for other clients. Be specific, actionable, and focus on business outcomes.

Keep responses concise but comprehensive - like a consultant who respects the client's time while ensuring they get complete guidance.`;

// Conversation templates based on real client interactions
const CLIENT_CONVERSATION_TEMPLATES = {
  deliverabilityTroubleshooting: {
    trigger: ["deliverability", "open rate", "spam", "inbox"],
    response: `I see deliverability challenges come up frequently with clients. Let me walk you through the systematic approach that's worked well:

**Immediate Assessment:**
• Check your sender reputation (tools like Sender Score)
• Verify SPF, DKIM, and DMARC are properly set up
• Review recent bounce and complaint rates

**Quick Wins (implement this week):**
• Remove all hard bounces from your list immediately
• Set up authentication if not already done
• Segment your most engaged subscribers for a test send

**Longer-term strategy:**
• Implement engagement-based sending (active vs inactive segments)
• Establish consistent sending patterns
• Build a sunset policy for inactive subscribers

I've seen this approach improve deliverability by 15-30% for most clients within 30 days. Would you like me to dive deeper into any of these areas?`
  },

  segmentationStrategy: {
    trigger: ["segment", "targeting", "audience", "personalization"],
    response: `Segmentation is where I see the biggest impact for most clients. Here's the proven approach:

**Start with Engagement Segmentation:**
• Active (opened/clicked in last 30 days)
• Inactive (no engagement 30-90 days)  
• Re-engagement candidates (90+ days)

**Then layer in Behavioral:**
• Purchase history and frequency
• Website activity and preferences
• Email engagement patterns

**Pro tip from client experience:** Start with 3-5 segments maximum. I've seen companies try to create 20+ segments right away and it becomes unmanageable.

Most clients see 20-40% improvement in engagement rates just from basic engagement segmentation. What's your current approach to segmentation?`
  },

  automationPlanning: {
    trigger: ["automation", "workflow", "nurture", "drip"],
    response: `Marketing automation is powerful but needs to be implemented strategically. Here's what works:

**High-Impact Workflows to Start With:**
1. Welcome series (highest ROI for most clients)
2. Abandoned cart recovery (if e-commerce)
3. Re-engagement campaigns for inactive subscribers

**Workflow Design Best Practices:**
• Map the customer journey before building
• Use behavioral triggers, not just time-based
• Always include exit criteria and frequency caps
• Build in A/B testing from the start

**Common Mistake to Avoid:** Don't automate everything at once. I recommend starting with one workflow, optimizing it, then expanding.

What's your primary goal with automation - nurturing leads, customer retention, or something else?`
  },

  hubspotIntegration: {
    trigger: ["hubspot", "integration", "webhook", "enrichment", "neverbounce", "briteverify", "deduplication", "duplicate"],
    response: `HubSpot integrations with AI-powered deduplication are where I see the biggest impact for real-time data enrichment. Here's the enhanced proven pattern:

**🧠 AI-Enhanced Webhook-Triggered Enrichment Flow:**
1. **HubSpot Setup**: Configure webhook for contact create/update events
2. **Proxy Endpoint**: Create endpoint to receive webhook payloads  
3. **🧠 Claude Deduplication**: Check against existing contacts using intelligent fuzzy matching
4. **Merge Strategy**: Execute AI-powered merge if duplicates found (preserves engagement data)
5. **Selective Retrieval**: GET specific contact fields (not everything)
6. **Email Check**: Drop records without email addresses immediately
7. **Validation Service**: Use NeverBounce or BriteVerify for email validation
8. **Update Back**: PATCH results to custom HubSpot properties

**🎯 Key Success Factors:**
• 🧠 AI deduplication first - saves 20-30% on validation costs by avoiding duplicates
• Intelligent merge strategies preserve engagement history and data completeness
• Only process contacts with email addresses
• Map validation results to custom fields (email_validation_status, email_deliverable)
• Implement retry logic for API failures
• Track cost per enrichment for ROI

**Common Pitfalls:** Skipping deduplication step, not preserving engagement data in merges, validating already-validated emails.

I've seen this enhanced pattern reduce invalid email sends by 70-80% AND cut validation costs by 25% for most clients. The AI catches fuzzy duplicates that rule-based systems miss. What's your current HubSpot integration challenge?`
  },

  eloquaValidation: {
    trigger: ["eloqua", "validation", "freshaddress", "briteverify", "email validation", "oracle eloqua", "batch", "cdo", "deduplication", "duplicate"],
    response: `Eloqua email validation with AI deduplication is absolutely critical for campaign success. Here's the enhanced approach I use with clients:

**🧠 AI-Enhanced Eloqua Validation Workflow:**
1. **Field Discovery**: GET /api/REST/1.0/assets/contact/fields to find all email fields
2. **User Selection**: Let users choose which email field to validate (many clients have multiple)
3. **🧠 Claude Batch Deduplication**: AI analysis before validation (saves 15-25% on API costs)
4. **Intelligent Merge**: Execute AI-powered merge strategy for duplicate groups
5. **Batch Processing**: Process deduplicated contacts in batches of 1000 for optimal API efficiency
6. **Validation Service**: FreshAddress (96% accuracy) or BriteVerify (faster processing)
7. **Results Mapping**: Choose contact fields or CDOs based on reporting needs
8. **Eloqua Update**: Bulk update via PUT /api/REST/2.0/data/contacts

**🎯 Critical Success Factors:**
• 🧠 Run Claude deduplication FIRST - can reduce dataset by 15-30% before validation
• AI merge strategies preserve engagement data and choose most complete records
• Always discover fields first - don't assume which email field to use
• Pre-filter obvious invalid formats before API calls (saves 15-20% on costs)
• Use contact fields for simple validation status, CDOs for detailed history
• Track validation costs and measure deliverability improvements
• Fuzzy matching catches variations that exact matching misses (nicknames, company abbreviations)

**Common Mistakes:** Skipping deduplication step, processing without field discovery, not preserving engagement data in merges, validating already-validated emails.

I typically see 25-35% improvement in deliverability rates AND 20-25% cost reduction for Eloqua campaigns after AI-enhanced validation. The deduplication step alone often saves thousands in validation costs. What's your current validation challenge?`
  }
};

module.exports = {
  REAL_WORLD_MARKETING_KNOWLEDGE,
  ENHANCED_CONNEXIO_SYSTEM_PROMPT,
  CLIENT_CONVERSATION_TEMPLATES
};