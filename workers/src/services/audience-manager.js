import { createContextLogger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Cross-Channel Audience Manager
 * Handles audience preparation, deduplication, and channel-specific targeting
 */
class AudienceManager {
  constructor() {
    this.logger = createContextLogger({ service: 'audience-manager' });
    
    // Audience cache for performance
    this.audienceCache = new Map();
    
    // Deduplication tracking
    this.deduplicationRules = {
      email: ['email', 'emailAddress'],
      phone: ['phoneNumber', 'phone', 'mobile'],
      customerId: ['customerId', 'id', 'userId'],
    };

    this.logger.info('Audience manager initialized');
  }

  /**
   * Prepare multi-channel audience
   * @param {Object} audienceConfig - Audience configuration
   * @param {Array} channels - Channel configurations
   * @param {Object} logger - Context logger
   * @returns {Promise<Object>} Prepared audience result
   */
  async prepareMultiChannelAudience(audienceConfig, channels, logger) {
    const preparationId = uuidv4();
    logger.info('Preparing multi-channel audience', {
      preparationId,
      channelCount: channels.length,
      audienceType: audienceConfig.type || 'mixed',
    });

    try {
      // Step 1: Load base audience
      const baseAudience = await this.loadBaseAudience(audienceConfig, logger);

      // Step 2: Deduplicate contacts
      const deduplicatedAudience = this.deduplicateContacts(baseAudience, logger);

      // Step 3: Validate contacts for each channel
      const validatedAudience = await this.validateContactsForChannels(
        deduplicatedAudience,
        channels,
        logger
      );

      // Step 4: Apply audience segmentation
      const segmentedAudience = await this.applyAudienceSegmentation(
        validatedAudience,
        audienceConfig.segmentation,
        logger
      );

      // Step 5: Prepare channel-specific audiences
      const channelAudiences = await this.prepareChannelSpecificAudiences(
        segmentedAudience,
        channels,
        logger
      );

      const result = {
        preparationId,
        totalSize: segmentedAudience.contacts.length,
        baseSize: baseAudience.contacts.length,
        deduplicatedSize: deduplicatedAudience.contacts.length,
        validatedSize: validatedAudience.contacts.length,
        contacts: segmentedAudience.contacts,
        lists: segmentedAudience.lists || [],
        segments: segmentedAudience.segments || [],
        channelAudiences,
        statistics: this.calculateAudienceStatistics(segmentedAudience),
        validationSummary: validatedAudience.validationSummary,
      };

      // Cache result for performance
      this.audienceCache.set(preparationId, result);

      logger.info('Multi-channel audience prepared', {
        preparationId,
        totalSize: result.totalSize,
        channelCount: Object.keys(channelAudiences).length,
        deduplicationRate: Math.round(((baseAudience.contacts.length - deduplicatedAudience.contacts.length) / baseAudience.contacts.length) * 100),
      });

      return result;

    } catch (error) {
      logger.error('Failed to prepare multi-channel audience', {
        error: error.message,
        preparationId,
      });
      throw error;
    }
  }

  /**
   * Load base audience from various sources
   * @private
   */
  async loadBaseAudience(audienceConfig, logger) {
    logger.info('Loading base audience', {
      sourceType: audienceConfig.source?.type || 'mixed',
      listsCount: audienceConfig.lists?.length || 0,
      segmentsCount: audienceConfig.segments?.length || 0,
    });

    const audience = {
      contacts: [],
      lists: [],
      segments: [],
      metadata: {
        loadedAt: new Date().toISOString(),
        sources: [],
      },
    };

    // Load from lists
    if (audienceConfig.lists && audienceConfig.lists.length > 0) {
      for (const listConfig of audienceConfig.lists) {
        const listContacts = await this.loadContactsFromList(listConfig, logger);
        audience.contacts.push(...listContacts);
        audience.lists.push(listConfig);
        audience.metadata.sources.push(`list:${listConfig.id || listConfig.name}`);
      }
    }

    // Load from segments
    if (audienceConfig.segments && audienceConfig.segments.length > 0) {
      for (const segmentConfig of audienceConfig.segments) {
        const segmentContacts = await this.loadContactsFromSegment(segmentConfig, logger);
        audience.contacts.push(...segmentContacts);
        audience.segments.push(segmentConfig);
        audience.metadata.sources.push(`segment:${segmentConfig.id || segmentConfig.name}`);
      }
    }

    // Load from direct contact list
    if (audienceConfig.contacts && Array.isArray(audienceConfig.contacts)) {
      audience.contacts.push(...audienceConfig.contacts);
      audience.metadata.sources.push('direct');
    }

    // Load from data source
    if (audienceConfig.dataSource) {
      const dataSourceContacts = await this.loadContactsFromDataSource(
        audienceConfig.dataSource,
        logger
      );
      audience.contacts.push(...dataSourceContacts);
      audience.metadata.sources.push(`datasource:${audienceConfig.dataSource.type}`);
    }

    logger.info('Base audience loaded', {
      totalContacts: audience.contacts.length,
      sources: audience.metadata.sources,
    });

    return audience;
  }

  /**
   * Load contacts from list configuration
   * @private
   */
  async loadContactsFromList(listConfig, logger) {
    logger.debug('Loading contacts from list', {
      listId: listConfig.id,
      listName: listConfig.name,
    });

    // This would integrate with your actual list management system
    // For now, return mock data or contacts from the config
    if (listConfig.contacts) {
      return listConfig.contacts;
    }

    // In a real implementation, this would query your database or CRM
    return [];
  }

  /**
   * Load contacts from segment configuration
   * @private
   */
  async loadContactsFromSegment(segmentConfig, logger) {
    logger.debug('Loading contacts from segment', {
      segmentId: segmentConfig.id,
      segmentName: segmentConfig.name,
    });

    // This would integrate with your actual segmentation system
    if (segmentConfig.contacts) {
      return segmentConfig.contacts;
    }

    return [];
  }

  /**
   * Load contacts from data source
   * @private
   */
  async loadContactsFromDataSource(dataSource, logger) {
    logger.debug('Loading contacts from data source', {
      sourceType: dataSource.type,
    });

    // This would integrate with databases, APIs, files, etc.
    return [];
  }

  /**
   * Deduplicate contacts based on various identifiers
   * @private
   */
  deduplicateContacts(audience, logger) {
    logger.info('Deduplicating contacts', {
      originalCount: audience.contacts.length,
    });

    const seen = new Set();
    const deduplicatedContacts = [];
    const duplicates = [];

    for (const contact of audience.contacts) {
      const identifiers = this.extractContactIdentifiers(contact);
      const compositeKey = identifiers.join('|').toLowerCase();

      if (!seen.has(compositeKey)) {
        seen.add(compositeKey);
        deduplicatedContacts.push({
          ...contact,
          deduplicationKey: compositeKey,
        });
      } else {
        duplicates.push(contact);
      }
    }

    logger.info('Contact deduplication completed', {
      originalCount: audience.contacts.length,
      deduplicatedCount: deduplicatedContacts.length,
      duplicatesRemoved: duplicates.length,
      deduplicationRate: Math.round((duplicates.length / audience.contacts.length) * 100),
    });

    return {
      ...audience,
      contacts: deduplicatedContacts,
      deduplicationSummary: {
        duplicatesRemoved: duplicates.length,
        deduplicationRate: Math.round((duplicates.length / audience.contacts.length) * 100),
        duplicates: duplicates.slice(0, 10), // Keep sample for debugging
      },
    };
  }

  /**
   * Extract identifiers for deduplication
   * @private
   */
  extractContactIdentifiers(contact) {
    const identifiers = [];

    // Extract email identifiers
    for (const emailField of this.deduplicationRules.email) {
      if (contact[emailField]) {
        identifiers.push(`email:${contact[emailField]}`);
      }
    }

    // Extract phone identifiers
    for (const phoneField of this.deduplicationRules.phone) {
      if (contact[phoneField]) {
        const normalizedPhone = this.normalizePhoneNumber(contact[phoneField]);
        identifiers.push(`phone:${normalizedPhone}`);
      }
    }

    // Extract customer ID identifiers
    for (const idField of this.deduplicationRules.customerId) {
      if (contact[idField]) {
        identifiers.push(`id:${contact[idField]}`);
      }
    }

    return identifiers.length > 0 ? identifiers : [`fallback:${JSON.stringify(contact)}`];
  }

  /**
   * Normalize phone number for consistent comparison
   * @private
   */
  normalizePhoneNumber(phoneNumber) {
    // Remove all non-digit characters except +
    return phoneNumber.replace(/[^\d+]/g, '');
  }

  /**
   * Validate contacts for specific channels
   * @private
   */
  async validateContactsForChannels(audience, channels, logger) {
    logger.info('Validating contacts for channels', {
      contactCount: audience.contacts.length,
      channelTypes: channels.map(ch => ch.type),
    });

    const validationResults = {
      valid: [],
      invalid: [],
      warnings: [],
    };

    const channelTypes = new Set(channels.map(ch => ch.type));

    for (const contact of audience.contacts) {
      const contactValidation = {
        contact,
        channelValidation: {},
        isValid: true,
      };

      // Validate for email channels
      if (channelTypes.has('email')) {
        const emailValidation = this.validateContactForEmail(contact);
        contactValidation.channelValidation.email = emailValidation;
        if (!emailValidation.isValid) {
          contactValidation.isValid = false;
        }
      }

      // Validate for SMS/MMS channels
      if (channelTypes.has('sms') || channelTypes.has('mms')) {
        const smsValidation = this.validateContactForSms(contact);
        contactValidation.channelValidation.sms = smsValidation;
        if (!smsValidation.isValid) {
          contactValidation.isValid = false;
        }
      }

      if (contactValidation.isValid) {
        validationResults.valid.push(contact);
      } else {
        validationResults.invalid.push({
          contact,
          reasons: Object.entries(contactValidation.channelValidation)
            .filter(([, validation]) => !validation.isValid)
            .map(([channel, validation]) => `${channel}: ${validation.reason}`)
        });
      }
    }

    logger.info('Contact validation completed', {
      validContacts: validationResults.valid.length,
      invalidContacts: validationResults.invalid.length,
      validationRate: Math.round((validationResults.valid.length / audience.contacts.length) * 100),
    });

    return {
      ...audience,
      contacts: validationResults.valid,
      validationSummary: {
        totalProcessed: audience.contacts.length,
        validContacts: validationResults.valid.length,
        invalidContacts: validationResults.invalid.length,
        validationRate: Math.round((validationResults.valid.length / audience.contacts.length) * 100),
        invalidReasons: validationResults.invalid.slice(0, 10), // Sample for debugging
      },
    };
  }

  /**
   * Validate contact for email channel
   * @private
   */
  validateContactForEmail(contact) {
    const emailFields = ['email', 'emailAddress'];
    const email = emailFields.find(field => contact[field]);

    if (!email || !contact[email]) {
      return {
        isValid: false,
        reason: 'No email address provided',
      };
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(contact[email])) {
      return {
        isValid: false,
        reason: 'Invalid email format',
      };
    }

    return {
      isValid: true,
      emailField: email,
      emailAddress: contact[email],
    };
  }

  /**
   * Validate contact for SMS channel
   * @private
   */
  validateContactForSms(contact) {
    const phoneFields = ['phoneNumber', 'phone', 'mobile'];
    const phoneField = phoneFields.find(field => contact[field]);

    if (!phoneField || !contact[phoneField]) {
      return {
        isValid: false,
        reason: 'No phone number provided',
      };
    }

    const phoneNumber = contact[phoneField];
    
    // Basic phone number validation (E.164 format)
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    if (!phoneRegex.test(phoneNumber)) {
      return {
        isValid: false,
        reason: 'Invalid phone number format (must be E.164)',
      };
    }

    return {
      isValid: true,
      phoneField: phoneField,
      phoneNumber: phoneNumber,
    };
  }

  /**
   * Apply audience segmentation rules
   * @private
   */
  async applyAudienceSegmentation(audience, segmentationConfig, logger) {
    if (!segmentationConfig) {
      return audience;
    }

    logger.info('Applying audience segmentation', {
      originalSize: audience.contacts.length,
      segmentationRules: Object.keys(segmentationConfig),
    });

    let segmentedContacts = [...audience.contacts];

    // Apply filters
    if (segmentationConfig.filters) {
      segmentedContacts = this.applyFilters(segmentedContacts, segmentationConfig.filters);
    }

    // Apply limit
    if (segmentationConfig.limit && segmentedContacts.length > segmentationConfig.limit) {
      segmentedContacts = segmentedContacts.slice(0, segmentationConfig.limit);
    }

    // Apply sampling
    if (segmentationConfig.sample) {
      const sampleSize = Math.floor(segmentedContacts.length * segmentationConfig.sample);
      segmentedContacts = this.sampleContacts(segmentedContacts, sampleSize);
    }

    logger.info('Audience segmentation applied', {
      originalSize: audience.contacts.length,
      segmentedSize: segmentedContacts.length,
    });

    return {
      ...audience,
      contacts: segmentedContacts,
    };
  }

  /**
   * Apply filters to contacts
   * @private
   */
  applyFilters(contacts, filters) {
    return contacts.filter(contact => {
      for (const [field, condition] of Object.entries(filters)) {
        if (!this.evaluateFilterCondition(contact, field, condition)) {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * Evaluate filter condition
   * @private
   */
  evaluateFilterCondition(contact, field, condition) {
    const value = contact[field];

    if (typeof condition === 'string' || typeof condition === 'number') {
      return value === condition;
    }

    if (typeof condition === 'object') {
      if (condition.$in) {
        return condition.$in.includes(value);
      }
      if (condition.$nin) {
        return !condition.$nin.includes(value);
      }
      if (condition.$gt) {
        return value > condition.$gt;
      }
      if (condition.$lt) {
        return value < condition.$lt;
      }
      if (condition.$regex) {
        return new RegExp(condition.$regex).test(value);
      }
    }

    return true;
  }

  /**
   * Sample contacts randomly
   * @private
   */
  sampleContacts(contacts, sampleSize) {
    if (sampleSize >= contacts.length) {
      return contacts;
    }

    // Fisher-Yates shuffle and take first n elements
    const shuffled = [...contacts];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, sampleSize);
  }

  /**
   * Prepare channel-specific audiences
   * @private
   */
  async prepareChannelSpecificAudiences(audience, channels, logger) {
    const channelAudiences = {};

    for (const channel of channels) {
      logger.debug('Preparing channel-specific audience', {
        channelType: channel.type,
        channelName: channel.name,
      });

      let channelContacts = [...audience.contacts];

      // Apply channel-specific filters
      if (channel.audienceFilter) {
        channelContacts = this.applyFilters(channelContacts, channel.audienceFilter);
      }

      // Prepare channel-specific contact format
      const formattedContacts = channelContacts.map(contact => 
        this.formatContactForChannel(contact, channel.type)
      );

      channelAudiences[channel.type] = {
        size: formattedContacts.length,
        contacts: formattedContacts,
        channel: channel.name,
      };
    }

    logger.info('Channel-specific audiences prepared', {
      channels: Object.keys(channelAudiences),
      sizes: Object.entries(channelAudiences).map(([type, aud]) => `${type}: ${aud.size}`),
    });

    return channelAudiences;
  }

  /**
   * Format contact for specific channel
   * @private
   */
  formatContactForChannel(contact, channelType) {
    const baseContact = { ...contact };

    switch (channelType) {
      case 'email':
        return {
          ...baseContact,
          email: contact.email || contact.emailAddress,
          firstName: contact.firstName || '',
          lastName: contact.lastName || '',
        };
      case 'sms':
      case 'mms':
        return {
          ...baseContact,
          phoneNumber: contact.phoneNumber || contact.phone || contact.mobile,
          firstName: contact.firstName || '',
          lastName: contact.lastName || '',
        };
      default:
        return baseContact;
    }
  }

  /**
   * Calculate audience statistics
   * @private
   */
  calculateAudienceStatistics(audience) {
    const stats = {
      totalContacts: audience.contacts.length,
      channels: {},
      demographics: {},
    };

    // Channel availability stats
    let emailCount = 0;
    let phoneCount = 0;

    for (const contact of audience.contacts) {
      if (contact.email || contact.emailAddress) emailCount++;
      if (contact.phoneNumber || contact.phone || contact.mobile) phoneCount++;
    }

    stats.channels.email = emailCount;
    stats.channels.sms = phoneCount;
    stats.channels.emailPercentage = Math.round((emailCount / stats.totalContacts) * 100);
    stats.channels.smsPercentage = Math.round((phoneCount / stats.totalContacts) * 100);

    return stats;
  }

  /**
   * Get audience manager health status
   */
  getHealthStatus() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      cachedAudiences: this.audienceCache.size,
      deduplicationRules: Object.keys(this.deduplicationRules),
    };
  }

  /**
   * Shutdown audience manager
   */
  async shutdown() {
    this.logger.info('Shutting down audience manager');
    this.audienceCache.clear();
    this.logger.info('Audience manager shutdown complete');
  }
}

export default AudienceManager;