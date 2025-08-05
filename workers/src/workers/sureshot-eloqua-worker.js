import { LHTaskWorker } from 'littlehorse-client';
import SureshotApiClient from '../services/sureshot-api-client.js';
import CampaignValidator from '../services/campaign-validator.js';
import DataEnrichmentService from '../services/data-enrichment.js';
import config from '../config/index.js';
import { createContextLogger, createTimer } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Little Horse Task Worker for Sureshot Eloqua Campaign Execution
 * Handles campaign creation, list management, and data enrichment
 */
class SureshotEloquaWorker {
  constructor() {
    this.apiClient = new SureshotApiClient();
    this.validator = new CampaignValidator();
    this.dataEnrichment = new DataEnrichmentService();
    this.logger = createContextLogger({ service: 'sureshot-eloqua-worker' });

    // Performance metrics
    this.metrics = {
      totalCampaigns: 0,
      successfulCampaigns: 0,
      failedCampaigns: 0,
      totalLists: 0,
      totalSegments: 0,
      enrichedRecords: 0,
      averageExecutionTime: 0,
      errors: {},
    };

    this.logger.info('Sureshot Eloqua worker initialized', {
      eloquaInstance: config.sureshot.eloquaInstance,
      apiVersion: config.sureshot.apiVersion,
    });
  }

  /**
   * Create and execute Eloqua email campaign
   * @param {Object} campaignSpec - Campaign specification from workflow
   * @param {Object} context - Little Horse execution context
   */
  @LHTaskWorker('create-eloqua-campaign')
  async createEloquaCampaign(campaignSpec, context = {}) {
    const taskId = uuidv4();
    const timer = createTimer('eloqua-campaign-creation');
    const logger = createContextLogger({
      service: 'sureshot-eloqua-worker',
      taskId,
      workflowId: context.wfRunId,
      campaignName: campaignSpec.name,
    });

    logger.taskStart(taskId, context.wfRunId, { 
      campaignType: campaignSpec.type,
      audienceSize: campaignSpec.audience?.size 
    });

    this.metrics.totalCampaigns++;

    try {
      // Step 1: Validate campaign specification
      const validationResult = await this.validator.validateCampaignSpec(campaignSpec);
      if (!validationResult.isValid) {
        throw new Error(`Campaign validation failed: ${validationResult.errors.join(', ')}`);
      }

      // Step 2: Enrich and validate data
      const enrichedSpec = await this.dataEnrichment.enrichCampaignData(campaignSpec);
      
      // Step 3: Create/update lists and segments
      const audienceResult = await this.createAudienceAssets(enrichedSpec, logger);
      
      // Step 4: Create email campaign
      const campaignResult = await this.createEmailCampaign(enrichedSpec, audienceResult, logger);
      
      // Step 5: Configure campaign settings
      const configResult = await this.configureCampaign(campaignResult.campaignId, enrichedSpec, logger);
      
      // Step 6: Execute campaign (if immediate) or schedule
      const executionResult = await this.executeCampaign(
        campaignResult.campaignId, 
        enrichedSpec.execution,
        logger
      );

      const duration = timer.end();
      this.metrics.successfulCampaigns++;
      this._updateMetrics(true, duration);

      const result = {
        success: true,
        campaignId: campaignResult.campaignId,
        eloquaCampaignId: campaignResult.eloquaCampaignId,
        listIds: audienceResult.listIds,
        segmentIds: audienceResult.segmentIds,
        executionStatus: executionResult.status,
        scheduledTime: executionResult.scheduledTime,
        metrics: {
          audienceSize: audienceResult.finalAudienceSize,
          enrichedRecords: enrichedSpec.enrichmentSummary?.recordsEnriched || 0,
          processingTimeMs: duration,
        },
        validation: validationResult,
        taskId,
      };

      logger.taskComplete(taskId, context.wfRunId, result, duration);
      return result;

    } catch (error) {
      const duration = timer.end();
      this.metrics.failedCampaigns++;
      this._updateMetrics(false, duration);
      this._trackError(error);

      logger.taskError(taskId, context.wfRunId, error, duration);

      return {
        success: false,
        error: error.message,
        errorCode: error.code,
        errorType: this._classifyError(error),
        retryable: this._isRetryableError(error),
        campaignSpec: this._sanitizeCampaignSpec(campaignSpec),
        processingTimeMs: duration,
        taskId,
      };
    }
  }

  /**
   * Create and manage audience lists and segments
   * @param {Object} listSpec - List specification from workflow
   * @param {Object} context - Little Horse execution context
   */
  @LHTaskWorker('manage-eloqua-lists')
  async manageEloquaLists(listSpec, context = {}) {
    const taskId = uuidv4();
    const timer = createTimer('eloqua-list-management');
    const logger = createContextLogger({
      service: 'sureshot-eloqua-worker',
      taskId,
      workflowId: context.wfRunId,
      operation: listSpec.operation,
    });

    logger.taskStart(taskId, context.wfRunId, { 
      operation: listSpec.operation,
      listCount: listSpec.lists?.length || 0 
    });

    try {
      const results = [];

      for (const list of listSpec.lists || []) {
        let result;
        
        switch (listSpec.operation) {
          case 'create':
            result = await this.createContactList(list, logger);
            break;
          case 'update':
            result = await this.updateContactList(list, logger);
            break;
          case 'delete':
            result = await this.deleteContactList(list.id, logger);
            break;
          case 'sync':
            result = await this.syncContactList(list, logger);
            break;
          default:
            throw new Error(`Unsupported list operation: ${listSpec.operation}`);
        }

        results.push(result);
        this.metrics.totalLists++;
      }

      const duration = timer.end();
      logger.taskComplete(taskId, context.wfRunId, { results }, duration);

      return {
        success: true,
        operation: listSpec.operation,
        results,
        processingTimeMs: duration,
        taskId,
      };

    } catch (error) {
      const duration = timer.end();
      this._trackError(error);

      logger.taskError(taskId, context.wfRunId, error, duration);

      return {
        success: false,
        error: error.message,
        errorType: this._classifyError(error),
        retryable: this._isRetryableError(error),
        processingTimeMs: duration,
        taskId,
      };
    }
  }

  /**
   * Get campaign execution status and metrics
   * @param {Object} statusRequest - Status request details
   * @param {Object} context - Little Horse execution context
   */
  @LHTaskWorker('get-campaign-status')
  async getCampaignStatus(statusRequest, context = {}) {
    const taskId = uuidv4();
    const timer = createTimer('campaign-status-check');
    const logger = createContextLogger({
      service: 'sureshot-eloqua-worker',
      taskId,
      workflowId: context.wfRunId,
      campaignId: statusRequest.campaignId,
    });

    try {
      // Get basic campaign status
      const campaignStatus = await this.apiClient.getCampaignStatus(statusRequest.campaignId);
      
      // Get detailed metrics if campaign is active/completed
      let metrics = null;
      if (['active', 'completed', 'paused'].includes(campaignStatus.status)) {
        metrics = await this.apiClient.getCampaignMetrics(statusRequest.campaignId);
      }

      // Get execution history
      const executionHistory = await this.apiClient.getCampaignExecutionHistory(statusRequest.campaignId);

      const duration = timer.end();
      
      const result = {
        success: true,
        campaignId: statusRequest.campaignId,
        status: campaignStatus.status,
        eloquaStatus: campaignStatus.eloquaStatus,
        metrics: metrics ? {
          sent: metrics.emailsSent,
          delivered: metrics.emailsDelivered,
          opened: metrics.emailsOpened,
          clicked: metrics.emailsClicked,
          bounced: metrics.emailsBounced,
          unsubscribed: metrics.unsubscriptions,
          openRate: metrics.openRate,
          clickRate: metrics.clickRate,
          bounceRate: metrics.bounceRate,
        } : null,
        executionHistory,
        lastUpdated: campaignStatus.lastUpdated,
        processingTimeMs: duration,
        taskId,
      };

      logger.taskComplete(taskId, context.wfRunId, result, duration);
      return result;

    } catch (error) {
      const duration = timer.end();
      this._trackError(error);

      logger.taskError(taskId, context.wfRunId, error, duration);

      return {
        success: false,
        error: error.message,
        errorType: this._classifyError(error),
        retryable: this._isRetryableError(error),
        campaignId: statusRequest.campaignId,
        processingTimeMs: duration,
        taskId,
      };
    }
  }

  /**
   * Create audience assets (lists and segments)
   * @private
   */
  async createAudienceAssets(campaignSpec, logger) {
    const results = {
      listIds: [],
      segmentIds: [],
      finalAudienceSize: 0,
    };

    logger.info('Creating audience assets', {
      listsToCreate: campaignSpec.audience?.lists?.length || 0,
      segmentsToCreate: campaignSpec.audience?.segments?.length || 0,
    });

    // Create contact lists
    if (campaignSpec.audience?.lists) {
      for (const listSpec of campaignSpec.audience.lists) {
        const list = await this.createContactList(listSpec, logger);
        results.listIds.push(list.id);
        results.finalAudienceSize += list.contactCount;
      }
    }

    // Create segments
    if (campaignSpec.audience?.segments) {
      for (const segmentSpec of campaignSpec.audience.segments) {
        const segment = await this.createContactSegment(segmentSpec, logger);
        results.segmentIds.push(segment.id);
        results.finalAudienceSize += segment.contactCount;
      }
    }

    logger.info('Audience assets created', {
      listIds: results.listIds,
      segmentIds: results.segmentIds,
      totalAudienceSize: results.finalAudienceSize,
    });

    return results;
  }

  /**
   * Create email campaign in Eloqua
   * @private
   */
  async createEmailCampaign(campaignSpec, audienceResult, logger) {
    logger.info('Creating Eloqua email campaign', {
      campaignName: campaignSpec.name,
      template: campaignSpec.email?.templateId,
    });

    const campaignData = {
      name: campaignSpec.name,
      description: campaignSpec.description,
      type: 'Email',
      folderId: campaignSpec.folderId || config.sureshot.defaultFolderId,
      email: {
        name: campaignSpec.email.name,
        subject: campaignSpec.email.subject,
        htmlContent: campaignSpec.email.htmlContent,
        textContent: campaignSpec.email.textContent,
        fromName: campaignSpec.email.fromName,
        fromAddress: campaignSpec.email.fromAddress,
        replyToAddress: campaignSpec.email.replyToAddress,
        templateId: campaignSpec.email.templateId,
      },
      audienceListIds: audienceResult.listIds,
      audienceSegmentIds: audienceResult.segmentIds,
    };

    const campaign = await this.apiClient.createEmailCampaign(campaignData);
    
    logger.info('Eloqua email campaign created', {
      campaignId: campaign.id,
      eloquaCampaignId: campaign.eloquaId,
    });

    return {
      campaignId: campaign.id,
      eloquaCampaignId: campaign.eloquaId,
    };
  }

  /**
   * Configure campaign settings
   * @private
   */
  async configureCampaign(campaignId, campaignSpec, logger) {
    logger.info('Configuring campaign settings', { campaignId });

    const settings = {
      trackingSettings: {
        enableOpening: campaignSpec.tracking?.enableOpening !== false,
        enableClicking: campaignSpec.tracking?.enableClicking !== false,
        enableBounces: campaignSpec.tracking?.enableBounces !== false,
        enableUnsubscribes: campaignSpec.tracking?.enableUnsubscribes !== false,
      },
      deliverySettings: {
        throttleEnabled: campaignSpec.delivery?.throttleEnabled || false,
        throttleLimit: campaignSpec.delivery?.throttleLimit || 1000,
        throttlePeriod: campaignSpec.delivery?.throttlePeriod || 'hour',
      },
      complianceSettings: {
        respectGlobalUnsubscribes: true,
        respectOptOutLists: true,
        includeUnsubscribeLink: true,
        includeViewWebPageLink: campaignSpec.compliance?.includeViewWebPageLink !== false,
      },
    };

    await this.apiClient.updateCampaignSettings(campaignId, settings);
    
    logger.info('Campaign settings configured', { campaignId, settings });
    
    return { success: true, settings };
  }

  /**
   * Execute or schedule campaign
   * @private
   */
  async executeCampaign(campaignId, executionSpec, logger) {
    logger.info('Executing campaign', {
      campaignId,
      executionType: executionSpec?.type || 'immediate',
    });

    let result;

    switch (executionSpec?.type) {
      case 'immediate':
        result = await this.apiClient.executeCampaignImmediate(campaignId);
        break;
      case 'scheduled':
        result = await this.apiClient.scheduleCampaign(campaignId, executionSpec.scheduledTime);
        break;
      case 'triggered':
        result = await this.apiClient.setupTriggeredCampaign(campaignId, executionSpec.triggers);
        break;
      default:
        // Default to immediate execution
        result = await this.apiClient.executeCampaignImmediate(campaignId);
    }

    logger.info('Campaign execution configured', {
      campaignId,
      status: result.status,
      scheduledTime: result.scheduledTime,
    });

    return result;
  }

  /**
   * Create contact list
   * @private
   */
  async createContactList(listSpec, logger) {
    logger.info('Creating contact list', { listName: listSpec.name });

    const listData = {
      name: listSpec.name,
      description: listSpec.description,
      folderId: listSpec.folderId || config.sureshot.defaultFolderId,
      dataSource: listSpec.dataSource,
      criteria: listSpec.criteria,
      contacts: listSpec.contacts,
    };

    const list = await this.apiClient.createContactList(listData);
    
    // Enrich contacts if specified
    if (listSpec.enrichContacts && list.contactCount > 0) {
      await this.dataEnrichment.enrichContactList(list.id);
      this.metrics.enrichedRecords += list.contactCount;
    }

    logger.info('Contact list created', {
      listId: list.id,
      contactCount: list.contactCount,
    });

    return list;
  }

  /**
   * Create contact segment
   * @private
   */
  async createContactSegment(segmentSpec, logger) {
    logger.info('Creating contact segment', { segmentName: segmentSpec.name });

    const segmentData = {
      name: segmentSpec.name,
      description: segmentSpec.description,
      folderId: segmentSpec.folderId || config.sureshot.defaultFolderId,
      criteria: segmentSpec.criteria,
      sourceListIds: segmentSpec.sourceListIds,
    };

    const segment = await this.apiClient.createContactSegment(segmentData);
    this.metrics.totalSegments++;

    logger.info('Contact segment created', {
      segmentId: segment.id,
      contactCount: segment.contactCount,
    });

    return segment;
  }

  /**
   * Update contact list
   * @private
   */
  async updateContactList(listSpec, logger) {
    logger.info('Updating contact list', { listId: listSpec.id });

    const updates = {
      name: listSpec.name,
      description: listSpec.description,
      criteria: listSpec.criteria,
    };

    if (listSpec.addContacts) {
      updates.addContacts = listSpec.addContacts;
    }

    if (listSpec.removeContacts) {
      updates.removeContacts = listSpec.removeContacts;
    }

    const result = await this.apiClient.updateContactList(listSpec.id, updates);

    logger.info('Contact list updated', {
      listId: listSpec.id,
      updatedContactCount: result.contactCount,
    });

    return result;
  }

  /**
   * Delete contact list
   * @private
   */
  async deleteContactList(listId, logger) {
    logger.info('Deleting contact list', { listId });

    await this.apiClient.deleteContactList(listId);

    logger.info('Contact list deleted', { listId });

    return { success: true, listId };
  }

  /**
   * Sync contact list with external data source
   * @private
   */
  async syncContactList(listSpec, logger) {
    logger.info('Syncing contact list', { listId: listSpec.id });

    const syncResult = await this.apiClient.syncContactList(listSpec.id, {
      dataSource: listSpec.dataSource,
      syncMode: listSpec.syncMode || 'incremental',
      fieldMappings: listSpec.fieldMappings,
    });

    logger.info('Contact list synced', {
      listId: listSpec.id,
      recordsProcessed: syncResult.recordsProcessed,
      recordsAdded: syncResult.recordsAdded,
      recordsUpdated: syncResult.recordsUpdated,
    });

    return syncResult;
  }

  /**
   * Classify error type for better handling
   * @private
   */
  _classifyError(error) {
    if (error.code === 'RATE_LIMIT_EXCEEDED') return 'rate_limit';
    if (error.code === 'VALIDATION_ERROR') return 'validation';
    if (error.code === 'AUTHENTICATION_ERROR') return 'authentication';
    if (error.code === 'ELOQUA_API_ERROR') return 'eloqua_api';
    if (error.code === 'NETWORK_ERROR') return 'network';
    if (error.code === 'TIMEOUT_ERROR') return 'timeout';
    return 'unknown';
  }

  /**
   * Check if error is retryable
   * @private
   */
  _isRetryableError(error) {
    const retryableTypes = ['rate_limit', 'network', 'timeout', 'eloqua_api'];
    return retryableTypes.includes(this._classifyError(error));
  }

  /**
   * Track error for metrics
   * @private
   */
  _trackError(error) {
    const errorType = this._classifyError(error);
    this.metrics.errors[errorType] = (this.metrics.errors[errorType] || 0) + 1;
  }

  /**
   * Update performance metrics
   * @private
   */
  _updateMetrics(success, duration) {
    // Update rolling average execution time
    const totalExecutions = this.metrics.successfulCampaigns + this.metrics.failedCampaigns;
    const totalTime = this.metrics.averageExecutionTime * (totalExecutions - 1) + duration;
    this.metrics.averageExecutionTime = totalTime / totalExecutions;
  }

  /**
   * Sanitize campaign spec for logging (remove sensitive data)
   * @private
   */
  _sanitizeCampaignSpec(campaignSpec) {
    const sanitized = { ...campaignSpec };
    
    // Remove sensitive information
    if (sanitized.email?.htmlContent) {
      sanitized.email.htmlContent = `[${sanitized.email.htmlContent.length} chars]`;
    }
    if (sanitized.audience?.contacts) {
      sanitized.audience.contacts = `[${sanitized.audience.contacts.length} contacts]`;
    }

    return sanitized;
  }

  /**
   * Get worker health status
   */
  getHealthStatus() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      metrics: this.metrics,
      services: {
        apiClient: this.apiClient.getHealthStatus(),
        validator: this.validator.getHealthStatus(),
        dataEnrichment: this.dataEnrichment.getHealthStatus(),
      },
      eloqua: {
        connected: this.apiClient.isConnected(),
        instance: config.sureshot.eloquaInstance,
        apiVersion: config.sureshot.apiVersion,
      },
    };
  }

  /**
   * Shutdown worker gracefully
   */
  async shutdown() {
    this.logger.info('Shutting down Sureshot Eloqua worker');

    try {
      await Promise.all([
        this.apiClient.shutdown(),
        this.dataEnrichment.shutdown(),
      ]);

      this.logger.info('Sureshot Eloqua worker shutdown complete', {
        totalCampaigns: this.metrics.totalCampaigns,
        successRate: this.metrics.totalCampaigns > 0 
          ? (this.metrics.successfulCampaigns / this.metrics.totalCampaigns) * 100 
          : 0,
      });
    } catch (error) {
      this.logger.error('Error during shutdown', { error: error.message });
    }
  }
}

export default SureshotEloquaWorker;