import { v4 as uuidv4 } from 'uuid';
import { createContextLogger, createTimer } from '../utils/logger.js';
import LeadspaceApiService from './leadspace-api-service.js';
import DataQualityValidator from './data-quality-validator.js';
import config from '../config/index.js';

/**
 * List Hygiene and Compliance Service
 * Handles data cleaning, compliance checking, and list maintenance
 */
class ListHygieneService {
  constructor() {
    this.logger = createContextLogger({ service: 'list-hygiene' });
    
    // Initialize dependent services
    this.leadspaceService = new LeadspaceApiService();
    this.qualityValidator = new DataQualityValidator();
    
    // Compliance rules and regulations
    this.complianceRules = this.initializeComplianceRules();
    
    // Suppression and blocklist management
    this.suppressionLists = {
      global: new Set(),
      gdpr: new Set(),
      canSpam: new Set(),
      casl: new Set(),
      bounced: new Set(),
      unsubscribed: new Set(),
      complained: new Set(),
      invalid: new Set(),
    };
    
    // Performance metrics
    this.metrics = {
      totalProcessed: 0,
      cleanRecords: 0,
      suppressedRecords: 0,
      invalidRecords: 0,
      duplicatesRemoved: 0,
      complianceViolations: 0,
      processingTime: {
        total: 0,
        average: 0,
      },
      complianceChecks: {
        gdpr: { checked: 0, violations: 0 },
        canSpam: { checked: 0, violations: 0 },
        casl: { checked: 0, violations: 0 },
      },
      suppressionReasons: {},
    };

    this.logger.info('List hygiene service initialized', {
      suppressionLists: Object.keys(this.suppressionLists),
      complianceRules: Object.keys(this.complianceRules),
    });
  }

  /**
   * Initialize compliance rules for different regulations
   * @private
   */
  initializeComplianceRules() {
    return {
      gdpr: {
        name: 'General Data Protection Regulation (GDPR)',
        applicableRegions: ['EU', 'EEA', 'UK'],
        rules: {
          requiresExplicitConsent: true,
          requiresOptInConfirmation: true,
          allowsRightToBeForotten: true,
          requiresDataProtectionOfficer: true,
          maxProcessingTimeForRequests: 30, // days
          requiresLawfulBasis: true,
          minimumAge: 16,
        },
        blockedDomains: new Set([
          // Add domains that have requested GDPR blocking
        ]),
      },
      
      canSpam: {
        name: 'CAN-SPAM Act',
        applicableRegions: ['US'],
        rules: {
          requiresUnsubscribeLink: true,
          requiresSenderIdentification: true,
          prohibitsDeceptiveSubjectLines: true,
          requiresPhysicalAddress: true,
          maxUnsubscribeProcessingTime: 10, // days
          requiresOptOutHonoring: true,
        },
        blockedDomains: new Set([
          // Add domains that have requested CAN-SPAM blocking
        ]),
      },
      
      casl: {
        name: 'Canada Anti-Spam Legislation (CASL)',
        applicableRegions: ['CA'],
        rules: {
          requiresExplicitConsent: true,
          requiresSenderIdentification: true,
          requiresUnsubscribeMechanism: true,
          prohibitsAlteredFromFields: true,
          requiresConsentValidation: true,
          consentExpiryPeriod: 24, // months
        },
        blockedDomains: new Set([
          // Add domains that have requested CASL blocking
        ]),
      },
    };
  }

  /**
   * Perform comprehensive list hygiene on contact list
   * @param {Array} contacts - Array of contacts to clean
   * @param {Object} options - Hygiene options
   * @returns {Promise<Object>} Hygiene results
   */
  async performListHygiene(contacts, options = {}) {
    const hygieneId = uuidv4();
    const timer = createTimer('list-hygiene');
    const logger = createContextLogger({
      service: 'list-hygiene',
      hygieneId,
      method: 'performListHygiene',
    });

    logger.info('Starting list hygiene process', {
      contactCount: contacts.length,
      checks: options.checks || ['duplicates', 'validation', 'compliance', 'suppression'],
    });

    const results = {
      hygieneId,
      original: {
        count: contacts.length,
        contacts: [...contacts],
      },
      processed: {
        count: 0,
        contacts: [],
      },
      removed: {
        count: 0,
        contacts: [],
        reasons: {},
      },
      warnings: [],
      compliance: {
        violations: [],
        warnings: [],
      },
      summary: {
        cleanRecords: 0,
        duplicatesRemoved: 0,
        invalidRecords: 0,
        suppressedRecords: 0,
        complianceViolations: 0,
      },
    };

    try {
      // Step 1: Remove exact duplicates
      if (!options.checks || options.checks.includes('duplicates')) {
        const deduplicationResult = await this.removeDuplicates(contacts, options, logger);
        contacts = deduplicationResult.cleanContacts;
        results.removed.contacts.push(...deduplicationResult.duplicates);
        results.removed.count += deduplicationResult.duplicates.length;
        results.summary.duplicatesRemoved = deduplicationResult.duplicates.length;
        
        if (deduplicationResult.duplicates.length > 0) {
          results.removed.reasons.duplicates = deduplicationResult.duplicates.length;
        }
      }

      // Step 2: Data validation and quality checks
      if (!options.checks || options.checks.includes('validation')) {
        const validationResult = await this.validateContacts(contacts, options, logger);
        const validContacts = validationResult.validContacts;
        const invalidContacts = validationResult.invalidContacts;
        
        contacts = validContacts;
        results.removed.contacts.push(...invalidContacts);
        results.removed.count += invalidContacts.length;
        results.summary.invalidRecords = invalidContacts.length;
        
        if (invalidContacts.length > 0) {
          results.removed.reasons.invalid = invalidContacts.length;
        }
      }

      // Step 3: Suppression list checks
      if (!options.checks || options.checks.includes('suppression')) {
        const suppressionResult = await this.checkSuppressionLists(contacts, options, logger);
        const allowedContacts = suppressionResult.allowedContacts;
        const suppressedContacts = suppressionResult.suppressedContacts;
        
        contacts = allowedContacts;
        results.removed.contacts.push(...suppressedContacts);
        results.removed.count += suppressedContacts.length;
        results.summary.suppressedRecords = suppressedContacts.length;
        
        // Track suppression reasons
        suppressionResult.suppressionReasons.forEach(reason => {
          results.removed.reasons[reason.type] = (results.removed.reasons[reason.type] || 0) + reason.count;
        });
      }

      // Step 4: Compliance checks
      if (!options.checks || options.checks.includes('compliance')) {
        const complianceResult = await this.checkCompliance(contacts, options, logger);
        contacts = complianceResult.compliantContacts;
        
        results.compliance.violations = complianceResult.violations;
        results.compliance.warnings = complianceResult.warnings;
        results.summary.complianceViolations = complianceResult.violations.length;
        
        // Remove contacts with critical compliance violations
        const criticalViolations = complianceResult.violations.filter(v => v.severity === 'critical');
        if (criticalViolations.length > 0) {
          results.removed.reasons.compliance = criticalViolations.length;
          results.removed.count += criticalViolations.length;
        }
      }

      // Step 5: Final quality scoring
      const scoringResult = await this.scoreContactQuality(contacts, options, logger);
      
      // Filter contacts based on quality threshold
      const qualityThreshold = options.qualityThreshold || 60;
      const highQualityContacts = scoringResult.scoredContacts.filter(
        contact => contact._qualityScore >= qualityThreshold
      );
      
      const lowQualityContacts = scoringResult.scoredContacts.filter(
        contact => contact._qualityScore < qualityThreshold
      );

      if (lowQualityContacts.length > 0) {
        results.removed.contacts.push(...lowQualityContacts);
        results.removed.count += lowQualityContacts.length;
        results.removed.reasons.lowQuality = lowQualityContacts.length;
      }

      // Final results
      results.processed.contacts = highQualityContacts.map(contact => {
        // Remove internal scoring metadata
        const { _qualityScore, _hygieneMetadata, ...cleanContact } = contact;
        return cleanContact;
      });
      results.processed.count = results.processed.contacts.length;
      results.summary.cleanRecords = results.processed.count;

      const duration = timer.end();
      this._updateMetrics(results, duration);

      logger.info('List hygiene completed', {
        originalCount: results.original.count,
        processedCount: results.processed.count,
        removedCount: results.removed.count,
        processingTime: duration,
        removalReasons: results.removed.reasons,
      });

      return {
        success: true,
        ...results,
        processingTimeMs: duration,
        qualityImprovement: this._calculateQualityImprovement(results),
      };

    } catch (error) {
      const duration = timer.end();
      
      logger.error('List hygiene failed', {
        error: error.message,
        duration,
      });

      return {
        success: false,
        hygieneId,
        error: error.message,
        processingTimeMs: duration,
      };
    }
  }

  /**
   * Remove duplicate contacts from list
   * @private
   */
  async removeDuplicates(contacts, options, logger) {
    logger.info('Removing duplicates', { contactCount: contacts.length });

    const seen = new Map();
    const cleanContacts = [];
    const duplicates = [];

    // Define duplicate detection strategy
    const duplicationStrategy = options.duplicationStrategy || 'email';

    contacts.forEach((contact, index) => {
      let duplicateKey;
      
      switch (duplicationStrategy) {
        case 'email':
          duplicateKey = contact.email?.toLowerCase();
          break;
        case 'email_and_name':
          duplicateKey = `${contact.email?.toLowerCase()}_${contact.firstName?.toLowerCase()}_${contact.lastName?.toLowerCase()}`;
          break;
        case 'phone':
          duplicateKey = this._normalizePhoneNumber(contact.phone || contact.phoneNumber);
          break;
        case 'comprehensive':
          // Multiple possible matches
          const emailKey = contact.email?.toLowerCase();
          const phoneKey = this._normalizePhoneNumber(contact.phone || contact.phoneNumber);
          
          if (emailKey && seen.has(emailKey)) {
            duplicateKey = emailKey;
          } else if (phoneKey && seen.has(phoneKey)) {
            duplicateKey = phoneKey;
          } else {
            duplicateKey = emailKey || phoneKey || `${contact.firstName}_${contact.lastName}_${index}`;
          }
          break;
        default:
          duplicateKey = contact.email?.toLowerCase();
      }

      if (!duplicateKey) {
        // If no key can be generated, keep the contact but mark as potential issue
        cleanContacts.push({
          ...contact,
          _hygieneMetadata: {
            warnings: ['No unique identifier found'],
          },
        });
        return;
      }

      if (seen.has(duplicateKey)) {
        // Duplicate found
        duplicates.push({
          ...contact,
          _hygieneMetadata: {
            removalReason: 'duplicate',
            duplicateKey,
            originalIndex: index,
          },
        });
      } else {
        // First occurrence
        seen.set(duplicateKey, index);
        cleanContacts.push(contact);
      }
    });

    logger.info('Duplicate removal completed', {
      originalCount: contacts.length,
      cleanCount: cleanContacts.length,
      duplicatesRemoved: duplicates.length,
    });

    return {
      cleanContacts,
      duplicates,
      strategy: duplicationStrategy,
    };
  }

  /**
   * Validate contacts for data quality
   * @private
   */
  async validateContacts(contacts, options, logger) {
    logger.info('Validating contact data quality', { contactCount: contacts.length });

    const validContacts = [];
    const invalidContacts = [];
    const validationPromises = [];

    // Process in batches to avoid overwhelming the validation service
    const batchSize = options.batchSize || 50;
    const batches = this._createBatches(contacts, batchSize);

    for (const batch of batches) {
      const batchPromises = batch.map(async (contact) => {
        try {
          const validationResult = await this.qualityValidator.validatePersonData(contact, {
            strictMode: options.strictValidation || false,
          });

          return {
            contact,
            validation: validationResult,
          };
        } catch (error) {
          return {
            contact,
            validation: {
              isValid: false,
              error: error.message,
              qualityScore: 0,
            },
          };
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach(result => {
        if (result.status === 'fulfilled') {
          const { contact, validation } = result.value;
          
          // Determine if contact passes validation
          const qualityThreshold = options.validationThreshold || 40;
          const isValid = validation.isValid && (validation.qualityScore || 0) >= qualityThreshold;
          
          if (isValid) {
            validContacts.push({
              ...contact,
              _qualityScore: validation.qualityScore,
              _hygieneMetadata: {
                validation,
              },
            });
          } else {
            invalidContacts.push({
              ...contact,
              _hygieneMetadata: {
                removalReason: 'validation_failed',
                validationErrors: validation.errors || [],
                qualityScore: validation.qualityScore || 0,
              },
            });
          }
        } else {
          // Handle validation service failures
          invalidContacts.push({
            ...batch[batchResults.indexOf(result)],
            _hygieneMetadata: {
              removalReason: 'validation_error',
              error: result.reason.message,
            },
          });
        }
      });

      // Add delay between batches
      if (batches.indexOf(batch) < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    logger.info('Contact validation completed', {
      originalCount: contacts.length,
      validCount: validContacts.length,
      invalidCount: invalidContacts.length,
    });

    return {
      validContacts,
      invalidContacts,
    };
  }

  /**
   * Check contacts against suppression lists
   * @private
   */
  async checkSuppressionLists(contacts, options, logger) {
    logger.info('Checking suppression lists', { contactCount: contacts.length });

    const allowedContacts = [];
    const suppressedContacts = [];
    const suppressionReasons = [];
    const reasonCounts = {};

    contacts.forEach(contact => {
      const suppressionChecks = this._checkContactSuppression(contact);
      
      if (suppressionChecks.length === 0) {
        allowedContacts.push(contact);
      } else {
        suppressedContacts.push({
          ...contact,
          _hygieneMetadata: {
            removalReason: 'suppressed',
            suppressionReasons: suppressionChecks,
          },
        });

        // Track suppression reasons
        suppressionChecks.forEach(reason => {
          reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
        });
      }
    });

    // Convert reason counts to structured format
    Object.entries(reasonCounts).forEach(([type, count]) => {
      suppressionReasons.push({ type, count });
    });

    logger.info('Suppression check completed', {
      originalCount: contacts.length,
      allowedCount: allowedContacts.length,
      suppressedCount: suppressedContacts.length,
      suppressionReasons: reasonCounts,
    });

    return {
      allowedContacts,
      suppressedContacts,
      suppressionReasons,
    };
  }

  /**
   * Check individual contact against suppression lists
   * @private
   */
  _checkContactSuppression(contact) {
    const reasons = [];
    const email = contact.email?.toLowerCase();
    const phone = this._normalizePhoneNumber(contact.phone || contact.phoneNumber);

    // Check against various suppression lists
    if (email) {
      if (this.suppressionLists.global.has(email)) reasons.push('global_suppression');
      if (this.suppressionLists.unsubscribed.has(email)) reasons.push('unsubscribed');
      if (this.suppressionLists.bounced.has(email)) reasons.push('bounced');
      if (this.suppressionLists.complained.has(email)) reasons.push('complained');
      if (this.suppressionLists.invalid.has(email)) reasons.push('invalid_email');
      
      // GDPR suppression
      if (this.suppressionLists.gdpr.has(email)) reasons.push('gdpr_suppression');
      
      // Check domain-level suppressions
      const domain = email.split('@')[1];
      if (this._isDomainSuppressed(domain)) reasons.push('domain_suppressed');
    }

    if (phone) {
      if (this.suppressionLists.global.has(phone)) reasons.push('global_phone_suppression');
    }

    return reasons;
  }

  /**
   * Check compliance requirements
   * @private
   */
  async checkCompliance(contacts, options, logger) {
    logger.info('Checking compliance requirements', { contactCount: contacts.length });

    const compliantContacts = [];
    const violations = [];
    const warnings = [];

    // Determine applicable regulations based on contact locations
    const applicableRegulations = options.regulations || ['gdpr', 'canSpam', 'casl'];

    for (const contact of contacts) {
      const contactViolations = [];
      const contactWarnings = [];

      // Check each applicable regulation
      for (const regulation of applicableRegulations) {
        const rules = this.complianceRules[regulation];
        if (!rules) continue;

        const complianceCheck = this._checkContactCompliance(contact, regulation, rules);
        
        contactViolations.push(...complianceCheck.violations);
        contactWarnings.push(...complianceCheck.warnings);
      }

      // Determine if contact passes compliance
      const criticalViolations = contactViolations.filter(v => v.severity === 'critical');
      const isCompliant = criticalViolations.length === 0;

      if (isCompliant) {
        compliantContacts.push({
          ...contact,
          _hygieneMetadata: {
            ...(contact._hygieneMetadata || {}),
            compliance: {
              status: 'compliant',
              warnings: contactWarnings,
            },
          },
        });
      }

      // Track all violations and warnings
      violations.push(...contactViolations);
      warnings.push(...contactWarnings);
    }

    // Update compliance metrics
    applicableRegulations.forEach(regulation => {
      if (this.metrics.complianceChecks[regulation]) {
        this.metrics.complianceChecks[regulation].checked += contacts.length;
        this.metrics.complianceChecks[regulation].violations += 
          violations.filter(v => v.regulation === regulation).length;
      }
    });

    logger.info('Compliance check completed', {
      originalCount: contacts.length,
      compliantCount: compliantContacts.length,
      violationsCount: violations.length,
      warningsCount: warnings.length,
    });

    return {
      compliantContacts,
      violations,
      warnings,
    };
  }

  /**
   * Check individual contact compliance
   * @private
   */
  _checkContactCompliance(contact, regulation, rules) {
    const violations = [];
    const warnings = [];

    const email = contact.email?.toLowerCase();
    const domain = email?.split('@')[1];

    // Check domain-level blocks
    if (domain && rules.blockedDomains.has(domain)) {
      violations.push({
        regulation,
        type: 'blocked_domain',
        severity: 'critical',
        message: `Domain ${domain} is blocked under ${rules.name}`,
        contact: this._sanitizeContactForLogging(contact),
      });
    }

    // GDPR-specific checks
    if (regulation === 'gdpr') {
      // Check for EU/EEA indicators
      const isEUContact = this._isEUContact(contact);
      
      if (isEUContact) {
        if (!contact.gdprConsent) {
          violations.push({
            regulation,
            type: 'missing_gdpr_consent',
            severity: 'critical',
            message: 'GDPR consent missing for EU contact',
            contact: this._sanitizeContactForLogging(contact),
          });
        }

        if (!contact.consentDate) {
          warnings.push({
            regulation,
            type: 'missing_consent_date',
            severity: 'medium',
            message: 'Consent date not recorded',
            contact: this._sanitizeContactForLogging(contact),
          });
        }
      }
    }

    // CAN-SPAM specific checks
    if (regulation === 'canSpam') {
      const isUSContact = this._isUSContact(contact);
      
      if (isUSContact) {
        if (!contact.canSpamCompliant) {
          warnings.push({
            regulation,
            type: 'can_spam_flag_missing',
            severity: 'medium',
            message: 'CAN-SPAM compliance flag missing',
            contact: this._sanitizeContactForLogging(contact),
          });
        }
      }
    }

    // CASL specific checks
    if (regulation === 'casl') {
      const isCAContact = this._isCanadianContact(contact);
      
      if (isCAContact) {
        if (!contact.caslConsent) {
          violations.push({
            regulation,
            type: 'missing_casl_consent',
            severity: 'critical',
            message: 'CASL consent missing for Canadian contact',
            contact: this._sanitizeContactForLogging(contact),
          });
        }
      }
    }

    return { violations, warnings };
  }

  /**
   * Score contact quality
   * @private
   */
  async scoreContactQuality(contacts, options, logger) {
    logger.info('Scoring contact quality', { contactCount: contacts.length });

    const scoredContacts = contacts.map(contact => {
      // Use existing quality score from validation, or calculate basic score
      let qualityScore = contact._qualityScore || this._calculateBasicQualityScore(contact);
      
      // Apply hygiene adjustments
      const hygieneMetadata = contact._hygieneMetadata || {};
      
      // Reduce score for warnings
      if (hygieneMetadata.warnings) {
        qualityScore -= hygieneMetadata.warnings.length * 5;
      }
      
      // Reduce score for compliance issues
      if (hygieneMetadata.compliance?.warnings) {
        qualityScore -= hygieneMetadata.compliance.warnings.length * 3;
      }

      return {
        ...contact,
        _qualityScore: Math.max(0, Math.min(100, qualityScore)),
      };
    });

    return { scoredContacts };
  }

  /**
   * Calculate basic quality score for contact
   * @private
   */
  _calculateBasicQualityScore(contact) {
    let score = 0;
    
    // Email presence and validity (40 points)
    if (contact.email) {
      score += 30;
      if (this._isValidEmail(contact.email)) {
        score += 10;
      }
    }
    
    // Name completeness (20 points)
    if (contact.firstName) score += 10;
    if (contact.lastName) score += 10;
    
    // Phone number (15 points)
    if (contact.phone || contact.phoneNumber) {
      score += 15;
    }
    
    // Company information (15 points)
    if (contact.company || contact.companyName) {
      score += 15;
    }
    
    // Additional fields (10 points)
    if (contact.title) score += 5;
    if (contact.city || contact.location) score += 5;
    
    return score;
  }

  /**
   * Add contacts to suppression list
   * @param {Array} contacts - Contacts to suppress
   * @param {string} listType - Type of suppression list
   * @param {string} reason - Reason for suppression
   */
  async addToSuppressionList(contacts, listType, reason) {
    const logger = createContextLogger({
      service: 'list-hygiene',
      method: 'addToSuppressionList',
    });

    if (!this.suppressionLists[listType]) {
      throw new Error(`Unknown suppression list type: ${listType}`);
    }

    let addedCount = 0;
    
    contacts.forEach(contact => {
      const email = contact.email?.toLowerCase();
      const phone = this._normalizePhoneNumber(contact.phone || contact.phoneNumber);
      
      if (email && !this.suppressionLists[listType].has(email)) {
        this.suppressionLists[listType].add(email);
        addedCount++;
      }
      
      if (phone && !this.suppressionLists[listType].has(phone)) {
        this.suppressionLists[listType].add(phone);
        addedCount++;
      }
    });

    // Track suppression reasons
    if (!this.metrics.suppressionReasons[reason]) {
      this.metrics.suppressionReasons[reason] = 0;
    }
    this.metrics.suppressionReasons[reason] += addedCount;

    logger.info('Contacts added to suppression list', {
      listType,
      reason,
      contactCount: contacts.length,
      addedCount,
    });

    return {
      success: true,
      listType,
      reason,
      addedCount,
    };
  }

  /**
   * Remove contacts from suppression list
   * @param {Array} contacts - Contacts to unsuppress
   * @param {string} listType - Type of suppression list
   */
  async removeFromSuppressionList(contacts, listType) {
    const logger = createContextLogger({
      service: 'list-hygiene',
      method: 'removeFromSuppressionList',
    });

    if (!this.suppressionLists[listType]) {
      throw new Error(`Unknown suppression list type: ${listType}`);
    }

    let removedCount = 0;
    
    contacts.forEach(contact => {
      const email = contact.email?.toLowerCase();
      const phone = this._normalizePhoneNumber(contact.phone || contact.phoneNumber);
      
      if (email && this.suppressionLists[listType].has(email)) {
        this.suppressionLists[listType].delete(email);
        removedCount++;
      }
      
      if (phone && this.suppressionLists[listType].has(phone)) {
        this.suppressionLists[listType].delete(phone);
        removedCount++;
      }
    });

    logger.info('Contacts removed from suppression list', {
      listType,
      contactCount: contacts.length,
      removedCount,
    });

    return {
      success: true,
      listType,
      removedCount,
    };
  }

  /**
   * Helper methods
   * @private
   */
  _normalizePhoneNumber(phone) {
    if (!phone) return null;
    return phone.replace(/[^\d+]/g, '');
  }

  _isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  _isDomainSuppressed(domain) {
    // Check if domain is in any blocked lists
    return Object.values(this.complianceRules).some(rule => 
      rule.blockedDomains.has(domain)
    );
  }

  _isEUContact(contact) {
    const euCountries = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];
    return euCountries.includes(contact.country) || 
           contact.timezone?.includes('Europe') ||
           contact.gdprApplicable === true;
  }

  _isUSContact(contact) {
    return contact.country === 'US' || 
           contact.timezone?.includes('America') ||
           (contact.state && contact.state.length === 2); // US state codes
  }

  _isCanadianContact(contact) {
    return contact.country === 'CA' || 
           contact.timezone?.includes('America') && contact.state?.length > 2; // Canadian provinces
  }

  _sanitizeContactForLogging(contact) {
    return {
      email: this._maskEmail(contact.email),
      firstName: contact.firstName,
      lastName: contact.lastName,
      country: contact.country,
    };
  }

  _maskEmail(email) {
    if (!email) return null;
    const [local, domain] = email.split('@');
    return `${local.charAt(0)}***@${domain}`;
  }

  _createBatches(array, batchSize) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  _calculateQualityImprovement(results) {
    const originalCount = results.original.count;
    const cleanCount = results.processed.count;
    
    if (originalCount === 0) return 0;
    
    return {
      cleanDataPercentage: Math.round((cleanCount / originalCount) * 100),
      removalRate: Math.round(((originalCount - cleanCount) / originalCount) * 100),
      qualityGain: Math.round((cleanCount / originalCount) * 100) - 50, // Baseline assumption
    };
  }

  _updateMetrics(results, duration) {
    this.metrics.totalProcessed += results.original.count;
    this.metrics.cleanRecords += results.processed.count;
    this.metrics.suppressedRecords += (results.removed.reasons.suppressed || 0);
    this.metrics.invalidRecords += (results.removed.reasons.invalid || 0);
    this.metrics.duplicatesRemoved += (results.removed.reasons.duplicates || 0);
    this.metrics.complianceViolations += results.summary.complianceViolations;

    // Update processing time metrics
    this.metrics.processingTime.total += duration;
    this.metrics.processingTime.average = Math.round(
      this.metrics.processingTime.total / (this.metrics.totalProcessed / results.original.count)
    );
  }

  /**
   * Get service health status
   */
  getHealthStatus() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      metrics: this.metrics,
      suppressionLists: Object.keys(this.suppressionLists).reduce((sizes, key) => {
        sizes[key] = this.suppressionLists[key].size;
        return sizes;
      }, {}),
      complianceRules: Object.keys(this.complianceRules),
      services: {
        leadspace: this.leadspaceService.getHealthStatus(),
        qualityValidator: this.qualityValidator.getHealthStatus(),
      },
    };
  }

  /**
   * Shutdown service gracefully
   */
  async shutdown() {
    this.logger.info('Shutting down list hygiene service');

    try {
      await Promise.all([
        this.leadspaceService.shutdown(),
      ]);

      this.logger.info('List hygiene service shutdown complete', {
        totalProcessed: this.metrics.totalProcessed,
        cleanDataRate: this.metrics.totalProcessed > 0 
          ? Math.round((this.metrics.cleanRecords / this.metrics.totalProcessed) * 100)
          : 0,
      });
    } catch (error) {
      this.logger.error('Error during list hygiene service shutdown', { error: error.message });
    }
  }
}

export default ListHygieneService;