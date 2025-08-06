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
      "Validate emails at point of capture, not just in batch",
      "Standardize phone number formats for better matching",
      "Use consistent naming conventions across all systems",
      "Regular data audits should be part of monthly processes",
      "Implement data governance rules, don't just rely on technology"
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
  }
};

module.exports = {
  REAL_WORLD_MARKETING_KNOWLEDGE,
  ENHANCED_CONNEXIO_SYSTEM_PROMPT,
  CLIENT_CONVERSATION_TEMPLATES
};