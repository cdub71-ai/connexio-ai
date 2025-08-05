import axios from 'axios';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

class SureshotService {
  constructor() {
    this.client = axios.create({
      baseURL: config.sureshot.baseUrl,
      headers: {
        'Authorization': `Bearer ${config.sureshot.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async createEmailCampaign(campaignData) {
    try {
      const payload = {
        workspaceId: config.sureshot.workspaceId,
        type: 'email',
        name: campaignData.name,
        subject: campaignData.subject,
        content: campaignData.content,
        audience: campaignData.audience,
        scheduleTime: campaignData.scheduleTime,
      };

      const response = await this.client.post('/campaigns', payload);
      logger.info('Email campaign created:', response.data.id);
      return response.data;
    } catch (error) {
      logger.error('Sureshot email campaign error:', error.response?.data || error.message);
      throw new Error('Failed to create email campaign');
    }
  }

  async createSmsCampaign(campaignData) {
    try {
      const payload = {
        workspaceId: config.sureshot.workspaceId,
        type: 'sms',
        name: campaignData.name,
        message: campaignData.message,
        audience: campaignData.audience,
        scheduleTime: campaignData.scheduleTime,
      };

      const response = await this.client.post('/campaigns', payload);
      logger.info('SMS campaign created:', response.data.id);
      return response.data;
    } catch (error) {
      logger.error('Sureshot SMS campaign error:', error.response?.data || error.message);
      throw new Error('Failed to create SMS campaign');
    }
  }

  async getCampaignStatus(campaignId) {
    try {
      const response = await this.client.get(`/campaigns/${campaignId}`);
      return response.data;
    } catch (error) {
      logger.error('Get campaign status error:', error.response?.data || error.message);
      throw new Error('Failed to get campaign status');
    }
  }

  async getCampaignAnalytics(campaignId) {
    try {
      const response = await this.client.get(`/campaigns/${campaignId}/analytics`);
      return response.data;
    } catch (error) {
      logger.error('Get campaign analytics error:', error.response?.data || error.message);
      throw new Error('Failed to get campaign analytics');
    }
  }

  async getAudiences() {
    try {
      const response = await this.client.get('/audiences', {
        params: { workspaceId: config.sureshot.workspaceId },
      });
      return response.data;
    } catch (error) {
      logger.error('Get audiences error:', error.response?.data || error.message);
      throw new Error('Failed to get audiences');
    }
  }
}

export const sureshotService = new SureshotService();