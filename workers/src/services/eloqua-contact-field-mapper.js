/**
 * Eloqua Contact Field Mapping Service
 * Advanced field mapping and data transformation utilities
 */

const { default: Anthropic } = require('@anthropic-ai/sdk');

class EloquaContactFieldMapper {
  constructor(options = {}) {
    this.claude = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    this.config = {
      eloquaBaseUrl: process.env.ELOQUA_BASE_URL || 'https://secure.p01.eloqua.com',
      cacheTimeout: options.cacheTimeout || 3600000, // 1 hour
      enableAIMapping: options.enableAIMapping !== false,
      maxMappingAttempts: options.maxMappingAttempts || 3
    };

    // Field mapping cache and utilities
    this.fieldCache = new Map();
    this.mappingTemplates = new Map();
    this.transformationRules = new Map();
    
    // Common field patterns for intelligent matching
    this.fieldPatterns = {
      mobile: /^(mobile|cell|phone|sms|text).*number$/i,
      email: /^(email|e-mail).*address$/i,
      optOut: /^(opt.out|unsubscrib|do.not|sms.opt)$/i,
      country: /^(country|nation|locale).*code$/i,
      firstName: /^(first|given).*name$/i,
      lastName: /^(last|family|sur).*name$/i,
      company: /^(company|organization|org).*name$/i
    };

    console.log('🗂️ Eloqua Contact Field Mapper initialized');
  }

  /**
   * Auto-map Eloqua fields to standard marketing fields
   * @param {Array} eloquaFields - Raw Eloqua contact fields
   * @param {Object} mappingHints - Manual mapping hints
   * @returns {Object} Intelligent field mappings
   */
  async intelligentFieldMapping(eloquaFields, mappingHints = {}) {
    console.log(`🧠 Performing intelligent mapping of ${eloquaFields.length} Eloqua fields...`);

    try {
      // Step 1: Apply pattern-based matching
      const patternMappings = this.applyPatternMatching(eloquaFields);
      
      // Step 2: Use AI to enhance mappings
      const aiEnhancedMappings = await this.enhanceMappingsWithAI(
        eloquaFields, 
        patternMappings, 
        mappingHints
      );
      
      // Step 3: Validate and score mapping confidence
      const validatedMappings = this.validateMappings(eloquaFields, aiEnhancedMappings);
      
      // Step 4: Generate mapping recommendations
      const recommendations = await this.generateMappingRecommendations(
        eloquaFields, 
        validatedMappings
      );

      const result = {
        mappings: validatedMappings,
        recommendations: recommendations,
        confidence: this.calculateMappingConfidence(validatedMappings),
        unmappedFields: this.identifyUnmappedFields(eloquaFields, validatedMappings),
        generatedAt: new Date().toISOString()
      };

      // Cache successful mappings
      this.cacheFieldMappings(eloquaFields, result);

      console.log(`✅ Intelligent field mapping complete: ${Object.keys(validatedMappings.core).length} core fields mapped`);
      
      return result;

    } catch (error) {
      console.error('Intelligent field mapping failed:', error);
      throw new Error(`Field mapping failed: ${error.message}`);
    }
  }

  /**
   * Apply pattern-based field matching
   */
  applyPatternMatching(eloquaFields) {
    const mappings = {
      core: {},
      extended: [],
      custom: []
    };

    eloquaFields.forEach(field => {
      const fieldName = field.name.toLowerCase();
      const displayName = field.displayName.toLowerCase();
      
      // Check against standard patterns
      for (const [patternName, pattern] of Object.entries(this.fieldPatterns)) {
        if (pattern.test(fieldName) || pattern.test(displayName)) {
          mappings.core[patternName] = {
            field: field,
            confidence: 0.8,
            matchType: 'pattern',
            matchedPattern: patternName
          };
          return; // Found match, move to next field
        }
      }

      // Check for common variations
      const variations = this.checkFieldVariations(field);
      if (variations.length > 0) {
        mappings.extended.push({
          field: field,
          possibleMappings: variations,
          confidence: 0.6,
          matchType: 'variation'
        });
      } else {
        mappings.custom.push({
          field: field,
          confidence: 0.3,
          matchType: 'unknown'
        });
      }
    });

    console.log(`📋 Pattern matching: ${Object.keys(mappings.core).length} core, ${mappings.extended.length} extended, ${mappings.custom.length} custom fields`);
    
    return mappings;
  }

  /**
   * Enhance mappings using AI analysis
   */
  async enhanceMappingsWithAI(eloquaFields, patternMappings, mappingHints) {
    if (!this.config.enableAIMapping) {
      return patternMappings;
    }

    const prompt = `As a marketing operations expert, analyze these Eloqua contact fields and enhance the field mappings:

**Available Eloqua Fields:**
${eloquaFields.slice(0, 20).map(f => `- ${f.name} (${f.displayName}) - ${f.dataType}`).join('\n')}

**Current Pattern Mappings:**
${JSON.stringify(patternMappings.core, null, 2)}

**Manual Mapping Hints:**
${JSON.stringify(mappingHints, null, 2)}

**Extended/Uncertain Fields:**
${patternMappings.extended.map(e => `- ${e.field.name} (${e.field.displayName})`).join('\n')}

**Mapping Requirements:**
1. Mobile/Phone number field for SMS
2. SMS opt-out status field
3. Country code for international SMS
4. Email address for multi-channel campaigns
5. First/Last name for personalization
6. Company name for B2B campaigns

**Analysis Required:**
1. Validate current core mappings
2. Resolve uncertain extended field mappings
3. Identify missing required fields
4. Suggest alternative field combinations
5. Recommend field transformations needed

**Respond with:**
{
  "enhancedMappings": {
    "core": {
      "mobile": {"fieldId": "field_id", "fieldName": "field_name", "confidence": number, "reasoning": "why_this_field"},
      "email": {"fieldId": "field_id", "fieldName": "field_name", "confidence": number, "reasoning": "reasoning"},
      "optOut": {"fieldId": "field_id", "fieldName": "field_name", "confidence": number, "reasoning": "reasoning"},
      "country": {"fieldId": "field_id", "fieldName": "field_name", "confidence": number, "reasoning": "reasoning"},
      "firstName": {"fieldId": "field_id", "fieldName": "field_name", "confidence": number, "reasoning": "reasoning"},
      "lastName": {"fieldId": "field_id", "fieldName": "field_name", "confidence": number, "reasoning": "reasoning"}
    },
    "personalization": [
      {"fieldId": "field_id", "fieldName": "field_name", "useCase": "merge_field_description", "confidence": number}
    ]
  },
  "transformationNeeded": [
    {"fieldName": "field_name", "currentFormat": "format", "requiredFormat": "format", "transformation": "description"}
  ],
  "missingFields": [
    {"requiredField": "field_type", "impact": "high|medium|low", "alternatives": ["alt1", "alt2"]}
  ],
  "confidenceScore": number (1-100)
}`;

    try {
      const response = await this.claude.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1500,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }]
      });

      const aiAnalysis = JSON.parse(response.content[0].text);
      
      // Merge AI enhancements with pattern mappings
      const enhancedMappings = this.mergeAIMappings(patternMappings, aiAnalysis);
      
      console.log(`🧠 AI enhanced mappings with ${aiAnalysis.confidenceScore}% confidence`);
      
      return enhancedMappings;

    } catch (error) {
      console.warn('AI mapping enhancement failed, using pattern mappings:', error);
      return patternMappings;
    }
  }

  /**
   * Validate field mappings and check data compatibility
   */
  validateMappings(eloquaFields, mappings) {
    const validatedMappings = { ...mappings };

    // Validate core field mappings
    Object.keys(validatedMappings.core).forEach(mappingType => {
      const mapping = validatedMappings.core[mappingType];
      if (mapping && mapping.field) {
        // Check data type compatibility
        const isCompatible = this.validateDataTypeCompatibility(mappingType, mapping.field);
        mapping.dataTypeCompatible = isCompatible;
        
        if (!isCompatible) {
          mapping.confidence *= 0.7; // Reduce confidence for incompatible types
          mapping.warnings = [`Data type ${mapping.field.dataType} may not be compatible with ${mappingType}`];
        }
      }
    });

    // Validate required fields exist
    const requiredFields = ['mobile', 'optOut'];
    const missingRequired = requiredFields.filter(field => 
      !validatedMappings.core[field] || validatedMappings.core[field].confidence < 0.5
    );

    if (missingRequired.length > 0) {
      validatedMappings.validationWarnings = [
        `Missing or low-confidence mappings for required fields: ${missingRequired.join(', ')}`
      ];
    }

    return validatedMappings;
  }

  /**
   * Generate field mapping recommendations
   */
  async generateMappingRecommendations(eloquaFields, mappings) {
    const recommendations = [];

    // Check for missing required fields
    if (!mappings.core.mobile || mappings.core.mobile.confidence < 0.7) {
      recommendations.push({
        type: 'missing_required',
        priority: 'high',
        message: 'Mobile number field mapping is required for SMS campaigns',
        suggestions: this.findPotentialMobileFields(eloquaFields)
      });
    }

    if (!mappings.core.optOut || mappings.core.optOut.confidence < 0.7) {
      recommendations.push({
        type: 'missing_compliance',
        priority: 'high', 
        message: 'SMS opt-out field mapping is required for compliance',
        suggestions: this.findPotentialOptOutFields(eloquaFields)
      });
    }

    // Check for data transformation needs
    if (mappings.core.mobile && mappings.core.mobile.field.dataType !== 'text') {
      recommendations.push({
        type: 'data_transformation',
        priority: 'medium',
        message: 'Mobile number field may need formatting transformation',
        transformation: 'Convert to standard phone number format'
      });
    }

    // Recommend additional personalization fields
    const personalizationFields = eloquaFields.filter(f => 
      this.isPersonalizationField(f) && !this.isFieldMapped(f, mappings)
    );

    if (personalizationFields.length > 0) {
      recommendations.push({
        type: 'personalization_opportunity',
        priority: 'low',
        message: 'Additional fields available for message personalization',
        fields: personalizationFields.slice(0, 5).map(f => ({
          name: f.name,
          displayName: f.displayName,
          useCase: this.suggestPersonalizationUseCase(f)
        }))
      });
    }

    return recommendations;
  }

  /**
   * Create field transformation rules
   * @param {Object} mappings - Validated field mappings
   * @returns {Object} Transformation rules
   */
  createTransformationRules(mappings) {
    const rules = {
      mobile: null,
      optOut: null,
      country: null,
      personalization: []
    };

    // Mobile number transformation
    if (mappings.core.mobile) {
      rules.mobile = {
        fieldId: mappings.core.mobile.field.id,
        fieldName: mappings.core.mobile.field.name,
        transformations: [
          'remove_non_digits',
          'add_country_code_if_missing',
          'format_e164'
        ]
      };
    }

    // Opt-out transformation
    if (mappings.core.optOut) {
      rules.optOut = {
        fieldId: mappings.core.optOut.field.id,
        fieldName: mappings.core.optOut.field.name,
        transformations: [
          'normalize_boolean_values',
          'default_false_if_empty'
        ]
      };
    }

    // Country code transformation
    if (mappings.core.country) {
      rules.country = {
        fieldId: mappings.core.country.field.id,
        fieldName: mappings.core.country.field.name,
        transformations: [
          'convert_to_country_code',
          'default_us_if_empty'
        ]
      };
    }

    // Personalization field transformations
    if (mappings.personalization) {
      mappings.personalization.forEach(field => {
        rules.personalization.push({
          fieldId: field.fieldId,
          fieldName: field.fieldName,
          mergeToken: `[[${field.fieldName}]]`,
          transformations: ['trim_whitespace', 'capitalize_if_name']
        });
      });
    }

    return rules;
  }

  /**
   * Apply field transformations to contact data
   * @param {Object} contactData - Raw contact data from Eloqua
   * @param {Object} transformationRules - Transformation rules
   * @returns {Object} Transformed contact data
   */
  applyFieldTransformations(contactData, transformationRules) {
    const transformedData = {
      contactId: contactData.id,
      mobile: null,
      smsOptOut: false,
      countryCode: '+1', // Default
      mergeFields: {}
    };

    // Transform mobile number
    if (transformationRules.mobile && contactData.fieldValues) {
      const mobileField = contactData.fieldValues.find(fv => 
        fv.id === transformationRules.mobile.fieldId.toString()
      );
      
      if (mobileField && mobileField.value) {
        transformedData.mobile = this.transformMobileNumber(
          mobileField.value, 
          transformationRules.mobile.transformations
        );
      }
    }

    // Transform opt-out status
    if (transformationRules.optOut && contactData.fieldValues) {
      const optOutField = contactData.fieldValues.find(fv => 
        fv.id === transformationRules.optOut.fieldId.toString()
      );
      
      if (optOutField) {
        transformedData.smsOptOut = this.transformOptOutValue(
          optOutField.value, 
          transformationRules.optOut.transformations
        );
      }
    }

    // Transform country code
    if (transformationRules.country && contactData.fieldValues) {
      const countryField = contactData.fieldValues.find(fv => 
        fv.id === transformationRules.country.fieldId.toString()
      );
      
      if (countryField && countryField.value) {
        transformedData.countryCode = this.transformCountryCode(
          countryField.value,
          transformationRules.country.transformations
        );
      }
    }

    // Transform personalization fields
    transformationRules.personalization.forEach(rule => {
      const field = contactData.fieldValues?.find(fv => 
        fv.id === rule.fieldId.toString()
      );
      
      if (field && field.value) {
        transformedData.mergeFields[rule.fieldName] = this.transformPersonalizationField(
          field.value,
          rule.transformations
        );
      }
    });

    return transformedData;
  }

  /**
   * Get cached field mappings or create new ones
   */
  async getCachedOrCreateMappings(eloquaFields, mappingHints = {}) {
    const cacheKey = this.generateMappingCacheKey(eloquaFields);
    
    if (this.fieldCache.has(cacheKey)) {
      const cached = this.fieldCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.config.cacheTimeout) {
        console.log('📋 Using cached field mappings');
        return cached.mappings;
      }
    }

    const mappings = await this.intelligentFieldMapping(eloquaFields, mappingHints);
    this.cacheFieldMappings(eloquaFields, mappings);
    
    return mappings;
  }

  // Utility Methods
  checkFieldVariations(field) {
    const variations = [];
    const fieldName = field.name.toLowerCase();
    const displayName = field.displayName.toLowerCase();

    // Check for phone number variations
    if (fieldName.includes('phone') || displayName.includes('phone')) {
      variations.push('mobile');
    }

    // Check for email variations  
    if (fieldName.includes('email') || displayName.includes('email')) {
      variations.push('email');
    }

    // Check for name variations
    if (fieldName.includes('name') || displayName.includes('name')) {
      if (fieldName.includes('first') || displayName.includes('first')) {
        variations.push('firstName');
      } else if (fieldName.includes('last') || displayName.includes('last')) {
        variations.push('lastName');
      }
    }

    return variations;
  }

  validateDataTypeCompatibility(mappingType, field) {
    const compatibilityMap = {
      mobile: ['text', 'string', 'phone'],
      email: ['text', 'string', 'email'],
      optOut: ['boolean', 'text', 'string', 'checkbox'],
      country: ['text', 'string'],
      firstName: ['text', 'string'],
      lastName: ['text', 'string']
    };

    const allowedTypes = compatibilityMap[mappingType] || ['text', 'string'];
    return allowedTypes.includes(field.dataType.toLowerCase());
  }

  findPotentialMobileFields(eloquaFields) {
    return eloquaFields.filter(f => 
      f.name.toLowerCase().includes('phone') || 
      f.name.toLowerCase().includes('mobile') ||
      f.displayName.toLowerCase().includes('phone') ||
      f.displayName.toLowerCase().includes('mobile')
    ).map(f => ({ id: f.id, name: f.name, displayName: f.displayName }));
  }

  findPotentialOptOutFields(eloquaFields) {
    return eloquaFields.filter(f => 
      f.name.toLowerCase().includes('opt') || 
      f.name.toLowerCase().includes('unsubscrib') ||
      f.displayName.toLowerCase().includes('opt') ||
      f.displayName.toLowerCase().includes('unsubscrib')
    ).map(f => ({ id: f.id, name: f.name, displayName: f.displayName }));
  }

  isPersonalizationField(field) {
    const personalizationPatterns = [
      /name/i, /company/i, /title/i, /industry/i, /location/i, /city/i, /state/i
    ];
    
    return personalizationPatterns.some(pattern => 
      pattern.test(field.name) || pattern.test(field.displayName)
    );
  }

  isFieldMapped(field, mappings) {
    const coreFields = Object.values(mappings.core);
    const personalFields = mappings.personalization || [];
    
    return coreFields.some(m => m.field?.id === field.id) ||
           personalFields.some(p => p.fieldId === field.id);
  }

  suggestPersonalizationUseCase(field) {
    const fieldName = field.name.toLowerCase();
    
    if (fieldName.includes('name')) return 'Personal greeting';
    if (fieldName.includes('company')) return 'Company reference';
    if (fieldName.includes('title')) return 'Professional context';
    if (fieldName.includes('location')) return 'Location-based content';
    
    return 'Message personalization';
  }

  transformMobileNumber(value, transformations) {
    let mobile = value.toString();
    
    if (transformations.includes('remove_non_digits')) {
      mobile = mobile.replace(/\D/g, '');
    }
    
    if (transformations.includes('add_country_code_if_missing')) {
      if (!mobile.startsWith('1') && mobile.length === 10) {
        mobile = '1' + mobile;
      }
    }
    
    if (transformations.includes('format_e164')) {
      mobile = '+' + mobile;
    }
    
    return mobile;
  }

  transformOptOutValue(value, transformations) {
    let optOut = value;
    
    if (transformations.includes('normalize_boolean_values')) {
      if (typeof optOut === 'string') {
        optOut = optOut.toLowerCase();
        optOut = ['true', '1', 'yes', 'y', 'opt-out', 'unsubscribed'].includes(optOut);
      }
    }
    
    if (transformations.includes('default_false_if_empty')) {
      if (optOut === null || optOut === undefined || optOut === '') {
        optOut = false;
      }
    }
    
    return Boolean(optOut);
  }

  transformCountryCode(value, transformations) {
    let country = value.toString().toUpperCase();
    
    if (transformations.includes('convert_to_country_code')) {
      // Simple country code mapping
      const countryMap = {
        'US': '+1', 'USA': '+1', 'UNITED STATES': '+1',
        'CA': '+1', 'CANADA': '+1',
        'UK': '+44', 'GB': '+44', 'UNITED KINGDOM': '+44',
        'DE': '+49', 'GERMANY': '+49',
        'FR': '+33', 'FRANCE': '+33'
      };
      
      country = countryMap[country] || country;
    }
    
    if (transformations.includes('default_us_if_empty')) {
      if (!country || country === '') {
        country = '+1';
      }
    }
    
    return country.startsWith('+') ? country : '+' + country;
  }

  transformPersonalizationField(value, transformations) {
    let transformed = value.toString();
    
    if (transformations.includes('trim_whitespace')) {
      transformed = transformed.trim();
    }
    
    if (transformations.includes('capitalize_if_name')) {
      // Simple name capitalization
      if (transformed.length > 0) {
        transformed = transformed.charAt(0).toUpperCase() + transformed.slice(1).toLowerCase();
      }
    }
    
    return transformed;
  }

  calculateMappingConfidence(mappings) {
    const coreConfidences = Object.values(mappings.core)
      .filter(m => m && m.confidence)
      .map(m => m.confidence);
    
    return coreConfidences.length > 0 
      ? Math.round(coreConfidences.reduce((a, b) => a + b, 0) / coreConfidences.length * 100)
      : 0;
  }

  identifyUnmappedFields(eloquaFields, mappings) {
    const mappedFieldIds = new Set();
    
    // Collect mapped field IDs
    Object.values(mappings.core).forEach(m => {
      if (m && m.field) mappedFieldIds.add(m.field.id);
    });
    
    if (mappings.personalization) {
      mappings.personalization.forEach(p => {
        if (p.fieldId) mappedFieldIds.add(p.fieldId);
      });
    }
    
    return eloquaFields.filter(f => !mappedFieldIds.has(f.id));
  }

  mergeAIMappings(patternMappings, aiAnalysis) {
    const enhanced = { ...patternMappings };
    
    if (aiAnalysis.enhancedMappings && aiAnalysis.enhancedMappings.core) {
      Object.keys(aiAnalysis.enhancedMappings.core).forEach(key => {
        const aiMapping = aiAnalysis.enhancedMappings.core[key];
        if (aiMapping.confidence > 0.5) {
          enhanced.core[key] = {
            field: { id: aiMapping.fieldId, name: aiMapping.fieldName },
            confidence: aiMapping.confidence / 100,
            matchType: 'ai_enhanced',
            reasoning: aiMapping.reasoning
          };
        }
      });
    }
    
    if (aiAnalysis.enhancedMappings && aiAnalysis.enhancedMappings.personalization) {
      enhanced.personalization = aiAnalysis.enhancedMappings.personalization;
    }
    
    return enhanced;
  }

  cacheFieldMappings(eloquaFields, mappings) {
    const cacheKey = this.generateMappingCacheKey(eloquaFields);
    this.fieldCache.set(cacheKey, {
      mappings: mappings,
      timestamp: Date.now()
    });
  }

  generateMappingCacheKey(eloquaFields) {
    const fieldSignature = eloquaFields
      .map(f => `${f.id}:${f.name}`)
      .sort()
      .join('|');
    
    return Buffer.from(fieldSignature).toString('base64').substring(0, 32);
  }
}

module.exports = EloquaContactFieldMapper;