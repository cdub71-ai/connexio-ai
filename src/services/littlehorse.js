import { LHClient } from 'littlehorse-client';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

class LittleHorseService {
  constructor() {
    this.client = new LHClient({
      host: config.littlehorse.apiHost,
      port: config.littlehorse.apiPort,
      clientId: config.littlehorse.clientId,
      clientSecret: config.littlehorse.clientSecret,
    });
  }

  async initializeWorkflows() {
    try {
      await this.createEmailCampaignWorkflow();
      await this.createSmsCampaignWorkflow();
      await this.createCampaignAnalyticsWorkflow();
      logger.info('Little Horse workflows initialized');
    } catch (error) {
      logger.error('Failed to initialize workflows:', error);
      throw error;
    }
  }

  async createEmailCampaignWorkflow() {
    const workflowSpec = this.client.newWorkflowSpec('email-campaign-workflow');
    
    workflowSpec
      .addVariable('campaignData', 'JSON_OBJ')
      .addVariable('generatedContent', 'JSON_OBJ')
      .addVariable('campaignId', 'STR')
      .addVariable('status', 'STR');

    workflowSpec
      .addTask('generate-content', 'generate-email-content')
      .withInput('campaignData', workflowSpec.getVariable('campaignData'))
      .withOutput('generatedContent');

    workflowSpec
      .addTask('create-campaign', 'create-sureshot-email-campaign')
      .withInput('campaignData', workflowSpec.getVariable('campaignData'))
      .withInput('content', workflowSpec.getVariable('generatedContent'))
      .withOutput('campaignId');

    workflowSpec
      .addTask('notify-completion', 'send-completion-notification')
      .withInput('campaignId', workflowSpec.getVariable('campaignId'))
      .withInput('platform', workflowSpec.literalStr('email'));

    await this.client.putWorkflowSpec(workflowSpec);
    logger.info('Email campaign workflow created');
  }

  async createSmsCampaignWorkflow() {
    const workflowSpec = this.client.newWorkflowSpec('sms-campaign-workflow');
    
    workflowSpec
      .addVariable('campaignData', 'JSON_OBJ')
      .addVariable('generatedContent', 'JSON_OBJ')
      .addVariable('campaignId', 'STR')
      .addVariable('status', 'STR');

    workflowSpec
      .addTask('generate-content', 'generate-sms-content')
      .withInput('campaignData', workflowSpec.getVariable('campaignData'))
      .withOutput('generatedContent');

    workflowSpec
      .addTask('create-campaign', 'create-sureshot-sms-campaign')
      .withInput('campaignData', workflowSpec.getVariable('campaignData'))
      .withInput('content', workflowSpec.getVariable('generatedContent'))
      .withOutput('campaignId');

    workflowSpec
      .addTask('notify-completion', 'send-completion-notification')
      .withInput('campaignId', workflowSpec.getVariable('campaignId'))
      .withInput('platform', workflowSpec.literalStr('sms'));

    await this.client.putWorkflowSpec(workflowSpec);
    logger.info('SMS campaign workflow created');
  }

  async createCampaignAnalyticsWorkflow() {
    const workflowSpec = this.client.newWorkflowSpec('campaign-analytics-workflow');
    
    workflowSpec
      .addVariable('campaignId', 'STR')
      .addVariable('analytics', 'JSON_OBJ')
      .addVariable('report', 'STR');

    workflowSpec
      .addTask('fetch-analytics', 'fetch-campaign-analytics')
      .withInput('campaignId', workflowSpec.getVariable('campaignId'))
      .withOutput('analytics');

    workflowSpec
      .addTask('generate-report', 'generate-analytics-report')
      .withInput('analytics', workflowSpec.getVariable('analytics'))
      .withOutput('report');

    workflowSpec
      .addTask('send-report', 'send-analytics-report')
      .withInput('report', workflowSpec.getVariable('report'))
      .withInput('campaignId', workflowSpec.getVariable('campaignId'));

    await this.client.putWorkflowSpec(workflowSpec);
    logger.info('Campaign analytics workflow created');
  }

  async runEmailCampaignWorkflow(campaignData) {
    try {
      const workflowRun = await this.client.runWorkflow('email-campaign-workflow', {
        campaignData: campaignData,
      });
      
      logger.info('Email campaign workflow started:', workflowRun.id);
      return workflowRun.id;
    } catch (error) {
      logger.error('Failed to start email campaign workflow:', error);
      throw error;
    }
  }

  async runSmsCampaignWorkflow(campaignData) {
    try {
      const workflowRun = await this.client.runWorkflow('sms-campaign-workflow', {
        campaignData: campaignData,
      });
      
      logger.info('SMS campaign workflow started:', workflowRun.id);
      return workflowRun.id;
    } catch (error) {
      logger.error('Failed to start SMS campaign workflow:', error);
      throw error;
    }
  }

  async getWorkflowStatus(workflowRunId) {
    try {
      const workflowRun = await this.client.getWorkflowRun(workflowRunId);
      return {
        id: workflowRun.id,
        status: workflowRun.status,
        startTime: workflowRun.startTime,
        endTime: workflowRun.endTime,
      };
    } catch (error) {
      logger.error('Failed to get workflow status:', error);
      throw error;
    }
  }
}

export const littleHorseService = new LittleHorseService();