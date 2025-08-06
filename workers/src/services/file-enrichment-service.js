/**
 * File Enrichment Service
 * External data enrichment for uploaded CSV files using multiple providers
 */

const { default: Anthropic } = require('@anthropic-ai/sdk');
const axios = require('axios');
const csv = require('csv-parser');
const fs = require('fs');

class FileEnrichmentService {
  constructor(options = {}) {
    this.claude = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    this.config = {
      apolloApiKey: process.env.APOLLO_API_KEY,
      clearbitApiKey: process.env.CLEARBIT_API_KEY,
      hunterApiKey: process.env.HUNTER_API_KEY,
      zoomInfoApiKey: process.env.ZOOMINFO_API_KEY,
      maxEnrichmentRequests: options.maxEnrichmentRequests || 1000,
      enrichmentTimeout: options.enrichmentTimeout || 30000,
      enableAIEnrichment: options.enableAIEnrichment !== false
    };

    // Enrichment tracking
    this.enrichmentCache = new Map();
    this.enrichmentHistory = new Map();
    this.providerPerformance = new Map();

    // Performance metrics
    this.enrichmentMetrics = {
      totalRecordsProcessed: 0,
      successfulEnrichments: 0,
      failedEnrichments: 0,
      averageEnrichmentTime: 0,
      providerUsage: {},
      dataQualityScore: 0
    };

    console.log('🔍 File Enrichment Service initialized');
  }

  /**
   * Enrich uploaded file with external data sources
   * @param {string} filePath - Path to uploaded CSV file
   * @param {Object} enrichmentOptions - Enrichment configuration
   * @returns {Object} Enrichment results
   */
  async enrichFile(filePath, enrichmentOptions = {}) {
    const enrichmentId = this.generateEnrichmentId();
    const startTime = Date.now();

    console.log(`🔍 Starting file enrichment ${enrichmentId}...`);

    try {
      // Step 1: Parse and analyze the uploaded file
      const fileData = await this.parseCSVFile(filePath);
      console.log(`📊 Parsed ${fileData.length} records from file`);

      // Step 2: Analyze data patterns and recommend enrichment strategy
      const enrichmentStrategy = await this.analyzeEnrichmentNeeds(fileData, enrichmentOptions);
      
      // Step 3: Execute enrichment using multiple providers
      const enrichmentResults = await this.executeMultiProviderEnrichment(
        fileData, 
        enrichmentStrategy, 
        enrichmentOptions
      );

      // Step 4: Apply AI-powered data enhancement
      const aiEnhancedResults = await this.applyAIEnrichment(
        enrichmentResults.enrichedRecords,
        enrichmentStrategy
      );

      // Step 5: Generate enriched CSV output
      const outputPath = await this.generateEnrichedFile(
        aiEnhancedResults,
        enrichmentId,
        enrichmentStrategy
      );

      // Step 6: Create enrichment report
      const enrichmentReport = this.generateEnrichmentReport(
        enrichmentResults,
        aiEnhancedResults,
        enrichmentStrategy,
        Date.now() - startTime
      );

      const result = {
        enrichmentId: enrichmentId,
        originalRecords: fileData.length,
        enrichedRecords: aiEnhancedResults.length,
        enrichmentStrategy: enrichmentStrategy,
        enrichmentResults: enrichmentResults,
        outputFilePath: outputPath,
        report: enrichmentReport,
        processingTime: Date.now() - startTime,
        completedAt: new Date().toISOString()
      };

      // Store enrichment history
      this.enrichmentHistory.set(enrichmentId, result);
      this.updateEnrichmentMetrics(result);

      console.log(`✅ File enrichment complete: ${result.enrichedRecords}/${result.originalRecords} records enhanced`);

      return result;

    } catch (error) {
      console.error(`File enrichment failed for ${enrichmentId}:`, error);
      throw new Error(`File enrichment failed: ${error.message}`);
    }
  }

  /**
   * Analyze uploaded data to determine optimal enrichment strategy
   */
  async analyzeEnrichmentNeeds(fileData, options) {
    console.log('🧠 Analyzing data patterns for enrichment strategy...');

    // Identify available fields
    const availableFields = fileData.length > 0 ? Object.keys(fileData[0]) : [];
    
    // Detect data patterns
    const dataAnalysis = {
      totalRecords: fileData.length,
      availableFields: availableFields,
      emailFields: availableFields.filter(f => f.toLowerCase().includes('email')),
      companyFields: availableFields.filter(f => f.toLowerCase().includes('company')),
      nameFields: availableFields.filter(f => f.toLowerCase().includes('name')),
      phoneFields: availableFields.filter(f => f.toLowerCase().includes('phone')),
      missingDataAnalysis: this.analyzeMissingData(fileData)
    };

    const prompt = `As a data enrichment expert, analyze this CSV file and recommend an optimal enrichment strategy:

**Data Analysis:**
${JSON.stringify(dataAnalysis, null, 2)}

**Sample Records (first 3):**
${fileData.slice(0, 3).map(record => JSON.stringify(record, null, 2)).join('\n---\n')}

**Available Enrichment Options:**
${options.sources ? options.sources.join(', ') : 'All available (Apollo, Clearbit, Hunter, ZoomInfo)'}

**Enrichment Requirements:**
1. Identify the best enrichment providers for this dataset
2. Recommend specific fields to enrich
3. Suggest data quality improvements
4. Estimate enrichment success rates
5. Provide cost-effective enrichment approach

**Respond with:**
{
  "recommendedProviders": [
    {
      "provider": "apollo|clearbit|hunter|zoominfo",
      "useCase": "use_case_description",
      "targetFields": ["field1", "field2"],
      "priority": "high|medium|low",
      "estimatedSuccessRate": number,
      "estimatedCost": "cost_estimate"
    }
  ],
  "enrichmentFields": [
    {
      "fieldName": "field_to_enrich",
      "currentCompleteness": number,
      "enrichmentMethod": "provider_lookup|ai_inference|data_fusion",
      "expectedImprovement": number,
      "priority": "high|medium|low"
    }
  ],
  "dataQualityRecommendations": [
    "recommendation1", "recommendation2"
  ],
  "enrichmentStrategy": {
    "primaryApproach": "approach_description",
    "fallbackMethods": ["method1", "method2"],
    "qualityThreshold": number,
    "batchSize": number
  },
  "expectedOutcome": {
    "enrichmentRate": number,
    "qualityScore": number,
    "processingTime": "estimated_time"
  }
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

      const strategy = JSON.parse(response.content[0].text);
      
      // Enhance with available provider configurations
      strategy.availableProviders = this.getAvailableProviders();
      strategy.dataAnalysis = dataAnalysis;
      
      console.log(`🎯 Enrichment strategy: ${strategy.recommendedProviders.length} providers, ${strategy.enrichmentFields.length} fields to enrich`);
      
      return strategy;

    } catch (error) {
      console.error('Enrichment strategy analysis failed:', error);
      
      // Fallback to basic enrichment strategy
      return {
        recommendedProviders: [{ 
          provider: 'apollo', 
          useCase: 'B2B contact enrichment',
          targetFields: ['company', 'title', 'industry'],
          priority: 'high'
        }],
        enrichmentFields: [
          { fieldName: 'company', enrichmentMethod: 'provider_lookup', priority: 'high' },
          { fieldName: 'title', enrichmentMethod: 'provider_lookup', priority: 'medium' }
        ],
        enrichmentStrategy: {
          primaryApproach: 'progressive_enrichment',
          batchSize: 50,
          qualityThreshold: 0.7
        },
        fallbackUsed: true
      };
    }
  }

  /**
   * Execute multi-provider enrichment
   */
  async executeMultiProviderEnrichment(fileData, strategy, options) {
    console.log(`🔍 Executing multi-provider enrichment for ${fileData.length} records...`);

    const enrichmentResults = {
      enrichedRecords: [],
      providerResults: {},
      qualityMetrics: {},
      errors: []
    };

    // Process in batches to respect API limits
    const batchSize = strategy.enrichmentStrategy.batchSize || 50;
    const batches = this.chunkArray(fileData, batchSize);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`📦 Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} records)`);

      const batchResults = await this.processBatch(batch, strategy, options);
      
      enrichmentResults.enrichedRecords.push(...batchResults.enrichedRecords);
      
      // Merge provider results
      Object.keys(batchResults.providerResults).forEach(provider => {
        if (!enrichmentResults.providerResults[provider]) {
          enrichmentResults.providerResults[provider] = {
            successful: 0,
            failed: 0,
            records: []
          };
        }
        enrichmentResults.providerResults[provider].successful += batchResults.providerResults[provider].successful || 0;
        enrichmentResults.providerResults[provider].failed += batchResults.providerResults[provider].failed || 0;
        enrichmentResults.providerResults[provider].records.push(...(batchResults.providerResults[provider].records || []));
      });

      enrichmentResults.errors.push(...batchResults.errors);

      // Rate limiting delay between batches
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Calculate final quality metrics
    enrichmentResults.qualityMetrics = this.calculateQualityMetrics(
      enrichmentResults.enrichedRecords,
      fileData
    );

    console.log(`✅ Multi-provider enrichment complete: ${enrichmentResults.enrichedRecords.length} records processed`);

    return enrichmentResults;
  }

  /**
   * Process individual batch through providers
   */
  async processBatch(batch, strategy, options) {
    const batchResults = {
      enrichedRecords: [],
      providerResults: {},
      errors: []
    };

    // Process each record in the batch
    for (const record of batch) {
      try {
        const enrichedRecord = { ...record };
        
        // Apply each recommended provider
        for (const providerConfig of strategy.recommendedProviders) {
          if (providerConfig.priority === 'high' || options.includeAll) {
            const providerResult = await this.enrichWithProvider(
              record,
              providerConfig,
              strategy
            );

            if (providerResult.success) {
              Object.assign(enrichedRecord, providerResult.enrichedData);
              
              // Track provider performance
              if (!batchResults.providerResults[providerConfig.provider]) {
                batchResults.providerResults[providerConfig.provider] = {
                  successful: 0, failed: 0, records: []
                };
              }
              batchResults.providerResults[providerConfig.provider].successful++;
              batchResults.providerResults[providerConfig.provider].records.push(providerResult);
            } else {
              batchResults.providerResults[providerConfig.provider] = 
                batchResults.providerResults[providerConfig.provider] || { successful: 0, failed: 0, records: [] };
              batchResults.providerResults[providerConfig.provider].failed++;
            }
          }
        }

        batchResults.enrichedRecords.push(enrichedRecord);

      } catch (error) {
        console.error(`Record enrichment failed:`, error);
        batchResults.errors.push({
          record: record,
          error: error.message
        });
        batchResults.enrichedRecords.push(record); // Keep original record
      }
    }

    return batchResults;
  }

  /**
   * Enrich record with specific provider
   */
  async enrichWithProvider(record, providerConfig, strategy) {
    const provider = providerConfig.provider;

    try {
      switch (provider) {
        case 'apollo':
          return await this.enrichWithApollo(record, providerConfig);
        case 'clearbit':
          return await this.enrichWithClearbit(record, providerConfig);
        case 'hunter':
          return await this.enrichWithHunter(record, providerConfig);
        case 'zoominfo':
          return await this.enrichWithZoomInfo(record, providerConfig);
        default:
          return { success: false, error: 'Unknown provider' };
      }
    } catch (error) {
      console.error(`${provider} enrichment failed:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Apollo.io enrichment
   */
  async enrichWithApollo(record, config) {
    if (!this.config.apolloApiKey) {
      return { success: false, error: 'Apollo API key not configured' };
    }

    try {
      const searchParams = this.buildApolloSearchParams(record);
      
      const response = await axios.post('https://api.apollo.io/v1/mixed_people/search', 
        searchParams,
        {
          headers: {
            'Cache-Control': 'no-cache',
            'Content-Type': 'application/json',
            'X-Api-Key': this.config.apolloApiKey
          },
          timeout: this.config.enrichmentTimeout
        }
      );

      if (response.data && response.data.people && response.data.people.length > 0) {
        const person = response.data.people[0];
        
        const enrichedData = {
          apollo_title: person.title,
          apollo_company: person.organization?.name,
          apollo_industry: person.organization?.industry,
          apollo_company_size: person.organization?.estimated_num_employees,
          apollo_linkedin: person.linkedin_url,
          apollo_phone: person.sanitized_phone,
          apollo_email: person.email,
          apollo_confidence: person.organization?.confidence || 0.8
        };

        return {
          success: true,
          enrichedData: enrichedData,
          provider: 'apollo',
          recordsFound: response.data.people.length
        };
      }

      return { success: false, error: 'No results found' };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Clearbit enrichment  
   */
  async enrichWithClearbit(record, config) {
    if (!this.config.clearbitApiKey) {
      return { success: false, error: 'Clearbit API key not configured' };
    }

    try {
      // Person enrichment
      const email = this.extractEmail(record);
      if (!email) {
        return { success: false, error: 'No email found for enrichment' };
      }

      const response = await axios.get(`https://person.clearbit.com/v2/combined/find`, {
        params: { email: email },
        headers: {
          'Authorization': `Bearer ${this.config.clearbitApiKey}`
        },
        timeout: this.config.enrichmentTimeout
      });

      const data = response.data;
      const enrichedData = {};

      if (data.person) {
        enrichedData.clearbit_name = data.person.name?.fullName;
        enrichedData.clearbit_title = data.person.employment?.title;
        enrichedData.clearbit_role = data.person.employment?.role;
        enrichedData.clearbit_seniority = data.person.employment?.seniority;
        enrichedData.clearbit_linkedin = data.person.linkedin?.handle;
        enrichedData.clearbit_location = data.person.location;
      }

      if (data.company) {
        enrichedData.clearbit_company = data.company.name;
        enrichedData.clearbit_domain = data.company.domain;
        enrichedData.clearbit_industry = data.company.category?.industry;
        enrichedData.clearbit_employees = data.company.metrics?.employees;
        enrichedData.clearbit_revenue = data.company.metrics?.annualRevenue;
        enrichedData.clearbit_tech = data.company.tech?.join(', ');
      }

      return {
        success: true,
        enrichedData: enrichedData,
        provider: 'clearbit'
      };

    } catch (error) {
      if (error.response?.status === 404) {
        return { success: false, error: 'Person not found' };
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Hunter.io enrichment
   */
  async enrichWithHunter(record, config) {
    if (!this.config.hunterApiKey) {
      return { success: false, error: 'Hunter API key not configured' };
    }

    try {
      const email = this.extractEmail(record);
      if (!email) {
        return { success: false, error: 'No email found for enrichment' };
      }

      const response = await axios.get('https://api.hunter.io/v2/email-verifier', {
        params: {
          email: email,
          api_key: this.config.hunterApiKey
        },
        timeout: this.config.enrichmentTimeout
      });

      const data = response.data.data;
      
      const enrichedData = {
        hunter_status: data.status,
        hunter_deliverability: data.result,
        hunter_score: data.score,
        hunter_sources: data.sources?.length || 0,
        hunter_domain: data.domain,
        hunter_mx_records: data.mx_records,
        hunter_smtp_server: data.smtp_server,
        hunter_smtp_check: data.smtp_check
      };

      return {
        success: true,
        enrichedData: enrichedData,
        provider: 'hunter'
      };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * ZoomInfo enrichment (placeholder - requires enterprise access)
   */
  async enrichWithZoomInfo(record, config) {
    // ZoomInfo requires enterprise partnership
    return { 
      success: false, 
      error: 'ZoomInfo integration requires enterprise access' 
    };
  }

  /**
   * Apply AI-powered enrichment and data fusion
   */
  async applyAIEnrichment(enrichedRecords, strategy) {
    if (!this.config.enableAIEnrichment) {
      return enrichedRecords;
    }

    console.log('🤖 Applying AI-powered data enhancement...');

    const aiEnhancedRecords = [];

    for (const record of enrichedRecords) {
      try {
        const aiEnhancements = await this.generateAIEnhancements(record, strategy);
        
        const enhancedRecord = {
          ...record,
          ...aiEnhancements.inferredData,
          ai_confidence_score: aiEnhancements.confidenceScore,
          ai_data_quality: aiEnhancements.dataQuality,
          ai_recommendations: aiEnhancements.recommendations
        };

        aiEnhancedRecords.push(enhancedRecord);

      } catch (error) {
        console.error('AI enhancement failed for record:', error);
        aiEnhancedRecords.push(record); // Keep original if AI fails
      }
    }

    console.log(`🤖 AI enhancement complete: ${aiEnhancedRecords.length} records processed`);

    return aiEnhancedRecords;
  }

  /**
   * Generate AI-powered enhancements
   */
  async generateAIEnhancements(record, strategy) {
    const prompt = `As a data expert, analyze this enriched contact record and provide intelligent enhancements:

**Record Data:**
${JSON.stringify(record, null, 2)}

**Enhancement Tasks:**
1. Infer missing data based on available information
2. Standardize and clean existing data
3. Resolve conflicts between provider data
4. Generate confidence scores for each field
5. Recommend data quality improvements

**Respond with:**
{
  "inferredData": {
    "inferred_industry_category": "standardized_industry",
    "inferred_company_size": "size_category",
    "inferred_seniority_level": "junior|mid|senior|executive",
    "inferred_decision_maker": boolean,
    "inferred_contact_quality": "high|medium|low"
  },
  "confidenceScore": number (0-100),
  "dataQuality": {
    "completeness": number (0-100),
    "accuracy": number (0-100),
    "consistency": number (0-100)
  },
  "recommendations": [
    "recommendation1", "recommendation2"
  ]
}`;

    try {
      const response = await this.claude.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 800,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }]
      });

      return JSON.parse(response.content[0].text);
    } catch (error) {
      console.error('AI enhancement generation failed:', error);
      return {
        inferredData: {},
        confidenceScore: 50,
        dataQuality: { completeness: 50, accuracy: 50, consistency: 50 },
        recommendations: []
      };
    }
  }

  /**
   * Generate enriched CSV file
   */
  async generateEnrichedFile(enrichedRecords, enrichmentId, strategy) {
    const outputPath = `/tmp/enriched_${enrichmentId}.csv`;
    
    if (enrichedRecords.length === 0) {
      throw new Error('No records to write to file');
    }

    // Get all unique field names
    const allFields = new Set();
    enrichedRecords.forEach(record => {
      Object.keys(record).forEach(key => allFields.add(key));
    });

    // Create CSV content
    const csvHeader = Array.from(allFields).join(',');
    const csvRows = enrichedRecords.map(record => {
      return Array.from(allFields).map(field => {
        const value = record[field] || '';
        // Escape commas and quotes in CSV
        return typeof value === 'string' && (value.includes(',') || value.includes('"')) 
          ? `"${value.replace(/"/g, '""')}"` 
          : value;
      }).join(',');
    });

    const csvContent = [csvHeader, ...csvRows].join('\n');
    
    // Write file
    fs.writeFileSync(outputPath, csvContent);

    console.log(`📄 Enriched file generated: ${outputPath}`);
    
    return outputPath;
  }

  // Utility Methods
  parseCSVFile(filePath) {
    return new Promise((resolve, reject) => {
      const results = [];
      
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => resolve(results))
        .on('error', reject);
    });
  }

  analyzeMissingData(records) {
    if (records.length === 0) return {};

    const fields = Object.keys(records[0]);
    const analysis = {};

    fields.forEach(field => {
      const missingCount = records.filter(record => 
        !record[field] || record[field] === '' || record[field] === null
      ).length;
      
      analysis[field] = {
        missingCount: missingCount,
        completeness: ((records.length - missingCount) / records.length * 100).toFixed(2)
      };
    });

    return analysis;
  }

  buildApolloSearchParams(record) {
    const params = {};
    
    // Extract name components
    const firstName = this.extractFirstName(record);
    const lastName = this.extractLastName(record);
    
    if (firstName) params.person_titles = [firstName];
    if (lastName) params.q_keywords = lastName;
    
    // Extract company
    const company = this.extractCompany(record);
    if (company) params.organization_names = [company];
    
    // Extract email domain for company search
    const email = this.extractEmail(record);
    if (email && email.includes('@')) {
      const domain = email.split('@')[1];
      if (!params.organization_names) {
        params.organization_names = [domain.replace('.com', '').replace('.', ' ')];
      }
    }

    return params;
  }

  extractEmail(record) {
    const emailFields = ['email', 'email_address', 'work_email', 'business_email'];
    for (const field of emailFields) {
      if (record[field] && record[field].includes('@')) {
        return record[field].trim().toLowerCase();
      }
    }
    
    // Check all fields for email patterns
    for (const [key, value] of Object.entries(record)) {
      if (typeof value === 'string' && value.includes('@') && value.includes('.')) {
        return value.trim().toLowerCase();
      }
    }
    
    return null;
  }

  extractFirstName(record) {
    const nameFields = ['first_name', 'firstname', 'fname', 'given_name'];
    for (const field of nameFields) {
      if (record[field]) return record[field].trim();
    }
    
    // Try to extract from full name
    const fullName = record.name || record.full_name || record.contact_name;
    if (fullName) {
      return fullName.split(' ')[0];
    }
    
    return null;
  }

  extractLastName(record) {
    const nameFields = ['last_name', 'lastname', 'lname', 'family_name', 'surname'];
    for (const field of nameFields) {
      if (record[field]) return record[field].trim();
    }
    
    // Try to extract from full name
    const fullName = record.name || record.full_name || record.contact_name;
    if (fullName && fullName.includes(' ')) {
      const parts = fullName.split(' ');
      return parts[parts.length - 1];
    }
    
    return null;
  }

  extractCompany(record) {
    const companyFields = ['company', 'company_name', 'organization', 'employer', 'business'];
    for (const field of companyFields) {
      if (record[field]) return record[field].trim();
    }
    
    return null;
  }

  getAvailableProviders() {
    const available = [];
    
    if (this.config.apolloApiKey) available.push('apollo');
    if (this.config.clearbitApiKey) available.push('clearbit');
    if (this.config.hunterApiKey) available.push('hunter');
    if (this.config.zoomInfoApiKey) available.push('zoominfo');
    
    return available;
  }

  calculateQualityMetrics(enrichedRecords, originalRecords) {
    const metrics = {
      enrichmentRate: 0,
      dataCompleteness: 0,
      qualityScore: 0,
      fieldsAdded: 0
    };

    if (enrichedRecords.length === 0) return metrics;

    // Calculate average field completeness
    const originalFieldCount = originalRecords.length > 0 ? Object.keys(originalRecords[0]).length : 0;
    const enrichedFieldCount = Object.keys(enrichedRecords[0]).length;
    
    metrics.fieldsAdded = enrichedFieldCount - originalFieldCount;
    metrics.enrichmentRate = enrichedRecords.length / originalRecords.length * 100;
    
    // Calculate data completeness
    let totalCompleteness = 0;
    enrichedRecords.forEach(record => {
      const filledFields = Object.values(record).filter(value => 
        value !== null && value !== undefined && value !== ''
      ).length;
      totalCompleteness += filledFields / Object.keys(record).length * 100;
    });
    
    metrics.dataCompleteness = totalCompleteness / enrichedRecords.length;
    metrics.qualityScore = (metrics.enrichmentRate + metrics.dataCompleteness) / 2;

    return metrics;
  }

  generateEnrichmentReport(enrichmentResults, aiResults, strategy, processingTime) {
    return {
      summary: {
        totalRecords: enrichmentResults.enrichedRecords.length,
        enrichmentRate: enrichmentResults.qualityMetrics.enrichmentRate,
        qualityScore: enrichmentResults.qualityMetrics.qualityScore,
        processingTime: processingTime
      },
      providerPerformance: enrichmentResults.providerResults,
      qualityMetrics: enrichmentResults.qualityMetrics,
      aiEnhancements: {
        recordsProcessed: aiResults.length,
        averageConfidence: this.calculateAverageConfidence(aiResults)
      },
      recommendations: strategy.dataQualityRecommendations || [],
      errors: enrichmentResults.errors.length
    };
  }

  calculateAverageConfidence(records) {
    if (records.length === 0) return 0;
    
    const confidenceScores = records
      .filter(r => r.ai_confidence_score)
      .map(r => r.ai_confidence_score);
    
    return confidenceScores.length > 0 
      ? confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length 
      : 0;
  }

  chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  updateEnrichmentMetrics(result) {
    this.enrichmentMetrics.totalRecordsProcessed += result.originalRecords;
    this.enrichmentMetrics.successfulEnrichments += result.enrichedRecords;
    this.enrichmentMetrics.averageEnrichmentTime = 
      (this.enrichmentMetrics.averageEnrichmentTime + result.processingTime) / 2;
    this.enrichmentMetrics.dataQualityScore = result.report.qualityMetrics.qualityScore;
  }

  generateEnrichmentId() {
    return `enrich_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
  }

  /**
   * Get service health and enrichment metrics
   */
  getServiceHealth() {
    return {
      service: 'FileEnrichmentService',
      status: 'healthy',
      metrics: this.enrichmentMetrics,
      availableProviders: this.getAvailableProviders(),
      capabilities: [
        'multi_provider_enrichment',
        'ai_data_fusion',
        'quality_scoring',
        'batch_processing',
        'data_validation',
        'conflict_resolution'
      ],
      config: {
        maxEnrichmentRequests: this.config.maxEnrichmentRequests,
        enableAIEnrichment: this.config.enableAIEnrichment
      }
    };
  }
}

module.exports = FileEnrichmentService;