/**
 * Azure Cost Service Validation Utilities
 * Provides validation and error handling for Azure Cost Management operations
 */

import { createServiceLogger } from '../monitoring/logger.js';

const logger = createServiceLogger('azure-cost-validator');

/**
 * Custom error classes for Azure Cost Management
 */
export class AzureCostError extends Error {
  constructor(message, code = 'AZURE_COST_ERROR', details = {}) {
    super(message);
    this.name = 'AzureCostError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

export class AzureAuthError extends AzureCostError {
  constructor(message, details = {}) {
    super(message, 'AZURE_AUTH_ERROR', details);
    this.name = 'AzureAuthError';
  }
}

export class AzureApiError extends AzureCostError {
  constructor(message, statusCode, details = {}) {
    super(message, 'AZURE_API_ERROR', { statusCode, ...details });
    this.name = 'AzureApiError';
    this.statusCode = statusCode;
  }
}

export class AzureConfigError extends AzureCostError {
  constructor(message, details = {}) {
    super(message, 'AZURE_CONFIG_ERROR', details);
    this.name = 'AzureConfigError';
  }
}

export class AzureDataError extends AzureCostError {
  constructor(message, details = {}) {
    super(message, 'AZURE_DATA_ERROR', details);
    this.name = 'AzureDataError';
  }
}

/**
 * Azure Cost Service Validator
 */
export class AzureCostValidator {
  /**
   * Validate Azure subscription ID format
   * @param {string} subscriptionId - Azure subscription ID
   * @throws {AzureConfigError} If validation fails
   */
  static validateSubscriptionId(subscriptionId) {
    if (!subscriptionId) {
      throw new AzureConfigError('Azure subscription ID is required', {
        field: 'subscriptionId',
        provided: subscriptionId
      });
    }

    if (typeof subscriptionId !== 'string') {
      throw new AzureConfigError('Azure subscription ID must be a string', {
        field: 'subscriptionId',
        type: typeof subscriptionId
      });
    }

    // Azure subscription ID is a GUID format
    const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!guidRegex.test(subscriptionId)) {
      throw new AzureConfigError('Invalid Azure subscription ID format. Expected GUID format.', {
        field: 'subscriptionId',
        provided: subscriptionId,
        expectedFormat: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
      });
    }
  }

  /**
   * Validate date format and range
   * @param {string} date - Date string (YYYY-MM-DD)
   * @param {string} fieldName - Field name for error messages
   * @throws {AzureConfigError} If validation fails
   */
  static validateDate(date, fieldName = 'date') {
    if (!date) {
      throw new AzureConfigError(`${fieldName} is required`, {
        field: fieldName,
        provided: date
      });
    }

    if (typeof date !== 'string') {
      throw new AzureConfigError(`${fieldName} must be a string`, {
        field: fieldName,
        type: typeof date
      });
    }

    // Validate YYYY-MM-DD format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      throw new AzureConfigError(`Invalid ${fieldName} format. Expected YYYY-MM-DD.`, {
        field: fieldName,
        provided: date,
        expectedFormat: 'YYYY-MM-DD'
      });
    }

    // Validate that it's a valid date
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      throw new AzureConfigError(`Invalid ${fieldName}. Not a valid date.`, {
        field: fieldName,
        provided: date
      });
    }

    // Check if date is not too far in the future
    const today = new Date();
    const maxDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    
    if (parsedDate > maxDate) {
      throw new AzureConfigError(`${fieldName} cannot be in the future`, {
        field: fieldName,
        provided: date,
        maxAllowed: maxDate.toISOString().split('T')[0]
      });
    }

    // Check if date is not too far in the past (Azure Cost Management has limits)
    const minDate = new Date();
    minDate.setFullYear(minDate.getFullYear() - 1); // 1 year back
    
    if (parsedDate < minDate) {
      throw new AzureConfigError(`${fieldName} cannot be more than 1 year in the past`, {
        field: fieldName,
        provided: date,
        minAllowed: minDate.toISOString().split('T')[0]
      });
    }
  }

  /**
   * Validate date range
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @throws {AzureConfigError} If validation fails
   */
  static validateDateRange(startDate, endDate) {
    this.validateDate(startDate, 'startDate');
    this.validateDate(endDate, 'endDate');

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
      throw new AzureConfigError('Start date must be before or equal to end date', {
        startDate,
        endDate
      });
    }

    // Check maximum date range (Azure Cost Management limits)
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays > 366) {
      throw new AzureConfigError('Date range cannot exceed 366 days', {
        startDate,
        endDate,
        rangeDays: diffDays,
        maxAllowed: 366
      });
    }
  }

  /**
   * Validate resource types array
   * @param {Array} resourceTypes - Array of resource type strings
   * @throws {AzureConfigError} If validation fails
   */
  static validateResourceTypes(resourceTypes) {
    if (!resourceTypes) return; // Optional parameter

    if (!Array.isArray(resourceTypes)) {
      throw new AzureConfigError('Resource types must be an array', {
        field: 'resourceTypes',
        type: typeof resourceTypes
      });
    }

    if (resourceTypes.length === 0) {
      throw new AzureConfigError('Resource types array cannot be empty', {
        field: 'resourceTypes'
      });
    }

    if (resourceTypes.length > 50) {
      throw new AzureConfigError('Too many resource types. Maximum 50 allowed.', {
        field: 'resourceTypes',
        count: resourceTypes.length,
        maxAllowed: 50
      });
    }

    // Validate each resource type
    resourceTypes.forEach((resourceType, index) => {
      if (typeof resourceType !== 'string') {
        throw new AzureConfigError(`Resource type at index ${index} must be a string`, {
          field: `resourceTypes[${index}]`,
          type: typeof resourceType
        });
      }

      if (resourceType.trim().length === 0) {
        throw new AzureConfigError(`Resource type at index ${index} cannot be empty`, {
          field: `resourceTypes[${index}]`
        });
      }

      // Basic format validation for Azure resource types
      if (!resourceType.includes('/')) {
        logger.warn('Resource type may be invalid format', {
          resourceType,
          expectedFormat: 'microsoft.provider/resourcetype'
        });
      }
    });
  }

  /**
   * Validate resource group name
   * @param {string} resourceGroup - Azure resource group name
   * @throws {AzureConfigError} If validation fails
   */
  static validateResourceGroup(resourceGroup) {
    if (!resourceGroup) return; // Optional parameter

    if (typeof resourceGroup !== 'string') {
      throw new AzureConfigError('Resource group must be a string', {
        field: 'resourceGroup',
        type: typeof resourceGroup
      });
    }

    if (resourceGroup.trim().length === 0) {
      throw new AzureConfigError('Resource group name cannot be empty', {
        field: 'resourceGroup'
      });
    }

    // Azure resource group naming rules
    if (resourceGroup.length < 1 || resourceGroup.length > 90) {
      throw new AzureConfigError('Resource group name must be 1-90 characters', {
        field: 'resourceGroup',
        length: resourceGroup.length
      });
    }

    // Check for invalid characters
    const validChars = /^[a-zA-Z0-9._()-]*$/;
    if (!validChars.test(resourceGroup)) {
      throw new AzureConfigError('Resource group name contains invalid characters', {
        field: 'resourceGroup',
        provided: resourceGroup,
        allowedChars: 'alphanumeric, periods, underscores, hyphens, parentheses'
      });
    }

    // Cannot end with period
    if (resourceGroup.endsWith('.')) {
      throw new AzureConfigError('Resource group name cannot end with a period', {
        field: 'resourceGroup',
        provided: resourceGroup
      });
    }
  }

  /**
   * Validate query options
   * @param {Object} options - Query options object
   * @throws {AzureConfigError} If validation fails
   */
  static validateQueryOptions(options = {}) {
    if (typeof options !== 'object' || options === null) {
      throw new AzureConfigError('Options must be an object', {
        type: typeof options
      });
    }

    // Validate individual options
    if (options.startDate !== undefined) {
      this.validateDate(options.startDate, 'startDate');
    }

    if (options.endDate !== undefined) {
      this.validateDate(options.endDate, 'endDate');
    }

    if (options.startDate && options.endDate) {
      this.validateDateRange(options.startDate, options.endDate);
    }

    if (options.resourceTypes !== undefined) {
      this.validateResourceTypes(options.resourceTypes);
    }

    if (options.resourceGroup !== undefined) {
      this.validateResourceGroup(options.resourceGroup);
    }
  }

  /**
   * Validate Azure API response
   * @param {Object} response - API response object
   * @param {number} statusCode - HTTP status code
   * @throws {AzureApiError|AzureDataError} If validation fails
   */
  static validateApiResponse(response, statusCode) {
    // Check for HTTP errors
    if (statusCode >= 400) {
      const errorMessage = response?.error?.message || `HTTP ${statusCode} error`;
      const errorCode = response?.error?.code || 'UNKNOWN_ERROR';
      
      if (statusCode === 401 || statusCode === 403) {
        throw new AzureAuthError(`Authentication failed: ${errorMessage}`, {
          statusCode,
          errorCode,
          response
        });
      }

      throw new AzureApiError(errorMessage, statusCode, {
        errorCode,
        response
      });
    }

    // Validate response structure
    if (!response) {
      throw new AzureDataError('Empty response from Azure API');
    }

    if (!response.properties) {
      throw new AzureDataError('Invalid response structure: missing properties', {
        response
      });
    }

    // Cost Management API specific validation
    if (response.properties.rows === undefined) {
      throw new AzureDataError('Invalid response structure: missing data rows', {
        response: response.properties
      });
    }

    if (!Array.isArray(response.properties.rows)) {
      throw new AzureDataError('Invalid response structure: rows is not an array', {
        rowsType: typeof response.properties.rows
      });
    }

    if (!response.properties.columns) {
      throw new AzureDataError('Invalid response structure: missing columns definition', {
        response: response.properties
      });
    }

    if (!Array.isArray(response.properties.columns)) {
      throw new AzureDataError('Invalid response structure: columns is not an array', {
        columnsType: typeof response.properties.columns
      });
    }
  }

  /**
   * Validate environment configuration
   * @param {Object} config - Configuration object
   * @throws {AzureConfigError} If validation fails
   */
  static validateEnvironment(config = {}) {
    const requiredVars = ['AZURE_SUBSCRIPTION_ID'];
    const missingVars = [];

    requiredVars.forEach(varName => {
      if (!config[varName] && !process.env[varName]) {
        missingVars.push(varName);
      }
    });

    if (missingVars.length > 0) {
      throw new AzureConfigError('Missing required environment variables', {
        missing: missingVars,
        required: requiredVars
      });
    }

    // Validate subscription ID if provided
    const subscriptionId = config.AZURE_SUBSCRIPTION_ID || process.env.AZURE_SUBSCRIPTION_ID;
    if (subscriptionId) {
      this.validateSubscriptionId(subscriptionId);
    }

    // Log authentication method
    if (process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET && process.env.AZURE_TENANT_ID) {
      logger.info('Using service principal authentication');
    } else {
      logger.info('Using default Azure credential chain');
    }
  }

  /**
   * Create safe error for logging (removes sensitive data)
   * @param {Error} error - Original error
   * @returns {Object} Safe error object
   */
  static createSafeError(error) {
    const safeError = {
      name: error.name || 'Error',
      message: error.message,
      code: error.code,
      timestamp: error.timestamp || new Date().toISOString()
    };

    // Add safe details
    if (error.details) {
      safeError.details = { ...error.details };
      
      // Remove sensitive information
      delete safeError.details.response;
      delete safeError.details.token;
      delete safeError.details.authorization;
    }

    return safeError;
  }

  /**
   * Wrap async operation with error handling
   * @param {Function} operation - Async operation to wrap
   * @param {string} operationName - Name of the operation for logging
   * @returns {Function} Wrapped operation
   */
  static wrapOperation(operation, operationName) {
    return async (...args) => {
      try {
        logger.debug(`Starting operation: ${operationName}`);
        const result = await operation(...args);
        logger.debug(`Completed operation: ${operationName}`);
        return result;
      } catch (error) {
        const safeError = this.createSafeError(error);
        logger.error(`Operation failed: ${operationName}`, safeError);
        throw error;
      }
    };
  }
}

export default AzureCostValidator;