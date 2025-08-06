/**
 * Bitly SMS Link Tracking Service
 * Advanced URL shortening and click analytics for SMS campaigns
 */

const { default: Anthropic } = require('@anthropic-ai/sdk');
const axios = require('axios');

class BitlySMSTracker {
  constructor(options = {}) {
    this.claude = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    this.config = {
      bitlyApiUrl: 'https://api-ssl.bitly.com/v4',
      accessToken: process.env.BITLY_ACCESS_TOKEN,
      defaultDomain: options.defaultDomain || 'bit.ly',
      enableAnalytics: options.enableAnalytics !== false,
      enableCustomTags: options.enableCustomTags !== false,
      urlCacheTime: options.urlCacheTime || 86400000, // 24 hours
      enableAIOptimization: options.enableAIOptimization !== false
    };

    // URL tracking and analytics storage
    this.shortenedUrls = new Map();
    this.clickAnalytics = new Map();
    this.campaignTracking = new Map();
    this.urlCache = new Map();

    // Performance metrics
    this.trackingMetrics = {
      totalUrlsShortened: 0,
      totalClicks: 0,
      uniqueClickers: new Set(),
      topPerformingUrls: new Map(),
      campaignAnalytics: new Map(),
      averageShortenTime: 0
    };

    // URL patterns and validation
    this.urlPattern = /(https?:\/\/[^\s]+)/g;

    console.log('🔗 Bitly SMS Tracker initialized');
  }

  /**
   * Process SMS message and shorten all URLs with tracking
   * @param {string} messageBody - SMS message content
   * @param {Object} campaignData - Campaign tracking information
   * @returns {Object} Processed message with shortened URLs
   */
  async processSMSWithTracking(messageBody, campaignData = {}) {
    const startTime = Date.now();
    const trackingId = this.generateTrackingId();

    console.log(`🔗 Processing SMS message for URL tracking ${trackingId}...`);

    try {
      // Step 1: Extract URLs from message
      const extractedUrls = this.extractUrlsFromMessage(messageBody);
      
      if (extractedUrls.length === 0) {
        console.log('📨 No URLs found in message, no tracking needed');
        return {
          trackingId: trackingId,
          originalMessage: messageBody,
          processedMessage: messageBody,
          shortenedUrls: [],
          trackingEnabled: false,
          processingTime: Date.now() - startTime
        };
      }

      console.log(`🔍 Found ${extractedUrls.length} URLs to process`);

      // Step 2: Shorten URLs with campaign tracking
      const shortenResults = await Promise.all(
        extractedUrls.map(url => this.shortenUrlWithTracking(url, campaignData, trackingId))
      );

      // Step 3: Replace original URLs with shortened versions
      let processedMessage = messageBody;
      shortenResults.forEach((result, index) => {
        if (result.success) {
          processedMessage = processedMessage.replace(extractedUrls[index], result.shortUrl);
        }
      });

      // Step 4: Generate tracking analytics structure
      const trackingAnalytics = await this.generateTrackingAnalytics(
        shortenResults,
        campaignData,
        trackingId
      );

      // Step 5: Update metrics
      this.updateTrackingMetrics(shortenResults, Date.now() - startTime);

      const result = {
        trackingId: trackingId,
        originalMessage: messageBody,
        processedMessage: processedMessage,
        shortenedUrls: shortenResults.filter(r => r.success),
        trackingAnalytics: trackingAnalytics,
        campaign: campaignData,
        trackingEnabled: true,
        processingTime: Date.now() - startTime,
        createdAt: new Date().toISOString()
      };

      // Store tracking data
      this.campaignTracking.set(trackingId, result);

      console.log(`✅ SMS URL tracking complete: ${shortenResults.filter(r => r.success).length}/${extractedUrls.length} URLs shortened`);

      return result;

    } catch (error) {
      console.error('SMS URL tracking failed:', error);
      return {
        trackingId: trackingId,
        originalMessage: messageBody,
        processedMessage: messageBody,
        shortenedUrls: [],
        trackingEnabled: false,
        error: error.message,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Shorten individual URL with comprehensive tracking
   * @param {string} url - Original URL to shorten
   * @param {Object} campaignData - Campaign information
   * @param {string} trackingId - Tracking identifier
   * @returns {Object} Shortened URL result
   */
  async shortenUrlWithTracking(url, campaignData, trackingId) {
    const urlId = this.generateUrlId();
    
    console.log(`🔗 Shortening URL: ${url}`);

    try {
      // Check cache first
      const cachedUrl = this.getCachedUrl(url, campaignData);
      if (cachedUrl) {
        console.log('📦 Using cached shortened URL');
        return cachedUrl;
      }

      // Prepare tracking parameters
      const trackingTags = await this.generateTrackingTags(campaignData, trackingId);
      const customTags = this.config.enableCustomTags ? trackingTags : [];

      // Create Bitly link
      const shortenRequest = {
        long_url: url,
        domain: this.config.defaultDomain,
        tags: customTags,
        title: await this.generateUrlTitle(url, campaignData)
      };

      // Add custom back-half if provided
      if (campaignData.customBackHalf) {
        shortenRequest.custom_bitlinks = [`${this.config.defaultDomain}/${campaignData.customBackHalf}`];
      }

      const response = await axios.post(
        `${this.config.bitlyApiUrl}/shorten`,
        shortenRequest,
        {
          headers: {
            'Authorization': `Bearer ${this.config.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const bitlink = response.data;
      
      // Store shortened URL data
      const urlData = {
        urlId: urlId,
        originalUrl: url,
        shortUrl: bitlink.link,
        bitlinkId: bitlink.id,
        title: bitlink.title,
        tags: customTags,
        campaign: campaignData,
        trackingId: trackingId,
        createdAt: new Date().toISOString(),
        clicks: 0,
        uniqueClicks: 0,
        analytics: {
          clicksByDay: new Map(),
          clicksByLocation: new Map(),
          clicksByDevice: new Map(),
          referrers: new Map()
        }
      };

      // Cache the result
      this.cacheUrl(url, campaignData, urlData);
      
      // Store in tracking maps
      this.shortenedUrls.set(urlId, urlData);
      this.clickAnalytics.set(bitlink.id, urlData);

      console.log(`✅ URL shortened successfully: ${bitlink.link}`);

      return {
        success: true,
        urlId: urlId,
        originalUrl: url,
        shortUrl: bitlink.link,
        bitlinkId: bitlink.id,
        title: bitlink.title,
        tags: customTags,
        analytics: urlData.analytics
      };

    } catch (error) {
      console.error(`URL shortening failed for ${url}:`, error);
      
      return {
        success: false,
        urlId: urlId,
        originalUrl: url,
        error: error.response?.data?.message || error.message,
        fallbackUrl: url // Use original URL as fallback
      };
    }
  }

  /**
   * Retrieve click analytics for shortened URLs
   * @param {string} bitlinkId - Bitly link ID
   * @returns {Object} Analytics data
   */
  async getUrlAnalytics(bitlinkId) {
    console.log(`📊 Retrieving analytics for ${bitlinkId}...`);

    try {
      // Get click metrics
      const clicksResponse = await axios.get(
        `${this.config.bitlyApiUrl}/bitlinks/${bitlinkId}/clicks`,
        {
          headers: { 'Authorization': `Bearer ${this.config.accessToken}` },
          params: {
            unit: 'day',
            units: -1, // Last 30 days
            unit_reference: new Date().toISOString().split('T')[0]
          }
        }
      );

      // Get click summary
      const summaryResponse = await axios.get(
        `${this.config.bitlyApiUrl}/bitlinks/${bitlinkId}/clicks/summary`,
        {
          headers: { 'Authorization': `Bearer ${this.config.accessToken}` },
          params: {
            unit: 'day',
            units: -1
          }
        }
      );

      // Get referring domains if available
      let referrers = [];
      try {
        const referrersResponse = await axios.get(
          `${this.config.bitlyApiUrl}/bitlinks/${bitlinkId}/referrers`,
          {
            headers: { 'Authorization': `Bearer ${this.config.accessToken}` }
          }
        );
        referrers = referrersResponse.data.referrers || [];
      } catch (referrerError) {
        console.warn('Referrers data not available:', referrerError.message);
      }

      const analytics = {
        bitlinkId: bitlinkId,
        totalClicks: summaryResponse.data.total_clicks,
        clicksOverTime: clicksResponse.data.link_clicks || [],
        referrers: referrers,
        retrievedAt: new Date().toISOString(),
        summary: {
          dailyAverage: this.calculateDailyAverage(clicksResponse.data.link_clicks),
          peakDay: this.findPeakDay(clicksResponse.data.link_clicks),
          clickTrend: this.analyzeTrend(clicksResponse.data.link_clicks)
        }
      };

      // Update local analytics data
      const urlData = this.clickAnalytics.get(bitlinkId);
      if (urlData) {
        urlData.clicks = analytics.totalClicks;
        urlData.lastAnalyticsUpdate = analytics.retrievedAt;
      }

      console.log(`✅ Analytics retrieved: ${analytics.totalClicks} total clicks`);

      return analytics;

    } catch (error) {
      console.error(`Analytics retrieval failed for ${bitlinkId}:`, error);
      return {
        bitlinkId: bitlinkId,
        error: error.response?.data?.message || error.message,
        retrievedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Generate comprehensive campaign analytics
   * @param {string} trackingId - Campaign tracking ID
   * @returns {Object} Campaign analytics
   */
  async getCampaignAnalytics(trackingId) {
    console.log(`📈 Generating campaign analytics for ${trackingId}...`);

    const campaignData = this.campaignTracking.get(trackingId);
    if (!campaignData) {
      throw new Error(`Campaign tracking data not found for ${trackingId}`);
    }

    try {
      // Collect analytics for all URLs in the campaign
      const urlAnalytics = await Promise.all(
        campaignData.shortenedUrls.map(async (urlResult) => {
          if (urlResult.success) {
            return await this.getUrlAnalytics(urlResult.bitlinkId);
          }
          return null;
        })
      );

      // Filter out failed analytics
      const validAnalytics = urlAnalytics.filter(a => a && !a.error);

      // Aggregate campaign metrics
      const campaignAnalytics = {
        trackingId: trackingId,
        campaign: campaignData.campaign,
        summary: {
          totalUrls: campaignData.shortenedUrls.length,
          successfulUrls: campaignData.shortenedUrls.filter(u => u.success).length,
          totalClicks: validAnalytics.reduce((sum, a) => sum + a.totalClicks, 0),
          averageClicksPerUrl: validAnalytics.length > 0 
            ? validAnalytics.reduce((sum, a) => sum + a.totalClicks, 0) / validAnalytics.length 
            : 0,
          clickRate: this.calculateClickRate(campaignData, validAnalytics)
        },
        urlPerformance: validAnalytics.map(analytics => ({
          bitlinkId: analytics.bitlinkId,
          shortUrl: campaignData.shortenedUrls.find(u => u.bitlinkId === analytics.bitlinkId)?.shortUrl,
          totalClicks: analytics.totalClicks,
          dailyAverage: analytics.summary?.dailyAverage || 0,
          peakDay: analytics.summary?.peakDay,
          trend: analytics.summary?.clickTrend
        })),
        timeAnalysis: this.aggregateTimeAnalysis(validAnalytics),
        referrerAnalysis: this.aggregateReferrerAnalysis(validAnalytics),
        recommendations: await this.generateCampaignRecommendations(campaignData, validAnalytics),
        generatedAt: new Date().toISOString()
      };

      console.log(`✅ Campaign analytics generated: ${campaignAnalytics.summary.totalClicks} total clicks across ${campaignAnalytics.summary.totalUrls} URLs`);

      return campaignAnalytics;

    } catch (error) {
      console.error('Campaign analytics generation failed:', error);
      throw new Error(`Campaign analytics failed: ${error.message}`);
    }
  }

  /**
   * Generate AI-powered campaign recommendations
   */
  async generateCampaignRecommendations(campaignData, urlAnalytics) {
    if (!this.config.enableAIOptimization) {
      return [];
    }

    const prompt = `Analyze this SMS campaign's URL tracking performance and provide optimization recommendations:

**Campaign Data:**
${JSON.stringify(campaignData.campaign, null, 2)}

**URL Performance:**
${urlAnalytics.map(a => `- ${a.bitlinkId}: ${a.totalClicks} clicks, ${a.summary?.dailyAverage || 0} daily average`).join('\n')}

**Overall Metrics:**
- Total URLs: ${campaignData.shortenedUrls.length}
- Total Clicks: ${urlAnalytics.reduce((sum, a) => sum + a.totalClicks, 0)}
- Average Performance: ${urlAnalytics.length > 0 ? urlAnalytics.reduce((sum, a) => sum + a.totalClicks, 0) / urlAnalytics.length : 0} clicks per URL

**Analysis Required:**
1. URL performance optimization opportunities
2. Click timing and frequency insights
3. Content and messaging improvements
4. Technical optimizations for better tracking
5. Future campaign strategy recommendations

**Respond with:**
{
  "performanceAnalysis": {
    "overallRating": "excellent|good|average|poor",
    "strengths": ["strength1", "strength2"],
    "weaknesses": ["weakness1", "weakness2"]
  },
  "optimizationRecommendations": [
    {
      "category": "url_optimization|content|timing|technical",
      "recommendation": "specific_recommendation", 
      "reasoning": "why_this_helps",
      "priority": "high|medium|low",
      "expectedImpact": "percentage_improvement_estimate"
    }
  ],
  "futureStrategy": [
    "strategic_recommendation1", "strategic_recommendation2"
  ],
  "technicalImprovements": [
    "improvement1", "improvement2"
  ]
}`;

    try {
      const response = await this.claude.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1500,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }]
      });

      return JSON.parse(response.content[0].text);
    } catch (error) {
      console.error('AI campaign recommendations failed:', error);
      return {
        performanceAnalysis: { overallRating: 'unknown' },
        optimizationRecommendations: [],
        futureStrategy: [],
        technicalImprovements: []
      };
    }
  }

  /**
   * Extract URLs from SMS message
   */
  extractUrlsFromMessage(messageBody) {
    const urls = messageBody.match(this.urlPattern) || [];
    
    // Filter and validate URLs
    return urls.filter(url => this.isValidUrl(url));
  }

  /**
   * Validate URL format
   */
  isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate tracking tags based on campaign data
   */
  async generateTrackingTags(campaignData, trackingId) {
    const tags = [];

    // Add campaign-based tags
    if (campaignData.campaignName) {
      tags.push(`campaign:${campaignData.campaignName.replace(/\s+/g, '_').toLowerCase()}`);
    }

    if (campaignData.segmentName) {
      tags.push(`segment:${campaignData.segmentName.replace(/\s+/g, '_').toLowerCase()}`);
    }

    if (campaignData.messageType) {
      tags.push(`type:${campaignData.messageType.toLowerCase()}`);
    }

    // Add tracking ID
    tags.push(`tracking:${trackingId}`);

    // Add date-based tag
    tags.push(`date:${new Date().toISOString().split('T')[0]}`);

    return tags;
  }

  /**
   * Generate URL title for better tracking
   */
  async generateUrlTitle(url, campaignData) {
    const campaignName = campaignData.campaignName || 'SMS Campaign';
    const timestamp = new Date().toISOString().split('T')[0];
    
    return `${campaignName} - ${timestamp}`;
  }

  /**
   * Cache URL for performance optimization
   */
  cacheUrl(originalUrl, campaignData, urlData) {
    const cacheKey = this.generateCacheKey(originalUrl, campaignData);
    
    this.urlCache.set(cacheKey, {
      ...urlData,
      cachedAt: Date.now(),
      expiresAt: Date.now() + this.config.urlCacheTime
    });
  }

  /**
   * Get cached URL if available and valid
   */
  getCachedUrl(originalUrl, campaignData) {
    const cacheKey = this.generateCacheKey(originalUrl, campaignData);
    const cached = this.urlCache.get(cacheKey);
    
    if (cached && cached.expiresAt > Date.now()) {
      return {
        success: true,
        urlId: cached.urlId,
        originalUrl: cached.originalUrl,
        shortUrl: cached.shortUrl,
        bitlinkId: cached.bitlinkId,
        title: cached.title,
        tags: cached.tags,
        cached: true
      };
    }
    
    return null;
  }

  /**
   * Generate cache key for URL
   */
  generateCacheKey(originalUrl, campaignData) {
    const keyData = {
      url: originalUrl,
      campaign: campaignData.campaignName || '',
      segment: campaignData.segmentName || ''
    };
    
    return Buffer.from(JSON.stringify(keyData)).toString('base64').substring(0, 32);
  }

  /**
   * Generate tracking analytics structure
   */
  async generateTrackingAnalytics(shortenResults, campaignData, trackingId) {
    const successfulUrls = shortenResults.filter(r => r.success);
    
    return {
      trackingId: trackingId,
      totalUrls: shortenResults.length,
      successfulUrls: successfulUrls.length,
      failedUrls: shortenResults.length - successfulUrls.length,
      urlMappings: successfulUrls.map(result => ({
        originalUrl: result.originalUrl,
        shortUrl: result.shortUrl,
        bitlinkId: result.bitlinkId,
        title: result.title
      })),
      trackingConfiguration: {
        campaignName: campaignData.campaignName,
        enableAnalytics: this.config.enableAnalytics,
        customTags: this.config.enableCustomTags,
        domain: this.config.defaultDomain
      },
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Update tracking metrics
   */
  updateTrackingMetrics(shortenResults, processingTime) {
    const successfulUrls = shortenResults.filter(r => r.success).length;
    
    this.trackingMetrics.totalUrlsShortened += successfulUrls;
    this.trackingMetrics.averageShortenTime = 
      (this.trackingMetrics.averageShortenTime + processingTime) / 2;
  }

  /**
   * Calculate daily average clicks
   */
  calculateDailyAverage(clickData) {
    if (!clickData || clickData.length === 0) return 0;
    
    const totalClicks = clickData.reduce((sum, day) => sum + day.clicks, 0);
    return totalClicks / clickData.length;
  }

  /**
   * Find peak performance day
   */
  findPeakDay(clickData) {
    if (!clickData || clickData.length === 0) return null;
    
    return clickData.reduce((peak, day) => 
      day.clicks > peak.clicks ? day : peak
    );
  }

  /**
   * Analyze click trend
   */
  analyzeTrend(clickData) {
    if (!clickData || clickData.length < 2) return 'insufficient_data';
    
    const recentClicks = clickData.slice(-7); // Last 7 days
    const olderClicks = clickData.slice(-14, -7); // Previous 7 days
    
    const recentAvg = recentClicks.reduce((sum, day) => sum + day.clicks, 0) / recentClicks.length;
    const olderAvg = olderClicks.reduce((sum, day) => sum + day.clicks, 0) / olderClicks.length;
    
    if (recentAvg > olderAvg * 1.1) return 'increasing';
    if (recentAvg < olderAvg * 0.9) return 'decreasing';
    return 'stable';
  }

  /**
   * Calculate campaign click rate
   */
  calculateClickRate(campaignData, validAnalytics) {
    // This would typically be based on the number of SMS recipients
    // For now, return a simple metric based on URL performance
    const totalClicks = validAnalytics.reduce((sum, a) => sum + a.totalClicks, 0);
    const totalUrls = validAnalytics.length;
    
    return totalUrls > 0 ? totalClicks / totalUrls : 0;
  }

  /**
   * Aggregate time analysis across URLs
   */
  aggregateTimeAnalysis(validAnalytics) {
    const timeData = {
      peakDays: [],
      trends: new Map(),
      dailyAverages: []
    };

    validAnalytics.forEach(analytics => {
      if (analytics.summary?.peakDay) {
        timeData.peakDays.push(analytics.summary.peakDay);
      }
      
      if (analytics.summary?.clickTrend) {
        const trend = analytics.summary.clickTrend;
        timeData.trends.set(trend, (timeData.trends.get(trend) || 0) + 1);
      }
      
      if (analytics.summary?.dailyAverage) {
        timeData.dailyAverages.push(analytics.summary.dailyAverage);
      }
    });

    return {
      mostCommonTrend: this.getMostCommonValue(timeData.trends),
      averageDailyClicks: timeData.dailyAverages.length > 0 
        ? timeData.dailyAverages.reduce((a, b) => a + b, 0) / timeData.dailyAverages.length 
        : 0,
      peakPerformanceDays: timeData.peakDays.length
    };
  }

  /**
   * Aggregate referrer analysis
   */
  aggregateReferrerAnalysis(validAnalytics) {
    const allReferrers = validAnalytics.flatMap(a => a.referrers || []);
    const referrerCounts = new Map();

    allReferrers.forEach(referrer => {
      referrerCounts.set(referrer.referrer, (referrerCounts.get(referrer.referrer) || 0) + referrer.clicks);
    });

    return {
      totalReferrers: referrerCounts.size,
      topReferrer: this.getMostCommonValue(referrerCounts),
      referrerBreakdown: Array.from(referrerCounts.entries()).map(([referrer, clicks]) => ({
        referrer, clicks
      }))
    };
  }

  /**
   * Get most common value from Map
   */
  getMostCommonValue(map) {
    if (map.size === 0) return null;
    
    return Array.from(map.entries()).reduce((a, b) => a[1] > b[1] ? a : b)[0];
  }

  /**
   * Generate tracking and URL IDs
   */
  generateTrackingId() {
    return `track_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
  }

  generateUrlId() {
    return `url_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  /**
   * Get service health and tracking metrics
   */
  getServiceHealth() {
    return {
      service: 'BitlySMSTracker',
      status: 'healthy',
      metrics: {
        ...this.trackingMetrics,
        uniqueClickers: this.trackingMetrics.uniqueClickers.size,
        cachedUrls: this.urlCache.size,
        activeCampaigns: this.campaignTracking.size
      },
      configuration: {
        domain: this.config.defaultDomain,
        analyticsEnabled: this.config.enableAnalytics,
        customTagsEnabled: this.config.enableCustomTags,
        aiOptimizationEnabled: this.config.enableAIOptimization
      },
      capabilities: [
        'url_shortening',
        'click_tracking',
        'campaign_analytics',
        'ai_optimization_recommendations',
        'custom_tagging',
        'performance_caching',
        'trend_analysis'
      ],
      config: this.config
    };
  }

  /**
   * Generate comprehensive tracking report
   */
  generateTrackingReport() {
    const topUrls = Array.from(this.shortenedUrls.values())
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 10);

    const campaignPerformance = Array.from(this.campaignTracking.values())
      .map(campaign => ({
        trackingId: campaign.trackingId,
        campaignName: campaign.campaign?.campaignName,
        totalUrls: campaign.shortenedUrls.length,
        successfulUrls: campaign.shortenedUrls.filter(u => u.success).length
      }));

    return {
      reportDate: new Date().toISOString(),
      overallMetrics: this.trackingMetrics,
      topPerformingUrls: topUrls.map(url => ({
        shortUrl: url.shortUrl,
        originalUrl: url.originalUrl,
        clicks: url.clicks,
        campaign: url.campaign?.campaignName
      })),
      campaignPerformance: campaignPerformance,
      recommendations: this.generateGeneralRecommendations()
    };
  }

  generateGeneralRecommendations() {
    const recommendations = [];

    if (this.trackingMetrics.totalUrlsShortened > 0) {
      const avgClicks = this.trackingMetrics.totalClicks / this.trackingMetrics.totalUrlsShortened;
      
      if (avgClicks < 5) {
        recommendations.push({
          area: 'URL Performance',
          recommendation: 'Consider improving URL placement and call-to-action messaging',
          priority: 'medium'
        });
      }

      if (this.trackingMetrics.totalClicks > 100) {
        recommendations.push({
          area: 'Analytics',
          recommendation: 'Enable advanced analytics for deeper insights',
          priority: 'low'
        });
      }
    }

    return recommendations;
  }
}

module.exports = BitlySMSTracker;