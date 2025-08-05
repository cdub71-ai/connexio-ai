import Joi from 'joi';
import { createContextLogger } from '../utils/logger.js';

/**
 * Campaign Specification Validator
 */
class CampaignValidator {
  constructor() {
    this.logger = createContextLogger({ service: 'campaign-validator' });
  }

  async validateCampaignSpec(campaignSpec) {
    const errors = [];
    const warnings = [];

    // Basic validation
    if (!campaignSpec.name) errors.push('Campaign name is required');
    if (!campaignSpec.type) errors.push('Campaign type is required');
    
    // Email validation
    if (campaignSpec.type === 'email' && campaignSpec.email) {
      if (!campaignSpec.email.subject) errors.push('Email subject is required');
      if (!campaignSpec.email.fromAddress) errors.push('From address is required');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      timestamp: new Date().toISOString(),
    };
  }

  getHealthStatus() {
    return { status: 'healthy', timestamp: new Date().toISOString() };
  }
}

export default CampaignValidator;