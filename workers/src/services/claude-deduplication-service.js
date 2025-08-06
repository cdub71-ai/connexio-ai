/**
 * Claude-Powered Deduplication Service
 * Intelligent duplicate detection and merge strategies for marketing automation
 * Integrated into all Connexio AI data quality workflows
 */

const { default: Anthropic } = require('@anthropic-ai/sdk');

class ClaudeDeduplicationService {
  constructor(apiKey) {
    this.claude = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Analyze dataset for deduplication patterns and strategy
   * @param {Array} records - Sample records for analysis
   * @param {Object} context - Platform and use case context
   * @returns {Object} Analysis and recommended strategy
   */
  async analyzeDatasetPatterns(records, context = {}) {
    const sampleRecords = records.slice(0, 10); // Analyze first 10 records
    
    const prompt = `As a marketing operations expert, analyze this dataset for deduplication patterns:

**Sample Records:**
${JSON.stringify(sampleRecords, null, 2)}

**Context:**
- Platform: ${context.platform || 'unknown'}
- Use Case: ${context.useCase || 'general'}
- Record Count: ${records.length}

**Analysis Required:**
1. What fields are most reliable for duplicate matching?
2. What data quality issues/variations do you see?
3. What matching strategy would work best?
4. Are there platform-specific considerations?
5. What edge cases should we watch for?

**Respond with:**
{
  "primaryMatchingFields": ["field1", "field2"],
  "secondaryMatchingFields": ["field3", "field4"], 
  "dataQualityIssues": ["issue1", "issue2"],
  "recommendedStrategy": "detailed strategy description",
  "confidenceThresholds": {
    "exact": 95,
    "high": 85,
    "medium": 70
  },
  "platformConsiderations": ["consideration1", "consideration2"],
  "edgeCases": ["case1", "case2"]
}`;

    try {
      const response = await this.claude.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
        temperature: 0.1,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      return JSON.parse(response.content[0].text);
    } catch (error) {
      console.error('Dataset analysis failed:', error);
      return this._getDefaultAnalysis(context);
    }
  }

  /**
   * Intelligent duplicate detection between two records
   * @param {Object} record1 - First record
   * @param {Object} record2 - Second record 
   * @param {Object} context - Matching context
   * @returns {Object} Duplicate analysis result
   */
  async identifyDuplicates(record1, record2, context = {}) {
    const prompt = `As a marketing operations expert with deep experience in data quality, determine if these records represent the same person:

**Record 1:**
${JSON.stringify(record1, null, 2)}

**Record 2:**  
${JSON.stringify(record2, null, 2)}

**Context:**
- Platform: ${context.platform || 'unknown'}
- Use Case: ${context.useCase || 'general'}
- Previous Analysis: ${JSON.stringify(context.analysis) || 'none'}

**Consider marketing automation best practices:**
- Email variations (+, ., subdomain changes)
- Name variations (nicknames, initials, middle names, order)
- Company name variations (Inc, LLC, Corp, abbreviations)
- Phone formatting differences (spaces, dashes, country codes)
- Address normalization issues
- Data entry inconsistencies

**Respond with:**
{
  "isDuplicate": boolean,
  "confidence": number (0-100),
  "reasoning": "detailed explanation of decision",
  "matchingFields": ["field1", "field2"],
  "conflictingFields": ["field3", "field4"],
  "preferredRecord": 1 or 2,
  "riskFactors": ["risk1", "risk2"]
}`;

    try {
      const response = await this.claude.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 800,
        temperature: 0.1,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      return JSON.parse(response.content[0].text);
    } catch (error) {
      console.error('Duplicate detection failed:', error);
      return this._getDefaultDuplicateResult(record1, record2);
    }
  }

  /**
   * Generate intelligent merge strategy for duplicate records
   * @param {Array} duplicateGroup - Group of duplicate records
   * @param {Object} context - Merge context
   * @returns {Object} Merge strategy
   */
  async generateMergeStrategy(duplicateGroup, context = {}) {
    const prompt = `As a marketing operations expert, create an optimal merge strategy for these duplicate records:

**Duplicate Records:**
${JSON.stringify(duplicateGroup, null, 2)}

**Context:**
- Platform: ${context.platform || 'unknown'} 
- Use Case: ${context.useCase || 'general'}
- Business Priority: ${context.priority || 'data completeness'}

**Consider these merge principles:**
1. **Completeness**: Prefer records with more complete data
2. **Recency**: Newer data often more accurate
3. **Source Reliability**: Some sources more trustworthy
4. **Engagement Data**: Preserve email engagement history
5. **Validation Status**: Keep validated email/phone data
6. **Platform Best Practices**: Follow ${context.platform} conventions

**Respond with:**
{
  "masterRecord": {record with merged data},
  "mergeLogic": {
    "field1": "strategy for field1",
    "field2": "strategy for field2"
  },
  "preservedData": ["data1", "data2"],
  "discardedRecords": [record_ids],
  "confidenceScore": number (0-100),
  "warnings": ["warning1", "warning2"],
  "auditTrail": "merge reasoning and decisions"
}`;

    try {
      const response = await this.claude.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1200,
        temperature: 0.1,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      return JSON.parse(response.content[0].text);
    } catch (error) {
      console.error('Merge strategy generation failed:', error);
      return this._getDefaultMergeStrategy(duplicateGroup);
    }
  }

  /**
   * Batch deduplication for large datasets
   * @param {Array} records - All records to deduplicate
   * @param {Object} options - Processing options
   * @returns {Object} Deduplication results
   */
  async batchDeduplicate(records, options = {}) {
    const results = {
      totalRecords: records.length,
      duplicateGroups: [],
      uniqueRecords: [],
      mergedRecords: [],
      processingLog: [],
      stats: {
        duplicatesFound: 0,
        recordsMerged: 0,
        dataQualityScore: 0
      }
    };

    try {
      // Step 1: Analyze dataset patterns
      console.log('🔍 Analyzing dataset patterns...');
      const analysis = await this.analyzeDatasetPatterns(records, options.context);
      results.processingLog.push('Dataset analysis completed');

      // Step 2: Group potential duplicates using primary fields
      console.log('👥 Grouping potential duplicates...');
      const potentialGroups = this._groupByPrimaryFields(records, analysis.primaryMatchingFields);
      results.processingLog.push(`Found ${potentialGroups.length} potential duplicate groups`);

      // Step 3: Claude analysis for each group
      console.log('🧠 Analyzing duplicate groups with Claude...');
      for (const group of potentialGroups) {
        if (group.length > 1) {
          const duplicateAnalysis = await this._analyzeDuplicateGroup(group, {
            ...options.context,
            analysis
          });
          
          if (duplicateAnalysis.isDuplicateGroup) {
            results.duplicateGroups.push({
              records: group,
              analysis: duplicateAnalysis
            });
            results.stats.duplicatesFound += group.length - 1;
          } else {
            results.uniqueRecords.push(...group);
          }
        } else {
          results.uniqueRecords.push(...group);
        }
      }

      // Step 4: Generate merge strategies
      console.log('🔄 Generating merge strategies...');
      for (const duplicateGroup of results.duplicateGroups) {
        const mergeStrategy = await this.generateMergeStrategy(
          duplicateGroup.records,
          options.context
        );
        
        results.mergedRecords.push({
          masterRecord: mergeStrategy.masterRecord,
          originalRecords: duplicateGroup.records,
          mergeStrategy: mergeStrategy
        });
        results.stats.recordsMerged++;
      }

      // Step 5: Calculate final stats
      results.stats.dataQualityScore = this._calculateDataQualityScore(results);
      results.processingLog.push('Batch deduplication completed');

      return results;

    } catch (error) {
      console.error('Batch deduplication failed:', error);
      results.processingLog.push(`Error: ${error.message}`);
      return results;
    }
  }

  /**
   * HubSpot-specific deduplication
   * @param {Object} contact - HubSpot contact
   * @param {Array} existingContacts - Existing contacts to check against
   * @returns {Object} HubSpot deduplication result
   */
  async hubspotDeduplication(contact, existingContacts = []) {
    const context = {
      platform: 'hubspot',
      useCase: 'webhook_enrichment',
      priority: 'data completeness'
    };

    // Check against existing contacts
    const duplicateResults = [];
    for (const existing of existingContacts) {
      const analysis = await this.identifyDuplicates(contact, existing, context);
      if (analysis.isDuplicate && analysis.confidence > 85) {
        duplicateResults.push({
          existingContact: existing,
          analysis: analysis
        });
      }
    }

    if (duplicateResults.length > 0) {
      // Generate merge strategy
      const allRecords = [contact, ...duplicateResults.map(r => r.existingContact)];
      const mergeStrategy = await this.generateMergeStrategy(allRecords, context);
      
      return {
        hasDuplicates: true,
        duplicateCount: duplicateResults.length,
        duplicates: duplicateResults,
        mergeStrategy: mergeStrategy,
        recommendedAction: 'merge_before_enrichment'
      };
    }

    return {
      hasDuplicates: false,
      recommendedAction: 'proceed_with_enrichment'
    };
  }

  /**
   * Eloqua-specific batch deduplication
   * @param {Array} contacts - Eloqua contacts
   * @param {Object} fieldMapping - Eloqua field mapping
   * @returns {Object} Eloqua deduplication result
   */
  async eloquaBatchDeduplication(contacts, fieldMapping = {}) {
    const context = {
      platform: 'eloqua',
      useCase: 'batch_validation',
      priority: 'engagement preservation',
      fieldMapping: fieldMapping
    };

    return await this.batchDeduplicate(contacts, { context });
  }

  // Private helper methods
  _groupByPrimaryFields(records, primaryFields) {
    const groups = new Map();
    
    for (const record of records) {
      const key = primaryFields.map(field => {
        const value = record[field];
        return value ? value.toString().toLowerCase().trim() : '';
      }).join('|');
      
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(record);
    }
    
    return Array.from(groups.values());
  }

  async _analyzeDuplicateGroup(group, context) {
    if (group.length < 2) return { isDuplicateGroup: false };
    
    // Compare first two records as representative
    const analysis = await this.identifyDuplicates(group[0], group[1], context);
    
    return {
      isDuplicateGroup: analysis.isDuplicate && analysis.confidence > 80,
      confidence: analysis.confidence,
      reasoning: analysis.reasoning
    };
  }

  _calculateDataQualityScore(results) {
    const totalRecords = results.totalRecords;
    const duplicatesFound = results.stats.duplicatesFound;
    const recordsMerged = results.stats.recordsMerged;
    
    // Higher score = better data quality (fewer duplicates)
    const duplicateRatio = duplicatesFound / totalRecords;
    const mergeSuccessRatio = recordsMerged / Math.max(results.duplicateGroups.length, 1);
    
    return Math.round((1 - duplicateRatio) * 80 + mergeSuccessRatio * 20);
  }

  _getDefaultAnalysis(context) {
    return {
      primaryMatchingFields: ['email'],
      secondaryMatchingFields: ['phone', 'firstName', 'lastName'],
      dataQualityIssues: ['formatting_inconsistencies'],
      recommendedStrategy: 'email_primary_matching',
      confidenceThresholds: { exact: 95, high: 85, medium: 70 },
      platformConsiderations: [`${context.platform}_specific_handling`],
      edgeCases: ['email_variations', 'name_variations']
    };
  }

  _getDefaultDuplicateResult(record1, record2) {
    const email1 = record1.email || record1.emailAddress || '';
    const email2 = record2.email || record2.emailAddress || '';
    
    return {
      isDuplicate: email1.toLowerCase() === email2.toLowerCase() && email1 !== '',
      confidence: email1.toLowerCase() === email2.toLowerCase() ? 95 : 0,
      reasoning: 'Exact email match',
      matchingFields: email1 === email2 ? ['email'] : [],
      conflictingFields: [],
      preferredRecord: 1,
      riskFactors: []
    };
  }

  _getDefaultMergeStrategy(duplicateGroup) {
    return {
      masterRecord: duplicateGroup[0],
      mergeLogic: { email: 'use_most_complete' },
      preservedData: ['email', 'phone'],
      discardedRecords: duplicateGroup.slice(1).map((r, i) => i + 1),
      confidenceScore: 70,
      warnings: ['using_default_strategy'],
      auditTrail: 'Default merge strategy applied due to AI service unavailability'
    };
  }
}

module.exports = ClaudeDeduplicationService;