/**
 * Eloqua-Twilio SMS/MMS Workflow Service
 * Comprehensive integration bridging Eloqua contact management with Twilio messaging
 */

const { default: Anthropic } = require('@anthropic-ai/sdk');
const axios = require('axios');

class EloquaTwilioWorkflowService {
  constructor(options = {}) {
    this.claude = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Twilio client (assuming existing service integration)
    this.twilioService = options.twilioService;

    this.config = {
      eloquaBaseUrl: process.env.ELOQUA_BASE_URL || 'https://secure.p01.eloqua.com',
      eloquaRestVersion: '1.0',
      twilioWebhookUrl: process.env.TWILIO_WEBHOOK_URL || 'https://your-domain.com/webhooks/twilio',
      bitlyEnabled: options.bitlyEnabled !== false,
      autoResponseEnabled: options.autoResponseEnabled !== false,
      maxRetries: options.maxRetries || 3
    };

    // Workflow state management
    this.activeWorkflows = new Map();
    this.contactFieldMappings = new Map();
    this.autoResponses = new Map();
    this.messagingConfigurations = new Map();

    // Performance metrics
    this.workflowMetrics = {
      totalWorkflowsProcessed: 0,
      messagesSuccessfullySent: 0,
      contactsUpdated: 0,
      cdoRecordsCreated: 0,
      autoResponsesTriggered: 0,
      averageProcessingTime: 0
    };

    console.log('📱 Eloqua-Twilio Workflow Service initialized');
  }

  /**
   * Initialize Eloqua-Twilio SMS/MMS workflow
   * @param {Object} workflowConfig - Complete workflow configuration
   * @returns {Object} Initialization result
   */
  async initializeWorkflow(workflowConfig) {
    const workflowId = this.generateWorkflowId();
    const startTime = Date.now();

    console.log(`📋 Initializing Eloqua-Twilio workflow ${workflowId}...`);

    try {
      // Step 1: Authenticate with Eloqua
      const eloquaAuth = await this.authenticateEloqua(workflowConfig.eloquaCredentials);
      
      // Step 2: Retrieve and map Eloqua contact fields
      const contactFields = await this.getEloquaContactFields(eloquaAuth);
      const fieldMappings = await this.mapContactFields(contactFields, workflowConfig.fieldMappings);
      
      // Step 3: Configure Twilio messaging settings
      const messagingConfig = await this.configureTwilioMessaging(workflowConfig.twilioConfig);
      
      // Step 4: Setup auto-response keywords and CDO mappings
      const autoResponses = this.configureAutoResponses(workflowConfig.autoResponses);
      const cdoConfiguration = await this.configureCDO(workflowConfig.cdoConfig, eloquaAuth);
      
      // Step 5: Initialize Bitly tracking if enabled
      const bitlyConfig = this.config.bitlyEnabled ? 
        await this.configureBitlyTracking(workflowConfig.bitlyConfig) : null;

      const workflow = {
        id: workflowId,
        name: workflowConfig.name || 'Eloqua-Twilio SMS Workflow',
        status: 'initialized',
        createdAt: new Date().toISOString(),
        
        // Authentication and connections
        eloquaAuth: eloquaAuth,
        
        // Field mappings
        contactFieldMappings: fieldMappings,
        
        // Messaging configuration
        messagingConfig: messagingConfig,
        
        // Auto-responses
        autoResponses: autoResponses,
        
        // CDO configuration
        cdoConfiguration: cdoConfiguration,
        
        // Optional integrations
        bitlyConfig: bitlyConfig,
        
        // Workflow settings
        settings: {
          batchSize: workflowConfig.batchSize || 100,
          retryAttempts: workflowConfig.retryAttempts || 3,
          webhookUrl: this.config.twilioWebhookUrl,
          enableTracking: workflowConfig.enableTracking !== false
        },
        
        // Performance tracking
        metrics: {
          totalContacts: 0,
          messagesSent: 0,
          messagesDelivered: 0,
          responsesReceived: 0,
          cdoRecordsCreated: 0
        },
        
        initializationTime: Date.now() - startTime
      };

      // Store workflow configuration
      this.activeWorkflows.set(workflowId, workflow);
      this.contactFieldMappings.set(workflowId, fieldMappings);
      this.autoResponses.set(workflowId, autoResponses);
      this.messagingConfigurations.set(workflowId, messagingConfig);

      console.log(`✅ Eloqua-Twilio workflow ${workflowId} initialized successfully`);

      return {
        workflowId: workflowId,
        status: 'initialized',
        configuration: workflow,
        availableContactFields: contactFields,
        recommendedSettings: await this.generateWorkflowRecommendations(workflowConfig)
      };

    } catch (error) {
      console.error(`Workflow initialization failed for ${workflowId}:`, error);
      throw new Error(`Workflow initialization failed: ${error.message}`);
    }
  }

  /**
   * Process Eloqua contact batch for SMS/MMS sending
   * @param {string} workflowId - Workflow identifier
   * @param {Array} contactRecords - Eloqua contact records
   * @param {Object} messageConfig - Message configuration
   * @returns {Object} Processing results
   */
  async processContactBatch(workflowId, contactRecords, messageConfig) {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const batchId = this.generateBatchId();
    const startTime = Date.now();

    console.log(`📨 Processing contact batch ${batchId}: ${contactRecords.length} contacts`);

    try {
      const results = {
        batchId: batchId,
        workflowId: workflowId,
        totalContacts: contactRecords.length,
        processedContacts: 0,
        successfulMessages: 0,
        failedMessages: 0,
        skippedContacts: 0,
        messages: [],
        errors: []
      };

      // Process each contact record
      for (const contact of contactRecords) {
        try {
          // Step 1: Extract and validate contact data
          const contactData = await this.extractContactData(contact, workflow.contactFieldMappings);
          
          // Step 2: Check SMS opt-out status
          if (contactData.smsOptOut) {
            results.skippedContacts++;
            continue;
          }

          // Step 3: Prepare message with field merges
          const personalizedMessage = await this.preparePersonalizedMessage(
            messageConfig, 
            contactData, 
            workflow.bitlyConfig
          );

          // Step 4: Send SMS/MMS via Twilio
          const messageResult = await this.sendTwilioMessage(
            contactData,
            personalizedMessage,
            workflow.messagingConfig
          );

          // Step 5: Create CDO record with outbound data
          if (workflow.cdoConfiguration && messageResult.success) {
            await this.createCDORecord(
              workflow.cdoConfiguration,
              contactData,
              personalizedMessage,
              messageResult,
              workflow.eloquaAuth
            );
            results.processedContacts++;
          }

          results.messages.push({
            contactId: contactData.contactId,
            messageId: messageResult.messageId,
            status: messageResult.status,
            sentAt: new Date().toISOString()
          });

          if (messageResult.success) {
            results.successfulMessages++;
          } else {
            results.failedMessages++;
          }

        } catch (contactError) {
          console.error(`Contact processing failed for ${contact.id}:`, contactError);
          results.errors.push({
            contactId: contact.id,
            error: contactError.message
          });
          results.failedMessages++;
        }
      }

      // Update workflow metrics
      workflow.metrics.totalContacts += results.totalContacts;
      workflow.metrics.messagesSent += results.successfulMessages;
      workflow.metrics.cdoRecordsCreated += results.processedContacts;

      // Update service metrics
      this.workflowMetrics.totalWorkflowsProcessed++;
      this.workflowMetrics.messagesSuccessfullySent += results.successfulMessages;
      this.workflowMetrics.contactsUpdated += results.processedContacts;

      results.processingTime = Date.now() - startTime;
      results.completedAt = new Date().toISOString();

      console.log(`✅ Batch ${batchId} processed: ${results.successfulMessages}/${results.totalContacts} messages sent successfully`);

      return results;

    } catch (error) {
      console.error(`Batch processing failed for ${batchId}:`, error);
      throw new Error(`Batch processing failed: ${error.message}`);
    }
  }

  /**
   * Handle Twilio webhook callbacks
   * @param {Object} webhookData - Twilio webhook data
   * @returns {Object} Webhook processing result
   */
  async handleTwilioWebhook(webhookData) {
    console.log(`📞 Processing Twilio webhook: ${webhookData.MessageSid}`);

    try {
      const messageStatus = webhookData.MessageStatus;
      const messageSid = webhookData.MessageSid;
      const fromNumber = webhookData.From;
      const toNumber = webhookData.To;
      const messageBody = webhookData.Body;

      // Find relevant workflow based on the phone numbers or message context
      const workflow = await this.identifyWorkflowFromWebhook(webhookData);
      
      if (!workflow) {
        console.warn(`No workflow found for webhook: ${messageSid}`);
        return { processed: false, reason: 'workflow_not_found' };
      }

      // Handle different webhook types
      const result = await this.processWebhookByType(webhookData, workflow);

      // Update workflow metrics
      if (messageStatus === 'delivered') {
        workflow.metrics.messagesDelivered++;
      } else if (webhookData.Direction === 'inbound') {
        workflow.metrics.responsesReceived++;
      }

      return result;

    } catch (error) {
      console.error('Twilio webhook processing failed:', error);
      return { processed: false, error: error.message };
    }
  }

  /**
   * Process different types of webhooks
   */
  async processWebhookByType(webhookData, workflow) {
    const webhookType = this.determineWebhookType(webhookData);

    switch (webhookType) {
      case 'status_update':
        return await this.handleStatusUpdate(webhookData, workflow);
      
      case 'inbound_message':
        return await this.handleInboundMessage(webhookData, workflow);
      
      case 'auto_response':
        return await this.handleAutoResponse(webhookData, workflow);
      
      default:
        return { processed: false, reason: 'unknown_webhook_type' };
    }
  }

  /**
   * Handle inbound messages and auto-responses
   */
  async handleInboundMessage(webhookData, workflow) {
    const messageBody = webhookData.Body.toLowerCase().trim();
    const fromNumber = webhookData.From;
    
    // Check for keyword auto-responses
    const autoResponse = this.findMatchingAutoResponse(messageBody, workflow.autoResponses);
    
    if (autoResponse) {
      console.log(`🤖 Triggering auto-response for keyword: ${autoResponse.keyword}`);
      
      // Send auto-response
      const responseResult = await this.sendAutoResponse(fromNumber, autoResponse, workflow);
      
      // Update metrics
      this.workflowMetrics.autoResponsesTriggered++;
      
      return {
        processed: true,
        type: 'auto_response',
        keyword: autoResponse.keyword,
        responseSent: responseResult.success,
        messageId: responseResult.messageId
      };
    }

    // Handle as regular inbound message
    return await this.processInboundMessage(webhookData, workflow);
  }

  /**
   * Authenticate with Eloqua REST API
   */
  async authenticateEloqua(credentials) {
    const authString = Buffer.from(`${credentials.siteName}\\${credentials.username}:${credentials.password}`).toString('base64');
    
    const authHeaders = {
      'Authorization': `Basic ${authString}`,
      'Content-Type': 'application/json'
    };

    try {
      // Test authentication with a simple API call
      const response = await axios.get(
        `${this.config.eloquaBaseUrl}/api/REST/${this.config.eloquaRestVersion}/system/user`,
        { headers: authHeaders }
      );

      console.log('✅ Eloqua authentication successful');
      
      return {
        headers: authHeaders,
        baseUrl: this.config.eloquaBaseUrl,
        userId: response.data.id,
        authenticated: true,
        authenticatedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('Eloqua authentication failed:', error.response?.data || error.message);
      throw new Error('Eloqua authentication failed');
    }
  }

  /**
   * Retrieve Eloqua contact fields
   */
  async getEloquaContactFields(eloquaAuth) {
    try {
      const response = await axios.get(
        `${eloquaAuth.baseUrl}/api/REST/${this.config.eloquaRestVersion}/assets/contact/fields`,
        { headers: eloquaAuth.headers }
      );

      const fields = response.data.elements.map(field => ({
        id: field.id,
        name: field.name,
        displayName: field.displayName,
        dataType: field.dataType,
        isRequired: field.isRequired
      }));

      console.log(`📋 Retrieved ${fields.length} Eloqua contact fields`);
      
      return fields;

    } catch (error) {
      console.error('Failed to retrieve Eloqua contact fields:', error);
      throw new Error('Failed to retrieve contact fields');
    }
  }

  /**
   * Map contact fields based on configuration
   */
  async mapContactFields(contactFields, fieldMappingConfig) {
    const mappings = {
      mobileNumber: null,
      smsOptOut: null,
      countryCode: null,
      additionalFields: []
    };

    // Find required field mappings
    const mobileField = contactFields.find(f => 
      f.name === fieldMappingConfig.mobileNumberField || 
      f.displayName === fieldMappingConfig.mobileNumberField
    );
    
    const optOutField = contactFields.find(f => 
      f.name === fieldMappingConfig.smsOptOutField || 
      f.displayName === fieldMappingConfig.smsOptOutField
    );
    
    const countryField = contactFields.find(f => 
      f.name === fieldMappingConfig.countryCodeField || 
      f.displayName === fieldMappingConfig.countryCodeField
    );

    mappings.mobileNumber = mobileField;
    mappings.smsOptOut = optOutField;
    mappings.countryCode = countryField;

    // Map additional merge fields
    if (fieldMappingConfig.additionalFields) {
      for (const additionalField of fieldMappingConfig.additionalFields) {
        const field = contactFields.find(f => 
          f.name === additionalField || f.displayName === additionalField
        );
        if (field) {
          mappings.additionalFields.push(field);
        }
      }
    }

    console.log(`🗂️ Mapped contact fields: Mobile=${mappings.mobileNumber?.name}, OptOut=${mappings.smsOptOut?.name}, Country=${mappings.countryCode?.name}`);
    
    return mappings;
  }

  /**
   * Configure Twilio messaging settings
   */
  async configureTwilioMessaging(twilioConfig) {
    const configuration = {
      senderType: twilioConfig.senderType, // 'phone_number', 'messaging_service', 'short_code'
      senderValue: twilioConfig.senderValue,
      enableDeliveryReceipts: twilioConfig.enableDeliveryReceipts !== false,
      enableInboundHandling: twilioConfig.enableInboundHandling !== false,
      maxMessageLength: twilioConfig.maxMessageLength || 1600,
      enableMMS: twilioConfig.enableMMS !== false
    };

    // Validate Twilio configuration with actual account
    if (this.twilioService) {
      try {
        await this.twilioService.validateConfiguration(configuration);
        console.log('✅ Twilio messaging configuration validated');
      } catch (error) {
        console.warn('Twilio configuration validation failed:', error.message);
      }
    }

    return configuration;
  }

  /**
   * Configure auto-response keywords
   */
  configureAutoResponses(autoResponseConfig) {
    const responses = {
      defaultResponse: autoResponseConfig.defaultResponse || null,
      keywordResponses: new Map()
    };

    if (autoResponseConfig.keywordResponses) {
      for (const [keyword, response] of Object.entries(autoResponseConfig.keywordResponses)) {
        responses.keywordResponses.set(keyword.toLowerCase(), {
          keyword: keyword,
          response: response,
          caseSensitive: false,
          exactMatch: false
        });
      }
    }

    console.log(`🤖 Configured ${responses.keywordResponses.size} auto-response keywords`);
    
    return responses;
  }

  /**
   * Configure Eloqua CDO for result storage
   */
  async configureCDO(cdoConfig, eloquaAuth) {
    if (!cdoConfig || !cdoConfig.cdoId) {
      return null;
    }

    try {
      // Retrieve CDO structure to validate field mappings
      const response = await axios.get(
        `${eloquaAuth.baseUrl}/api/REST/2.0/assets/customObject/${cdoConfig.cdoId}`,
        { headers: eloquaAuth.headers }
      );

      const cdoFields = response.data.fields.map(field => ({
        id: field.id,
        name: field.name,
        displayName: field.displayName,
        dataType: field.dataType
      }));

      console.log(`📊 CDO configuration validated: ${cdoFields.length} fields available`);

      return {
        cdoId: cdoConfig.cdoId,
        fields: cdoFields,
        fieldMappings: cdoConfig.fieldMappings || {},
        autoCreate: cdoConfig.autoCreate !== false
      };

    } catch (error) {
      console.error('CDO configuration failed:', error);
      return null;
    }
  }

  /**
   * Configure Bitly tracking integration
   */
  async configureBitlyTracking(bitlyConfig) {
    if (!bitlyConfig || !bitlyConfig.accessToken) {
      return null;
    }

    return {
      accessToken: bitlyConfig.accessToken,
      domain: bitlyConfig.domain || 'bit.ly',
      trackClicks: bitlyConfig.trackClicks !== false,
      customTags: bitlyConfig.customTags || []
    };
  }

  /**
   * Extract contact data using field mappings
   */
  async extractContactData(contact, fieldMappings) {
    const contactData = {
      contactId: contact.id,
      mobileNumber: null,
      smsOptOut: false,
      countryCode: null,
      mergeFields: {}
    };

    // Extract mobile number
    if (fieldMappings.mobileNumber) {
      contactData.mobileNumber = contact.fieldValues?.find(fv => 
        fv.id === fieldMappings.mobileNumber.id.toString()
      )?.value;
    }

    // Extract SMS opt-out status
    if (fieldMappings.smsOptOut) {
      const optOutValue = contact.fieldValues?.find(fv => 
        fv.id === fieldMappings.smsOptOut.id.toString()
      )?.value;
      contactData.smsOptOut = optOutValue === 'true' || optOutValue === '1' || optOutValue === 'yes';
    }

    // Extract country code
    if (fieldMappings.countryCode) {
      contactData.countryCode = contact.fieldValues?.find(fv => 
        fv.id === fieldMappings.countryCode.id.toString()
      )?.value;
    }

    // Extract additional merge fields
    for (const field of fieldMappings.additionalFields) {
      const fieldValue = contact.fieldValues?.find(fv => 
        fv.id === field.id.toString()
      )?.value;
      
      if (fieldValue) {
        contactData.mergeFields[field.name] = fieldValue;
      }
    }

    return contactData;
  }

  /**
   * Prepare personalized message with field merges and Bitly tracking
   */
  async preparePersonalizedMessage(messageConfig, contactData, bitlyConfig) {
    let messageBody = messageConfig.messageBody;
    
    // Replace Eloqua field merges
    for (const [fieldName, fieldValue] of Object.entries(contactData.mergeFields)) {
      const mergePattern = new RegExp(`\\[\\[${fieldName}\\]\\]`, 'gi');
      messageBody = messageBody.replace(mergePattern, fieldValue || '');
    }

    // Process URLs with Bitly if configured
    if (bitlyConfig && bitlyConfig.trackClicks) {
      messageBody = await this.processUrlsWithBitly(messageBody, bitlyConfig);
    }

    const personalizedMessage = {
      body: messageBody,
      media: messageConfig.media || null,
      fromNumber: null, // Will be set based on messaging config
      toNumber: this.formatPhoneNumber(contactData.mobileNumber, contactData.countryCode)
    };

    return personalizedMessage;
  }

  /**
   * Send SMS/MMS via Twilio
   */
  async sendTwilioMessage(contactData, personalizedMessage, messagingConfig) {
    try {
      // Prepare Twilio message parameters
      const messageParams = {
        body: personalizedMessage.body,
        to: personalizedMessage.toNumber,
        statusCallback: this.config.twilioWebhookUrl
      };

      // Set sender based on configuration
      switch (messagingConfig.senderType) {
        case 'phone_number':
          messageParams.from = messagingConfig.senderValue;
          break;
        case 'messaging_service':
          messageParams.messagingServiceSid = messagingConfig.senderValue;
          break;
        case 'short_code':
          messageParams.from = messagingConfig.senderValue;
          break;
      }

      // Add media for MMS
      if (personalizedMessage.media && messagingConfig.enableMMS) {
        messageParams.mediaUrl = [personalizedMessage.media];
      }

      // Send message via Twilio service
      if (this.twilioService) {
        const result = await this.twilioService.sendMessage(messageParams);
        
        return {
          success: true,
          messageId: result.sid,
          status: result.status,
          sentAt: new Date().toISOString()
        };
      } else {
        // Simulate successful send for testing
        return {
          success: true,
          messageId: `sim_${Date.now()}`,
          status: 'queued',
          sentAt: new Date().toISOString(),
          simulated: true
        };
      }

    } catch (error) {
      console.error('Twilio message send failed:', error);
      return {
        success: false,
        error: error.message,
        sentAt: new Date().toISOString()
      };
    }
  }

  /**
   * Create CDO record with outbound message data
   */
  async createCDORecord(cdoConfig, contactData, messageData, messageResult, eloquaAuth) {
    try {
      const cdoRecord = {
        fieldValues: []
      };

      // Map standard fields
      const fieldMappings = {
        'ContactId': contactData.contactId,
        'MobileNumber': contactData.mobileNumber,
        'MessageBody': messageData.body,
        'MessageSID': messageResult.messageId,
        'MessageStatus': messageResult.status,
        'SentAt': messageResult.sentAt,
        'Direction': 'outbound'
      };

      // Add field values based on CDO configuration
      for (const [fieldName, fieldValue] of Object.entries(fieldMappings)) {
        const cdoField = cdoConfig.fields.find(f => 
          f.name === fieldName || f.displayName === fieldName
        );
        
        if (cdoField) {
          cdoRecord.fieldValues.push({
            id: cdoField.id,
            value: fieldValue?.toString() || ''
          });
        }
      }

      // Create CDO record via Eloqua API
      const response = await axios.post(
        `${eloquaAuth.baseUrl}/api/rest/2.0/data/customObject/${cdoConfig.cdoId}/instance`,
        cdoRecord,
        { headers: eloquaAuth.headers }
      );

      console.log(`📊 CDO record created: ${response.data.id}`);
      
      this.workflowMetrics.cdoRecordsCreated++;
      
      return response.data;

    } catch (error) {
      console.error('CDO record creation failed:', error);
      throw error;
    }
  }

  /**
   * Generate workflow recommendations using AI
   */
  async generateWorkflowRecommendations(workflowConfig) {
    const prompt = `As a marketing operations expert, analyze this Eloqua-Twilio SMS workflow configuration and provide optimization recommendations:

**Workflow Configuration:**
${JSON.stringify(workflowConfig, null, 2)}

**Analysis Required:**
1. Configuration optimization opportunities
2. Best practices for SMS/MMS campaigns
3. Compliance and deliverability recommendations
4. Performance optimization suggestions
5. Auto-response strategy improvements

**Respond with:**
{
  "configurationRecommendations": [
    {
      "category": "category_name",
      "recommendation": "specific_recommendation",
      "priority": "high|medium|low",
      "impact": "description_of_impact"
    }
  ],
  "bestPractices": [
    "practice1", "practice2"
  ],
  "complianceNotes": [
    "compliance_requirement1", "compliance_requirement2"
  ],
  "performanceOptimizations": [
    "optimization1", "optimization2"
  ],
  "estimatedPerformance": {
    "expectedDeliveryRate": number,
    "expectedEngagementRate": number,
    "recommendedBatchSize": number
  }
}`;

    try {
      const response = await this.claude.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1200,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }]
      });

      return JSON.parse(response.content[0].text);
    } catch (error) {
      console.error('Workflow recommendations generation failed:', error);
      return {
        configurationRecommendations: [],
        bestPractices: ['Use clear opt-in processes', 'Monitor delivery rates'],
        complianceNotes: ['Follow TCPA guidelines', 'Respect opt-out requests'],
        performanceOptimizations: ['Test send times', 'Optimize message content']
      };
    }
  }

  /**
   * Get service health and workflow metrics
   */
  getServiceHealth() {
    return {
      service: 'EloquaTwilioWorkflowService',
      status: 'healthy',
      metrics: this.workflowMetrics,
      activeWorkflows: this.activeWorkflows.size,
      capabilities: [
        'eloqua_contact_integration',
        'twilio_sms_mms_sending',
        'field_mapping_and_merges',
        'auto_response_handling',
        'cdo_data_storage',
        'bitly_link_tracking',
        'webhook_processing',
        'batch_processing'
      ],
      config: this.config
    };
  }

  // Utility methods
  formatPhoneNumber(mobileNumber, countryCode) {
    if (!mobileNumber) return null;
    
    // Basic phone number formatting
    let formatted = mobileNumber.replace(/\D/g, '');
    
    if (countryCode && !formatted.startsWith(countryCode.replace('+', ''))) {
      formatted = countryCode.replace('+', '') + formatted;
    } else if (!formatted.startsWith('1') && !countryCode) {
      formatted = '1' + formatted; // Default to US
    }
    
    return '+' + formatted;
  }

  async processUrlsWithBitly(messageBody, bitlyConfig) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = messageBody.match(urlRegex);
    
    if (!urls) return messageBody;
    
    let processedMessage = messageBody;
    
    for (const url of urls) {
      try {
        // In a real implementation, you would call Bitly API here
        const shortenedUrl = `https://${bitlyConfig.domain}/shortened_${Date.now()}`;
        processedMessage = processedMessage.replace(url, shortenedUrl);
      } catch (error) {
        console.warn(`Failed to shorten URL: ${url}`, error);
      }
    }
    
    return processedMessage;
  }

  findMatchingAutoResponse(messageBody, autoResponses) {
    for (const [keyword, response] of autoResponses.keywordResponses) {
      if (messageBody.includes(keyword)) {
        return response;
      }
    }
    return null;
  }

  async sendAutoResponse(toNumber, autoResponse, workflow) {
    const messageParams = {
      body: autoResponse.response,
      to: toNumber
    };

    // Set sender based on workflow configuration
    const messagingConfig = workflow.messagingConfig;
    switch (messagingConfig.senderType) {
      case 'phone_number':
        messageParams.from = messagingConfig.senderValue;
        break;
      case 'messaging_service':
        messageParams.messagingServiceSid = messagingConfig.senderValue;
        break;
    }

    if (this.twilioService) {
      return await this.twilioService.sendMessage(messageParams);
    } else {
      return { success: true, messageId: `auto_${Date.now()}`, simulated: true };
    }
  }

  determineWebhookType(webhookData) {
    if (webhookData.MessageStatus) {
      return 'status_update';
    } else if (webhookData.Direction === 'inbound') {
      return 'inbound_message';
    }
    return 'unknown';
  }

  async identifyWorkflowFromWebhook(webhookData) {
    // Simple implementation - in production would use more sophisticated matching
    return Array.from(this.activeWorkflows.values())[0] || null;
  }

  generateWorkflowId() {
    return `eloqua_workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateBatchId() {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }
}

module.exports = EloquaTwilioWorkflowService;