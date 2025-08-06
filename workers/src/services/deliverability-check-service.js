/**
 * Deliverability Check Service
 * Comprehensive email deliverability analysis with domain reputation, authentication checks, and spam testing
 */

const { default: Anthropic } = require('@anthropic-ai/sdk');
const axios = require('axios');
const dns = require('dns').promises;

class DeliverabilityCheckService {
  constructor(options = {}) {
    this.claude = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    this.config = {
      hunterApiKey: process.env.HUNTER_API_KEY,
      neverbounceApiKey: process.env.NEVERBOUNCE_API_KEY,
      briteverifyApiKey: process.env.BRITEVERIFY_API_KEY,
      enableDNSChecks: options.enableDNSChecks !== false,
      enableReputationChecks: options.enableReputationChecks !== false,
      enableAIAnalysis: options.enableAIAnalysis !== false,
      deliverabilityTimeout: options.deliverabilityTimeout || 15000
    };

    // Deliverability tracking
    this.deliverabilityCache = new Map();
    this.domainAnalysisHistory = new Map();
    this.reputationData = new Map();

    // Performance metrics
    this.deliverabilityMetrics = {
      totalChecksPerformed: 0,
      domainsAnalyzed: new Set(),
      authenticationFailures: 0,
      reputationIssues: 0,
      averageCheckTime: 0,
      deliverabilityScores: []
    };

    console.log('📧 Deliverability Check Service initialized');
  }

  /**
   * Perform comprehensive deliverability analysis
   * @param {string|Array} input - Email addresses, domains, or file content
   * @param {Object} checkOptions - Analysis configuration
   * @returns {Object} Deliverability analysis results
   */
  async performDeliverabilityCheck(input, checkOptions = {}) {
    const checkId = this.generateCheckId();
    const startTime = Date.now();

    console.log(`📧 Starting deliverability check ${checkId}...`);

    try {
      // Step 1: Parse and categorize input
      const inputAnalysis = await this.analyzeInput(input, checkOptions);
      console.log(`📊 Input analysis complete: ${inputAnalysis.emails.length} emails, ${inputAnalysis.domains.length} domains`);

      // Step 2: Domain-level deliverability analysis
      const domainResults = await this.analyzeDomainDeliverability(
        inputAnalysis.domains,
        checkOptions
      );

      // Step 3: Email-level validation and deliverability
      const emailResults = await this.analyzeEmailDeliverability(
        inputAnalysis.emails,
        checkOptions
      );

      // Step 4: Authentication and security checks
      const authenticationResults = await this.performAuthenticationChecks(
        inputAnalysis.domains,
        checkOptions
      );

      // Step 5: Reputation and blacklist analysis
      const reputationResults = await this.analyzeReputationStatus(
        inputAnalysis.domains,
        checkOptions
      );

      // Step 6: AI-powered deliverability recommendations
      const aiAnalysis = await this.generateDeliverabilityRecommendations(
        domainResults,
        emailResults,
        authenticationResults,
        reputationResults
      );

      // Step 7: Generate comprehensive deliverability report
      const deliverabilityReport = this.generateDeliverabilityReport(
        inputAnalysis,
        domainResults,
        emailResults,
        authenticationResults,
        reputationResults,
        aiAnalysis,
        Date.now() - startTime
      );

      const result = {
        checkId: checkId,
        inputAnalysis: inputAnalysis,
        domainResults: domainResults,
        emailResults: emailResults,
        authenticationResults: authenticationResults,
        reputationResults: reputationResults,
        aiAnalysis: aiAnalysis,
        deliverabilityReport: deliverabilityReport,
        processingTime: Date.now() - startTime,
        completedAt: new Date().toISOString()
      };

      // Store check history
      this.domainAnalysisHistory.set(checkId, result);
      this.updateDeliverabilityMetrics(result);

      console.log(`✅ Deliverability check complete: analyzed ${inputAnalysis.emails.length + inputAnalysis.domains.length} items`);

      return result;

    } catch (error) {
      console.error(`Deliverability check failed for ${checkId}:`, error);
      throw new Error(`Deliverability check failed: ${error.message}`);
    }
  }

  /**
   * Analyze and categorize input data
   */
  async analyzeInput(input, options) {
    console.log('🔍 Analyzing input data...');

    const emails = new Set();
    const domains = new Set();
    let inputType = 'unknown';

    if (typeof input === 'string') {
      // Check if it's a file path or raw data
      if (input.includes('@')) {
        // Contains email patterns
        const emailMatches = input.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
        emailMatches.forEach(email => emails.add(email.toLowerCase()));
        inputType = 'email_string';
      } else if (input.includes('.') && !input.includes('\n') && input.length < 100) {
        // Likely a domain
        domains.add(input.toLowerCase());
        inputType = 'single_domain';
      } else {
        // Treat as text content
        const emailMatches = input.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
        emailMatches.forEach(email => emails.add(email.toLowerCase()));
        inputType = 'text_content';
      }
    } else if (Array.isArray(input)) {
      input.forEach(item => {
        if (typeof item === 'string') {
          if (item.includes('@')) {
            emails.add(item.toLowerCase());
          } else if (item.includes('.')) {
            domains.add(item.toLowerCase());
          }
        }
      });
      inputType = 'array_input';
    }

    // Extract domains from emails
    Array.from(emails).forEach(email => {
      const domain = email.split('@')[1];
      if (domain) {
        domains.add(domain);
      }
    });

    return {
      inputType: inputType,
      emails: Array.from(emails),
      domains: Array.from(domains),
      totalItems: emails.size + domains.size,
      analysisTimestamp: new Date().toISOString()
    };
  }

  /**
   * Analyze domain-level deliverability factors
   */
  async analyzeDomainDeliverability(domains, options) {
    console.log(`🏗️ Analyzing deliverability for ${domains.length} domains...`);

    const results = [];

    for (const domain of domains) {
      try {
        const domainAnalysis = await this.analyzeSingleDomain(domain, options);
        results.push(domainAnalysis);

        // Track metrics
        this.deliverabilityMetrics.domainsAnalyzed.add(domain);

      } catch (error) {
        console.error(`Domain analysis failed for ${domain}:`, error);
        results.push({
          domain: domain,
          error: error.message,
          deliverabilityScore: 0,
          analysisComplete: false
        });
      }
    }

    return {
      totalDomains: domains.length,
      successfulAnalyses: results.filter(r => r.analysisComplete).length,
      domainAnalyses: results,
      averageDeliverabilityScore: this.calculateAverageScore(results)
    };
  }

  /**
   * Analyze single domain deliverability
   */
  async analyzeSingleDomain(domain, options) {
    console.log(`🔍 Analyzing domain: ${domain}`);

    const analysis = {
      domain: domain,
      deliverabilityScore: 0,
      factors: {},
      issues: [],
      recommendations: [],
      analysisComplete: false
    };

    // DNS and MX Record Analysis
    if (this.config.enableDNSChecks) {
      const dnsResults = await this.analyzeDNSConfiguration(domain);
      analysis.factors.dns = dnsResults;
      
      if (dnsResults.mxRecords.length === 0) {
        analysis.issues.push('No MX records found - emails cannot be delivered');
        analysis.deliverabilityScore -= 30;
      } else {
        analysis.deliverabilityScore += 20;
      }
    }

    // Domain Age and Trust Analysis
    const domainTrustAnalysis = await this.analyzeDomainTrust(domain);
    analysis.factors.trust = domainTrustAnalysis;
    analysis.deliverabilityScore += domainTrustAnalysis.trustScore;

    // Content and Structure Analysis
    const structureAnalysis = await this.analyzeDomainStructure(domain);
    analysis.factors.structure = structureAnalysis;
    analysis.deliverabilityScore += structureAnalysis.structureScore;

    // Normalize deliverability score (0-100)
    analysis.deliverabilityScore = Math.max(0, Math.min(100, analysis.deliverabilityScore + 50));
    analysis.analysisComplete = true;

    return analysis;
  }

  /**
   * Perform DNS configuration analysis
   */
  async analyzeDNSConfiguration(domain) {
    console.log(`🔍 Analyzing DNS configuration for ${domain}`);

    const dnsResults = {
      mxRecords: [],
      aRecords: [],
      txtRecords: [],
      hasValidMX: false,
      mxPriority: null,
      dnsResolutionTime: 0
    };

    try {
      const startTime = Date.now();

      // Get MX Records
      try {
        const mxRecords = await dns.resolveMx(domain);
        dnsResults.mxRecords = mxRecords.sort((a, b) => a.priority - b.priority);
        dnsResults.hasValidMX = mxRecords.length > 0;
        dnsResults.mxPriority = mxRecords.length > 0 ? mxRecords[0].priority : null;
      } catch (error) {
        console.warn(`MX lookup failed for ${domain}:`, error.message);
      }

      // Get A Records
      try {
        const aRecords = await dns.resolve4(domain);
        dnsResults.aRecords = aRecords;
      } catch (error) {
        console.warn(`A record lookup failed for ${domain}:`, error.message);
      }

      // Get TXT Records for authentication
      try {
        const txtRecords = await dns.resolveTxt(domain);
        dnsResults.txtRecords = txtRecords.flat();
      } catch (error) {
        console.warn(`TXT record lookup failed for ${domain}:`, error.message);
      }

      dnsResults.dnsResolutionTime = Date.now() - startTime;

    } catch (error) {
      console.error(`DNS analysis failed for ${domain}:`, error);
    }

    return dnsResults;
  }

  /**
   * Analyze domain trust factors
   */
  async analyzeDomainTrust(domain) {
    const trustAnalysis = {
      domain: domain,
      trustScore: 0,
      factors: [],
      warnings: []
    };

    // Check domain extension reputation
    const tld = domain.split('.').pop().toLowerCase();
    const trustedTlds = ['com', 'org', 'net', 'edu', 'gov'];
    const suspiciousTlds = ['tk', 'ml', 'ga', 'cf'];

    if (trustedTlds.includes(tld)) {
      trustAnalysis.trustScore += 10;
      trustAnalysis.factors.push('Trusted TLD');
    } else if (suspiciousTlds.includes(tld)) {
      trustAnalysis.trustScore -= 15;
      trustAnalysis.warnings.push('Suspicious TLD - may affect deliverability');
    }

    // Check for subdomain depth
    const subdomainDepth = domain.split('.').length - 2;
    if (subdomainDepth > 1) {
      trustAnalysis.trustScore -= 5;
      trustAnalysis.warnings.push('Deep subdomain structure may reduce trust');
    }

    // Check for suspicious patterns
    const suspiciousPatterns = [
      /\d{4,}/, // Long number sequences
      /[0-9]+[a-z]+[0-9]+/, // Mixed numbers and letters
      /-{2,}/, // Multiple consecutive dashes
      /[\.]{2,}/ // Multiple consecutive dots
    ];

    suspiciousPatterns.forEach(pattern => {
      if (pattern.test(domain)) {
        trustAnalysis.trustScore -= 5;
        trustAnalysis.warnings.push('Suspicious domain pattern detected');
      }
    });

    return trustAnalysis;
  }

  /**
   * Analyze domain structure and configuration
   */
  async analyzeDomainStructure(domain) {
    const structureAnalysis = {
      domain: domain,
      structureScore: 0,
      features: [],
      issues: []
    };

    // Check domain length
    if (domain.length < 5) {
      structureAnalysis.structureScore -= 5;
      structureAnalysis.issues.push('Very short domain name');
    } else if (domain.length > 50) {
      structureAnalysis.structureScore -= 10;
      structureAnalysis.issues.push('Unusually long domain name');
    } else {
      structureAnalysis.structureScore += 5;
      structureAnalysis.features.push('Appropriate domain length');
    }

    // Check for internationalized domains
    if (/[^\x00-\x7F]/.test(domain)) {
      structureAnalysis.structureScore -= 5;
      structureAnalysis.issues.push('Internationalized domain may have deliverability issues');
    }

    return structureAnalysis;
  }

  /**
   * Analyze email-level deliverability
   */
  async analyzeEmailDeliverability(emails, options) {
    console.log(`📧 Analyzing deliverability for ${emails.length} email addresses...`);

    const results = [];

    // Process emails in batches to respect API limits
    const batchSize = 25;
    const batches = this.chunkArray(emails, batchSize);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`📦 Processing email batch ${batchIndex + 1}/${batches.length} (${batch.length} emails)`);

      const batchResults = await this.processEmailBatch(batch, options);
      results.push(...batchResults);

      // Rate limiting delay between batches
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return {
      totalEmails: emails.length,
      validEmails: results.filter(r => r.isValid).length,
      deliverableEmails: results.filter(r => r.isDeliverable).length,
      emailAnalyses: results,
      averageDeliverabilityScore: this.calculateAverageScore(results)
    };
  }

  /**
   * Process batch of emails for deliverability
   */
  async processEmailBatch(emailBatch, options) {
    const batchResults = [];

    for (const email of emailBatch) {
      try {
        const emailAnalysis = await this.analyzeSingleEmail(email, options);
        batchResults.push(emailAnalysis);

      } catch (error) {
        console.error(`Email analysis failed for ${email}:`, error);
        batchResults.push({
          email: email,
          error: error.message,
          isValid: false,
          isDeliverable: false,
          deliverabilityScore: 0
        });
      }
    }

    return batchResults;
  }

  /**
   * Analyze single email deliverability
   */
  async analyzeSingleEmail(email, options) {
    console.log(`📧 Analyzing email: ${email}`);

    const analysis = {
      email: email,
      isValid: false,
      isDeliverable: false,
      deliverabilityScore: 0,
      validationResults: {},
      issues: [],
      recommendations: []
    };

    // Basic format validation
    const formatValidation = this.validateEmailFormat(email);
    analysis.validationResults.format = formatValidation;
    analysis.isValid = formatValidation.valid;

    if (!analysis.isValid) {
      analysis.issues.push('Invalid email format');
      return analysis;
    }

    // Provider-based validation
    if (this.config.hunterApiKey) {
      try {
        const hunterResult = await this.validateWithHunter(email);
        analysis.validationResults.hunter = hunterResult;
        
        if (hunterResult.result === 'deliverable') {
          analysis.deliverabilityScore += 30;
          analysis.isDeliverable = true;
        } else if (hunterResult.result === 'risky') {
          analysis.deliverabilityScore += 15;
          analysis.issues.push('Email marked as risky by validation provider');
        } else if (hunterResult.result === 'undeliverable') {
          analysis.deliverabilityScore -= 20;
          analysis.issues.push('Email marked as undeliverable');
        }
      } catch (error) {
        console.warn(`Hunter validation failed for ${email}:`, error.message);
      }
    }

    // Role account detection
    const roleAnalysis = this.analyzeRoleAccount(email);
    analysis.validationResults.roleAccount = roleAnalysis;
    
    if (roleAnalysis.isRoleAccount) {
      analysis.deliverabilityScore -= 10;
      analysis.issues.push('Role-based email may have lower engagement');
    }

    // Disposable email detection
    const disposableAnalysis = this.analyzeDisposableEmail(email);
    analysis.validationResults.disposable = disposableAnalysis;
    
    if (disposableAnalysis.isDisposable) {
      analysis.deliverabilityScore -= 25;
      analysis.issues.push('Disposable email address detected');
    }

    // Normalize deliverability score
    analysis.deliverabilityScore = Math.max(0, Math.min(100, analysis.deliverabilityScore + 50));

    return analysis;
  }

  /**
   * Validate email with Hunter.io
   */
  async validateWithHunter(email) {
    const response = await axios.get('https://api.hunter.io/v2/email-verifier', {
      params: {
        email: email,
        api_key: this.config.hunterApiKey
      },
      timeout: this.config.deliverabilityTimeout
    });

    return response.data.data;
  }

  /**
   * Perform authentication checks (SPF, DKIM, DMARC)
   */
  async performAuthenticationChecks(domains, options) {
    console.log(`🔐 Performing authentication checks for ${domains.length} domains...`);

    const results = [];

    for (const domain of domains) {
      try {
        const authAnalysis = await this.analyzeEmailAuthentication(domain);
        results.push(authAnalysis);

        // Track authentication failures
        if (!authAnalysis.spf.valid || !authAnalysis.dkim.valid || !authAnalysis.dmarc.valid) {
          this.deliverabilityMetrics.authenticationFailures++;
        }

      } catch (error) {
        console.error(`Authentication check failed for ${domain}:`, error);
        results.push({
          domain: domain,
          error: error.message,
          authenticationScore: 0
        });
      }
    }

    return {
      totalDomains: domains.length,
      authenticationResults: results,
      averageAuthScore: this.calculateAverageAuthScore(results)
    };
  }

  /**
   * Analyze email authentication for single domain
   */
  async analyzeEmailAuthentication(domain) {
    console.log(`🔐 Analyzing authentication for ${domain}`);

    const authAnalysis = {
      domain: domain,
      authenticationScore: 0,
      spf: { valid: false, record: null, issues: [] },
      dkim: { valid: false, selectors: [], issues: [] },
      dmarc: { valid: false, record: null, policy: null, issues: [] }
    };

    // SPF Record Analysis
    try {
      const txtRecords = await dns.resolveTxt(domain);
      const spfRecord = txtRecords.flat().find(record => record.startsWith('v=spf1'));
      
      if (spfRecord) {
        authAnalysis.spf.record = spfRecord;
        authAnalysis.spf.valid = true;
        authAnalysis.authenticationScore += 25;
      } else {
        authAnalysis.spf.issues.push('No SPF record found');
      }
    } catch (error) {
      authAnalysis.spf.issues.push('SPF lookup failed');
    }

    // DMARC Record Analysis
    try {
      const dmarcRecords = await dns.resolveTxt(`_dmarc.${domain}`);
      const dmarcRecord = dmarcRecords.flat().find(record => record.startsWith('v=DMARC1'));
      
      if (dmarcRecord) {
        authAnalysis.dmarc.record = dmarcRecord;
        authAnalysis.dmarc.valid = true;
        authAnalysis.authenticationScore += 25;
        
        // Extract policy
        const policyMatch = dmarcRecord.match(/p=([^;]+)/);
        if (policyMatch) {
          authAnalysis.dmarc.policy = policyMatch[1];
        }
      } else {
        authAnalysis.dmarc.issues.push('No DMARC record found');
      }
    } catch (error) {
      authAnalysis.dmarc.issues.push('DMARC lookup failed');
    }

    // DKIM Analysis (check common selectors)
    const commonSelectors = ['default', 'google', 'k1', 'key1', 'mail', 'selector1'];
    for (const selector of commonSelectors) {
      try {
        const dkimRecords = await dns.resolveTxt(`${selector}._domainkey.${domain}`);
        if (dkimRecords.length > 0) {
          authAnalysis.dkim.selectors.push(selector);
          authAnalysis.dkim.valid = true;
        }
      } catch (error) {
        // DKIM selector doesn't exist, continue checking others
      }
    }

    if (authAnalysis.dkim.valid) {
      authAnalysis.authenticationScore += 25;
    } else {
      authAnalysis.dkim.issues.push('No DKIM records found for common selectors');
    }

    // Overall authentication health
    if (authAnalysis.authenticationScore >= 75) {
      authAnalysis.authenticationScore += 25; // Bonus for complete setup
    }

    return authAnalysis;
  }

  /**
   * Analyze reputation status
   */
  async analyzeReputationStatus(domains, options) {
    console.log(`🛡️ Analyzing reputation for ${domains.length} domains...`);

    const results = [];

    for (const domain of domains) {
      try {
        const reputationAnalysis = await this.analyzeDomainReputation(domain);
        results.push(reputationAnalysis);

        if (reputationAnalysis.reputationIssues > 0) {
          this.deliverabilityMetrics.reputationIssues++;
        }

      } catch (error) {
        console.error(`Reputation analysis failed for ${domain}:`, error);
        results.push({
          domain: domain,
          error: error.message,
          reputationScore: 50
        });
      }
    }

    return {
      totalDomains: domains.length,
      reputationResults: results,
      averageReputationScore: this.calculateAverageReputationScore(results)
    };
  }

  /**
   * Analyze domain reputation
   */
  async analyzeDomainReputation(domain) {
    const reputationAnalysis = {
      domain: domain,
      reputationScore: 100,
      reputationIssues: 0,
      blacklistStatus: [],
      trustIndicators: [],
      warnings: []
    };

    // Check for common reputation indicators
    const suspiciousPatterns = [
      { pattern: /\d+\.\d+\.\d+\.\d+/, warning: 'IP address as domain may affect reputation' },
      { pattern: /free|temp|disposable/, warning: 'Domain name suggests temporary use' },
      { pattern: /[0-9]{8,}/, warning: 'Long number sequences in domain may appear suspicious' }
    ];

    suspiciousPatterns.forEach(({ pattern, warning }) => {
      if (pattern.test(domain)) {
        reputationAnalysis.reputationScore -= 10;
        reputationAnalysis.reputationIssues++;
        reputationAnalysis.warnings.push(warning);
      }
    });

    // Positive reputation indicators
    const trustIndicators = [
      { pattern: /\.(edu|gov)$/, indicator: 'Educational or government domain' },
      { pattern: /^(www\.)?[a-z]+\.(com|org|net)$/, indicator: 'Standard business domain pattern' }
    ];

    trustIndicators.forEach(({ pattern, indicator }) => {
      if (pattern.test(domain)) {
        reputationAnalysis.reputationScore += 5;
        reputationAnalysis.trustIndicators.push(indicator);
      }
    });

    return reputationAnalysis;
  }

  /**
   * Generate AI-powered deliverability recommendations
   */
  async generateDeliverabilityRecommendations(domainResults, emailResults, authResults, reputationResults) {
    if (!this.config.enableAIAnalysis) {
      return { recommendations: [], analysis: 'AI analysis disabled' };
    }

    console.log('🤖 Generating AI-powered deliverability recommendations...');

    const prompt = `Analyze this email deliverability assessment and provide expert recommendations:

**Domain Analysis Summary:**
- Total domains: ${domainResults.totalDomains}
- Average deliverability score: ${domainResults.averageDeliverabilityScore}
- Common issues: ${domainResults.domainAnalyses.flatMap(d => d.issues).slice(0, 5).join(', ')}

**Email Analysis Summary:**
- Total emails: ${emailResults.totalEmails}
- Valid emails: ${emailResults.validEmails}
- Deliverable emails: ${emailResults.deliverableEmails}
- Validation success rate: ${((emailResults.validEmails / emailResults.totalEmails) * 100).toFixed(1)}%

**Authentication Analysis:**
- Domains with SPF: ${authResults.authenticationResults.filter(a => a.spf?.valid).length}
- Domains with DMARC: ${authResults.authenticationResults.filter(a => a.dmarc?.valid).length}
- Domains with DKIM: ${authResults.authenticationResults.filter(a => a.dkim?.valid).length}

**Reputation Analysis:**
- Average reputation score: ${reputationResults.averageReputationScore}
- Domains with reputation issues: ${reputationResults.reputationResults.filter(r => r.reputationIssues > 0).length}

**Analysis Required:**
1. Identify the most critical deliverability issues
2. Provide specific technical fixes for authentication problems
3. Recommend email list hygiene improvements
4. Suggest domain reputation enhancement strategies
5. Estimate potential deliverability improvements

**Respond with:**
{
  "overallAssessment": {
    "deliverabilityGrade": "A|B|C|D|F",
    "criticalIssues": number,
    "estimatedInboxRate": number,
    "riskLevel": "low|medium|high|critical"
  },
  "priorityRecommendations": [
    {
      "category": "authentication|reputation|list_hygiene|technical",
      "issue": "specific_issue_description",
      "recommendation": "detailed_fix_instructions",
      "impact": "high|medium|low",
      "timeToImplement": "immediate|days|weeks|months",
      "estimatedImprovement": "percentage_improvement"
    }
  ],
  "technicalFixes": [
    {
      "domain": "example.com",
      "fix": "specific_dns_record_to_add",
      "priority": "high|medium|low"
    }
  ],
  "strategicRecommendations": [
    "long_term_strategy_1", "long_term_strategy_2"
  ]
}`;

    try {
      const response = await Promise.race([
        this.claude.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 2000,
          temperature: 0.3,
          messages: [{ role: 'user', content: prompt }]
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Claude API timeout')), 10000)
        )
      ]);

      return JSON.parse(response.content[0].text);
    } catch (error) {
      console.error('AI deliverability analysis failed:', error);
      return {
        overallAssessment: { deliverabilityGrade: 'unknown' },
        priorityRecommendations: [],
        technicalFixes: [],
        strategicRecommendations: []
      };
    }
  }

  /**
   * Validate email format
   */
  validateEmailFormat(email) {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    
    const validation = {
      email: email,
      valid: emailRegex.test(email),
      issues: []
    };

    if (!validation.valid) {
      validation.issues.push('Invalid email format');
    }

    // Additional format checks
    if (email.length > 254) {
      validation.valid = false;
      validation.issues.push('Email address too long');
    }

    const [localPart, domain] = email.split('@');
    if (localPart && localPart.length > 64) {
      validation.valid = false;
      validation.issues.push('Local part too long');
    }

    return validation;
  }

  /**
   * Analyze if email is a role account
   */
  analyzeRoleAccount(email) {
    const roleKeywords = [
      'admin', 'administrator', 'postmaster', 'webmaster', 'hostmaster',
      'noreply', 'no-reply', 'donotreply', 'support', 'help', 'info',
      'contact', 'sales', 'marketing', 'abuse', 'security', 'privacy',
      'legal', 'billing', 'accounts', 'hr', 'jobs', 'careers'
    ];

    const localPart = email.split('@')[0].toLowerCase();
    const isRoleAccount = roleKeywords.some(keyword => localPart.includes(keyword));

    return {
      email: email,
      isRoleAccount: isRoleAccount,
      detectedKeywords: roleKeywords.filter(keyword => localPart.includes(keyword))
    };
  }

  /**
   * Analyze if email is disposable
   */
  analyzeDisposableEmail(email) {
    const disposableDomains = [
      '10minutemail.com', 'guerrillamail.com', 'mailinator.com',
      'tempmail.org', 'yopmail.com', 'throwawaymails.com'
    ];

    const domain = email.split('@')[1].toLowerCase();
    const isDisposable = disposableDomains.includes(domain);

    return {
      email: email,
      isDisposable: isDisposable,
      domain: domain
    };
  }

  /**
   * Generate comprehensive deliverability report
   */
  generateDeliverabilityReport(inputAnalysis, domainResults, emailResults, authResults, reputationResults, aiAnalysis, processingTime) {
    return {
      executiveSummary: {
        totalItemsAnalyzed: inputAnalysis.totalItems,
        overallDeliverabilityScore: this.calculateOverallScore(domainResults, emailResults, authResults, reputationResults),
        deliverabilityGrade: aiAnalysis.overallAssessment?.deliverabilityGrade || 'Unknown',
        criticalIssuesFound: aiAnalysis.overallAssessment?.criticalIssues || 0,
        estimatedInboxRate: aiAnalysis.overallAssessment?.estimatedInboxRate || 0,
        riskLevel: aiAnalysis.overallAssessment?.riskLevel || 'unknown'
      },
      detailedAnalysis: {
        domainHealth: {
          totalDomains: domainResults.totalDomains,
          healthyDomains: domainResults.domainAnalyses.filter(d => d.deliverabilityScore >= 70).length,
          averageScore: domainResults.averageDeliverabilityScore
        },
        emailValidation: {
          totalEmails: emailResults.totalEmails,
          validEmails: emailResults.validEmails,
          deliverableEmails: emailResults.deliverableEmails,
          validationRate: (emailResults.validEmails / emailResults.totalEmails * 100).toFixed(1)
        },
        authentication: {
          domainsWithSPF: authResults.authenticationResults.filter(a => a.spf?.valid).length,
          domainsWithDKIM: authResults.authenticationResults.filter(a => a.dkim?.valid).length,
          domainsWithDMARC: authResults.authenticationResults.filter(a => a.dmarc?.valid).length,
          averageAuthScore: authResults.averageAuthScore
        },
        reputation: {
          averageReputationScore: reputationResults.averageReputationScore,
          domainsWithIssues: reputationResults.reputationResults.filter(r => r.reputationIssues > 0).length
        }
      },
      actionItems: aiAnalysis.priorityRecommendations || [],
      technicalFixes: aiAnalysis.technicalFixes || [],
      strategicRecommendations: aiAnalysis.strategicRecommendations || [],
      reportMetadata: {
        generatedAt: new Date().toISOString(),
        processingTime: processingTime,
        analysisVersion: '1.0'
      }
    };
  }

  // Utility Methods
  calculateAverageScore(results) {
    const scores = results.filter(r => r.deliverabilityScore !== undefined).map(r => r.deliverabilityScore);
    return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  }

  calculateAverageAuthScore(results) {
    const scores = results.filter(r => r.authenticationScore !== undefined).map(r => r.authenticationScore);
    return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  }

  calculateAverageReputationScore(results) {
    const scores = results.filter(r => r.reputationScore !== undefined).map(r => r.reputationScore);
    return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  }

  calculateOverallScore(domainResults, emailResults, authResults, reputationResults) {
    const scores = [
      domainResults.averageDeliverabilityScore || 0,
      (emailResults.validEmails / Math.max(emailResults.totalEmails, 1)) * 100,
      authResults.averageAuthScore || 0,
      reputationResults.averageReputationScore || 0
    ];

    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  updateDeliverabilityMetrics(result) {
    this.deliverabilityMetrics.totalChecksPerformed++;
    this.deliverabilityMetrics.averageCheckTime = 
      (this.deliverabilityMetrics.averageCheckTime + result.processingTime) / 2;
    
    if (result.deliverabilityReport?.executiveSummary?.overallDeliverabilityScore) {
      this.deliverabilityMetrics.deliverabilityScores.push(
        result.deliverabilityReport.executiveSummary.overallDeliverabilityScore
      );
    }
  }

  generateCheckId() {
    return `deliverability_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
  }

  /**
   * Get service health and deliverability metrics
   */
  getServiceHealth() {
    return {
      service: 'DeliverabilityCheckService',
      status: 'healthy',
      metrics: {
        ...this.deliverabilityMetrics,
        domainsAnalyzed: this.deliverabilityMetrics.domainsAnalyzed.size,
        cachedResults: this.deliverabilityCache.size,
        analysisHistory: this.domainAnalysisHistory.size
      },
      capabilities: [
        'domain_dns_analysis',
        'email_validation',
        'authentication_checks',
        'reputation_analysis', 
        'ai_recommendations',
        'batch_processing',
        'deliverability_scoring'
      ],
      providers: {
        hunterEnabled: !!this.config.hunterApiKey,
        neverbounceEnabled: !!this.config.neverbounceApiKey,
        briteverifyEnabled: !!this.config.briteverifyApiKey,
        dnsChecksEnabled: this.config.enableDNSChecks,
        aiAnalysisEnabled: this.config.enableAIAnalysis
      },
      config: this.config
    };
  }
}

module.exports = DeliverabilityCheckService;