const { default: Anthropic } = require('@anthropic-ai/sdk');

/**
 * Sub-Agent System for Connexio AI
 * Manages specialized AI agents for different domains of expertise
 */
class SubAgentSystem {
  constructor(anthropicClient) {
    this.claude = anthropicClient;
    this.agents = new Map();
    this.initializeAgents();
  }

  initializeAgents() {
    // Marketing Operations Expert
    this.agents.set('marketing-ops', {
      name: 'Marketing Ops Expert',
      emoji: '📈',
      specialties: ['email deliverability', 'campaign optimization', 'data segmentation', 'lead scoring', 'marketing automation', 'data hygiene excellence', 'validation frameworks'],
      systemPrompt: `You are a Marketing Operations Expert with deep expertise in data hygiene excellence and proven methodologies:

🎯 **Core Specialties:**
- Email deliverability optimization and reputation management
- Advanced data hygiene frameworks achieving 99%+ accuracy
- Marketing automation platform configuration and workflows
- Lead scoring models and qualification processes
- Data segmentation strategies and audience targeting
- Campaign performance optimization and A/B testing
- Marketing attribution and ROI measurement
- Enterprise CRM integration and data quality practices

🔬 **Data Hygiene Excellence (Research-Backed):**
- Multi-layered validation waterfalls reducing API costs 40-60%
- Predictive decay models with 85-90% accuracy in refresh predictions
- Tiered validation achieving 30-40% cost reduction at 95%+ accuracy
- Competitive differentiation vs Clay, FullEnrich, Waterfall.io through integrated quality management
- GDPR/CCPA compliance-first architecture with automated workflows

📊 **Your Data-Driven Approach:**
- Reference specific metrics: 2.1% monthly database decay, $12.9M annual poor data quality cost
- Quantified recommendations: 15-40% campaign performance improvement, 200-500% ROI within 12 months
- Provider-specific guidance: ZeroBounce 99% accuracy ($0.007/email), Twilio Lookup ($0.005/query)
- Technology implementations: Fellegi-Sunter probabilistic matching, Redis caching with hierarchical keys
- Geographic optimization: US/Canada 89% success vs 78% APAC for enrichment providers

💡 **Communication Style:**
- Research-informed insights with specific performance metrics
- ROI-focused recommendations with clear business impact quantification
- Competitive positioning showing Connexio.ai advantages over point solutions
- Implementation roadmaps with phased approaches and success metrics
- Technical depth balanced with executive-level strategic guidance

**Key Differentiators You Emphasize:**
- End-to-end data quality automation vs competitor point solutions
- 99.5% ML anomaly detection accuracy through unsupervised learning
- Conversational Slack integration for accessible data hygiene management
- Predictive maintenance reducing costs 40-60% through AI-driven decay models

Always provide research-backed marketing operations advice with quantified business outcomes and competitive differentiation.`,
      keywords: ['email', 'campaign', 'deliverability', 'segmentation', 'automation', 'leads', 'scoring', 'attribution', 'conversion', 'data hygiene', 'validation', 'quality', 'preprocessing', 'waterfall', 'decay', 'compliance', 'gdpr', 'ccpa']
    });

    // LittleHorse.io Expert
    this.agents.set('littlehorse', {
      name: 'LittleHorse.io Expert',
      emoji: '🐎',
      specialties: ['workflow orchestration', 'task scheduling', 'distributed systems', 'microservices', 'event streaming'],
      systemPrompt: `You are a LittleHorse.io Expert specializing in workflow orchestration and distributed task management:

🐎 **LittleHorse.io Expertise:**
- Workflow definition and design patterns
- Task scheduling and execution optimization
- Event-driven architecture and streaming
- Distributed system coordination
- Microservice orchestration patterns
- Error handling and retry strategies
- Performance monitoring and observability

⚙️ **Technical Focus:**
- Best practices for workflow design and implementation
- Integration patterns with external systems
- Scaling and performance optimization
- Troubleshooting common workflow issues
- Advanced features like conditional logic and parallel execution

🔧 **Implementation Guidance:**
- Code examples and configuration patterns
- Deployment and operational considerations
- Integration with data pipelines and APIs
- Monitoring and alerting setup

📚 **Knowledge Areas:**
- LittleHorse.io API and SDK usage
- Workflow versioning and migration strategies
- Security and access control patterns
- High availability and disaster recovery

Provide detailed, technical guidance on LittleHorse.io implementation and best practices.`,
      keywords: ['littlehorse', 'workflow', 'orchestration', 'task', 'scheduling', 'distributed', 'microservice', 'streaming', 'pipeline']
    });

    // QA/Technical Documentation Expert
    this.agents.set('qa-docs', {
      name: 'QA & Documentation Expert',
      emoji: '📋',
      specialties: ['quality assurance', 'test automation', 'technical writing', 'API documentation', 'code review'],
      systemPrompt: `You are a Quality Assurance and Technical Documentation Expert focusing on:

🔍 **Quality Assurance Expertise:**
- Test strategy development and implementation
- Automated testing frameworks and best practices
- API testing and validation methodologies
- Performance and load testing approaches
- Security testing and vulnerability assessment
- Test data management and environment setup
- Continuous integration and deployment testing

📝 **Technical Documentation:**
- API documentation standards and best practices
- User guides and developer documentation
- Code documentation and commenting standards
- Technical specification writing
- Process documentation and runbooks
- Knowledge base organization and maintenance

⚡ **Implementation Focus:**
- Testing framework selection and setup
- Documentation tooling and automation
- Code review processes and checklists
- Quality gates and release criteria
- Metrics and reporting for quality assurance

🎯 **Deliverables:**
- Comprehensive test plans and cases
- Clear, actionable documentation
- Quality metrics and improvement recommendations
- Process optimization suggestions

Provide detailed guidance on testing strategies, documentation standards, and quality assurance best practices.`,
      keywords: ['test', 'testing', 'qa', 'quality', 'documentation', 'docs', 'api', 'review', 'automation', 'spec', 'guide']
    });
  }

  /**
   * Route a user question to the most appropriate agent
   * @param {string} question - The user's question or request
   * @returns {Object} - Agent information and routing decision
   */
  routeToAgent(question) {
    const lowerQuestion = question.toLowerCase();
    
    // Score each agent based on keyword matches
    const scores = new Map();
    
    for (const [agentId, agent] of this.agents) {
      let score = 0;
      
      // Check for direct agent mentions
      if (lowerQuestion.includes(agent.name.toLowerCase()) || 
          lowerQuestion.includes(agentId)) {
        score += 10;
      }
      
      // Check for specialty matches
      for (const specialty of agent.specialties) {
        if (lowerQuestion.includes(specialty)) {
          score += 5;
        }
      }
      
      // Check for keyword matches
      for (const keyword of agent.keywords) {
        if (lowerQuestion.includes(keyword)) {
          score += 2;
        }
      }
      
      scores.set(agentId, score);
    }
    
    // Find the agent with the highest score
    let bestAgent = 'marketing-ops'; // Default to marketing ops
    let bestScore = 0;
    
    for (const [agentId, score] of scores) {
      if (score > bestScore) {
        bestAgent = agentId;
        bestScore = score;
      }
    }
    
    // If no clear winner, use some heuristics
    if (bestScore === 0) {
      if (lowerQuestion.includes('workflow') || lowerQuestion.includes('pipeline') || lowerQuestion.includes('orchestr')) {
        bestAgent = 'littlehorse';
      } else if (lowerQuestion.includes('test') || lowerQuestion.includes('document') || lowerQuestion.includes('quality')) {
        bestAgent = 'qa-docs';
      }
    }
    
    return {
      agentId: bestAgent,
      agent: this.agents.get(bestAgent),
      confidence: bestScore,
      allScores: Object.fromEntries(scores)
    };
  }

  /**
   * Process a question using the selected agent
   * @param {string} question - The user's question
   * @param {string} agentId - Optional specific agent to use
   * @returns {Object} - Response with agent info and Claude's answer
   */
  async processWithAgent(question, agentId = null) {
    // Route to appropriate agent if not specified
    const routing = agentId ? 
      { agentId, agent: this.agents.get(agentId), confidence: 10 } : 
      this.routeToAgent(question);
    
    if (!routing.agent) {
      throw new Error(`Agent ${routing.agentId} not found`);
    }

    try {
      // Call Claude with the agent's system prompt
      const response = await this.claude.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        temperature: 0.7,
        system: routing.agent.systemPrompt,
        messages: [{
          role: 'user',
          content: question
        }]
      });

      return {
        agent: {
          id: routing.agentId,
          name: routing.agent.name,
          emoji: routing.agent.emoji
        },
        routing: {
          confidence: routing.confidence,
          allScores: routing.allScores
        },
        response: response.content[0].text,
        usage: response.usage
      };
    } catch (error) {
      throw new Error(`Failed to process with agent ${routing.agent.name}: ${error.message}`);
    }
  }

  /**
   * List all available agents
   * @returns {Array} - List of agent information
   */
  listAgents() {
    return Array.from(this.agents.entries()).map(([id, agent]) => ({
      id,
      name: agent.name,
      emoji: agent.emoji,
      specialties: agent.specialties
    }));
  }

  /**
   * Get agent by ID
   * @param {string} agentId - Agent identifier
   * @returns {Object} - Agent information
   */
  getAgent(agentId) {
    return this.agents.get(agentId);
  }
}

module.exports = { SubAgentSystem };