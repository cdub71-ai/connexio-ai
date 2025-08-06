import Anthropic from '@anthropic-ai/sdk';
import { createContextLogger } from '../utils/logger.js';

/**
 * Claude AI File Analysis Service
 * Provides intelligent insights and recommendations for file validation results
 */
class ClaudeFileAnalyzer {
  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: 30000, // 30 second timeout
    });

    this.logger = createContextLogger({ service: 'claude-file-analyzer' });

    // File analysis persona for Claude
    this.systemPrompt = `You are Connexio AI, an expert Data Quality and Marketing Operations assistant with deep expertise in:

🎯 **Your Expertise:**
- Email deliverability and validation best practices
- Phone number formatting and international standards  
- Data quality assessment and improvement
- Marketing list hygiene and segmentation
- Campaign optimization and audience insights

📊 **Your Personality:**
- Professional but approachable
- Data-driven and analytical
- Helpful with actionable recommendations
- Focused on business outcomes
- Clear and concise communication

🔍 **Your Role:**
Analyze file validation results and provide intelligent insights, recommendations, and next steps for marketing teams. Focus on data quality improvements, audience insights, and campaign readiness.

Always provide:
1. Clear summary of data quality
2. Actionable recommendations  
3. Risk assessment for campaign use
4. Specific next steps
5. Business impact insights

Keep responses professional, data-focused, and actionable.`;

    this.logger.info('Claude File Analyzer initialized');
  }

  /**
   * Analyze file validation results and provide AI insights
   * @param {Object} validationResults - Results from file processing
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} AI analysis and recommendations
   */
  async analyzeValidationResults(validationResults, options = {}) {
    const logger = this.logger.child({ 
      method: 'analyzeValidationResults',
      processId: validationResults.processId 
    });

    logger.info('Starting AI analysis of validation results', {
      totalRecords: validationResults.validation?.totalRecords,
      validRecords: validationResults.validation?.validRecords,
    });

    try {
      const analysisPrompt = this.buildAnalysisPrompt(validationResults, options);
      
      const response = await this.client.messages.create({
        model: 'claude-3-haiku-20240307', // Fast model for quick analysis
        max_tokens: 1000,
        temperature: 0.3, // Lower temperature for more consistent analysis
        system: this.systemPrompt,
        messages: [
          {
            role: 'user',
            content: analysisPrompt,
          },
        ],
      });

      const analysisText = response.content[0]?.text;
      if (!analysisText) {
        throw new Error('Empty response from Claude');
      }

      // Parse and structure the response
      const analysis = this.parseAnalysisResponse(analysisText, validationResults);

      logger.info('AI analysis completed', {
        analysisLength: analysisText.length,
        recommendationsCount: analysis.recommendations?.length || 0,
        overallScore: analysis.overallScore,
      });

      return {
        success: true,
        analysis,
        metadata: {
          model: 'claude-3-haiku-20240307',
          tokenUsage: response.usage,
          timestamp: new Date().toISOString(),
          processId: validationResults.processId,
        },
      };

    } catch (error) {
      logger.error('AI analysis failed', { error: error.message });
      
      return {
        success: false,
        error: error.message,
        fallbackAnalysis: this.createFallbackAnalysis(validationResults),
      };
    }
  }

  /**
   * Generate intelligent insights for campaign readiness
   * @param {Object} validationResults - Validation results
   * @returns {Promise<Object>} Campaign readiness analysis
   */
  async analyzeCampaignReadiness(validationResults) {
    const logger = this.logger.child({ 
      method: 'analyzeCampaignReadiness',
      processId: validationResults.processId 
    });

    try {
      const campaignPrompt = this.buildCampaignReadinessPrompt(validationResults);
      
      const response = await this.client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 800,
        temperature: 0.2,
        system: this.systemPrompt,
        messages: [
          {
            role: 'user',
            content: campaignPrompt,
          },
        ],
      });

      const readinessText = response.content[0]?.text;
      const readinessAnalysis = this.parseCampaignReadiness(readinessText, validationResults);

      logger.info('Campaign readiness analysis completed', {
        readinessScore: readinessAnalysis.readinessScore,
        recommendedActions: readinessAnalysis.recommendedActions?.length || 0,
      });

      return {
        success: true,
        readiness: readinessAnalysis,
        metadata: {
          model: 'claude-3-haiku-20240307',
          tokenUsage: response.usage,
          timestamp: new Date().toISOString(),
        },
      };

    } catch (error) {
      logger.error('Campaign readiness analysis failed', { error: error.message });
      
      return {
        success: false,
        error: error.message,
        fallbackReadiness: this.createFallbackReadiness(validationResults),
      };
    }
  }

  /**
   * Build analysis prompt for validation results
   * @private
   */
  buildAnalysisPrompt(validationResults, options) {
    const { validation, originalFile, processing } = validationResults;
    
    let prompt = `📊 **FILE VALIDATION ANALYSIS REQUEST**\n\n`;
    
    prompt += `**File Details:**\n`;
    prompt += `• Original file: ${originalFile.name}\n`;
    prompt += `• File size: ${Math.round(originalFile.size / 1024)}KB\n`;
    prompt += `• Processing time: ${processing.duration}ms\n\n`;
    
    prompt += `**Validation Results:**\n`;
    prompt += `• Total records: ${validation.totalRecords}\n`;
    prompt += `• Valid records: ${validation.validRecords} (${Math.round((validation.validRecords / validation.totalRecords) * 100)}%)\n`;
    prompt += `• Invalid records: ${validation.invalidRecords}\n\n`;
    
    prompt += `**Email Validation:**\n`;
    prompt += `• Valid emails: ${validation.emailValidation.valid}\n`;
    prompt += `• Invalid emails: ${validation.emailValidation.invalid}\n`;
    prompt += `• Questionable emails: ${validation.emailValidation.questionable}\n\n`;
    
    prompt += `**Phone Validation:**\n`;
    prompt += `• Valid phones: ${validation.phoneValidation.valid}\n`;
    prompt += `• Invalid phones: ${validation.phoneValidation.invalid}\n`;
    prompt += `• Formatted phones: ${validation.phoneValidation.formatted}\n\n`;
    
    if (validationResults.errors?.length > 0) {
      prompt += `**Processing Errors:**\n`;
      validationResults.errors.slice(0, 3).forEach((error, index) => {
        prompt += `• ${error.stage || 'Unknown'}: ${error.error}\n`;
      });
      prompt += `\n`;
    }
    
    if (validationResults.warnings?.length > 0) {
      prompt += `**Warnings:**\n`;
      validationResults.warnings.slice(0, 3).forEach((warning, index) => {
        prompt += `• ${warning}\n`;
      });
      prompt += `\n`;
    }
    
    prompt += `**Analysis Request:**\n`;
    prompt += `Please provide a comprehensive analysis including:\n`;
    prompt += `1. Overall data quality assessment (score 1-100)\n`;
    prompt += `2. Key issues and risks identified\n`;
    prompt += `3. Specific recommendations for improvement\n`;
    prompt += `4. Campaign readiness assessment\n`;
    prompt += `5. Next steps and action items\n\n`;
    
    if (options.campaignType) {
      prompt += `**Campaign Context:** This data will be used for ${options.campaignType} campaigns\n`;
    }
    
    prompt += `Provide actionable, data-driven insights that help improve marketing campaign effectiveness.`;
    
    return prompt;
  }

  /**
   * Build campaign readiness prompt
   * @private
   */
  buildCampaignReadinessPrompt(validationResults) {
    const { validation } = validationResults;
    const validationRate = Math.round((validation.validRecords / validation.totalRecords) * 100);
    const emailValidRate = Math.round((validation.emailValidation.valid / validation.totalRecords) * 100);
    
    let prompt = `🎯 **CAMPAIGN READINESS ASSESSMENT**\n\n`;
    
    prompt += `**Dataset Overview:**\n`;
    prompt += `• Total contacts: ${validation.totalRecords}\n`;
    prompt += `• Overall validation rate: ${validationRate}%\n`;
    prompt += `• Email validation rate: ${emailValidRate}%\n`;
    prompt += `• Phone availability: ${validation.phoneValidation.valid} valid phones\n\n`;
    
    prompt += `**Assessment Request:**\n`;
    prompt += `As a marketing operations expert, assess this dataset's readiness for campaigns:\n\n`;
    
    prompt += `1. **Campaign Readiness Score** (1-100): How ready is this data for marketing campaigns?\n`;
    prompt += `2. **Risk Assessment**: What are the deliverability and reputation risks?\n`;
    prompt += `3. **Recommended Campaign Types**: What campaigns would work best with this data quality?\n`;
    prompt += `4. **Segmentation Opportunities**: How should this list be segmented for optimal results?\n`;
    prompt += `5. **Immediate Actions**: What should be done before launching campaigns?\n\n`;
    
    prompt += `Focus on practical, actionable guidance for marketing success.`;
    
    return prompt;
  }

  /**
   * Parse Claude's analysis response into structured data
   * @private
   */
  parseAnalysisResponse(analysisText, validationResults) {
    // Extract key insights using pattern matching
    const overallScoreMatch = analysisText.match(/(?:score|rating|assessment).*?(\d{1,3})(?:\/100|%|\s)/i);
    const overallScore = overallScoreMatch ? parseInt(overallScoreMatch[1]) : this.calculateFallbackScore(validationResults);
    
    // Extract recommendations (look for bullet points or numbered lists)
    const recommendations = this.extractRecommendations(analysisText);
    
    // Extract risk assessment
    const risks = this.extractRisks(analysisText);
    
    // Extract key insights
    const insights = this.extractInsights(analysisText);
    
    return {
      overallScore,
      summary: this.extractSummary(analysisText),
      recommendations,
      risks,
      insights,
      campaignReadiness: this.assessCampaignReadiness(overallScore, validationResults),
      nextSteps: this.extractNextSteps(analysisText),
      fullAnalysis: analysisText,
    };
  }

  /**
   * Parse campaign readiness response
   * @private
   */
  parseCampaignReadiness(readinessText, validationResults) {
    const readinessScoreMatch = readinessText.match(/(?:readiness|score|rating).*?(\d{1,3})(?:\/100|%|\s)/i);
    const readinessScore = readinessScoreMatch ? parseInt(readinessScoreMatch[1]) : 70;
    
    return {
      readinessScore,
      riskLevel: this.determineRiskLevel(readinessScore, validationResults),
      recommendedCampaignTypes: this.extractCampaignTypes(readinessText),
      segmentationSuggestions: this.extractSegmentationSuggestions(readinessText),
      recommendedActions: this.extractRecommendations(readinessText),
      fullAssessment: readinessText,
    };
  }

  /**
   * Extract recommendations from analysis text
   * @private
   */
  extractRecommendations(text) {
    const recommendations = [];
    
    // Look for bullet points, numbered lists, or "recommend" keywords
    const patterns = [
      /[•\-\*]\s*(.+?)(?=\n|$)/g,
      /\d+\.\s*(.+?)(?=\n|$)/g,
      /(?:recommend|suggest|should|need to)(.+?)(?=\.|;|\n|$)/gi,
    ];
    
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const rec = match[1].trim();
        if (rec.length > 10 && rec.length < 200) {
          recommendations.push(rec);
        }
      }
    });
    
    return [...new Set(recommendations)].slice(0, 5); // Dedupe and limit
  }

  /**
   * Extract risks from analysis text
   * @private
   */
  extractRisks(text) {
    const risks = [];
    const riskKeywords = ['risk', 'issue', 'problem', 'concern', 'warning', 'danger'];
    
    const sentences = text.split(/[.!?]+/);
    sentences.forEach(sentence => {
      const lowerSentence = sentence.toLowerCase();
      if (riskKeywords.some(keyword => lowerSentence.includes(keyword))) {
        const cleanSentence = sentence.trim();
        if (cleanSentence.length > 20 && cleanSentence.length < 150) {
          risks.push(cleanSentence);
        }
      }
    });
    
    return risks.slice(0, 3);
  }

  /**
   * Extract key insights from analysis text
   * @private
   */
  extractInsights(text) {
    const insights = [];
    
    // Look for insight patterns
    const insightPatterns = [
      /(?:insight|finding|observation|notable|important):\s*(.+?)(?=\.|;|\n|$)/gi,
      /(?:key|main|primary)\s+(?:finding|point|issue):\s*(.+?)(?=\.|;|\n|$)/gi,
    ];
    
    insightPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const insight = match[1].trim();
        if (insight.length > 15 && insight.length < 200) {
          insights.push(insight);
        }
      }
    });
    
    return insights.slice(0, 4);
  }

  /**
   * Extract summary from analysis text
   * @private
   */
  extractSummary(text) {
    // Look for summary sections or use first significant paragraph
    const summaryMatch = text.match(/(?:summary|overview|conclusion):\s*(.+?)(?=\n\n|\n[A-Z]|$)/is);
    if (summaryMatch) {
      return summaryMatch[1].trim();
    }
    
    // Fallback: use first meaningful paragraph
    const paragraphs = text.split('\n\n');
    for (const paragraph of paragraphs) {
      const cleaned = paragraph.trim();
      if (cleaned.length > 50 && cleaned.length < 300) {
        return cleaned;
      }
    }
    
    return 'Data quality analysis completed with actionable recommendations provided.';
  }

  /**
   * Extract next steps from analysis text
   * @private
   */
  extractNextSteps(text) {
    const steps = [];
    
    // Look for action-oriented phrases
    const actionPatterns = [
      /(?:next step|action|should|need to|must|important to)(.+?)(?=\.|;|\n|$)/gi,
      /\d+\.\s*(?:first|then|next|finally)(.+?)(?=\.|;|\n|$)/gi,
    ];
    
    actionPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const step = match[1].trim();
        if (step.length > 10 && step.length < 150) {
          steps.push(step);
        }
      }
    });
    
    return steps.slice(0, 4);
  }

  /**
   * Calculate fallback score if Claude doesn't provide one
   * @private
   */
  calculateFallbackScore(validationResults) {
    const { validation } = validationResults;
    const validationRate = (validation.validRecords / validation.totalRecords) * 100;
    const emailValidRate = (validation.emailValidation.valid / validation.totalRecords) * 100;
    
    // Weighted scoring
    let score = 0;
    score += validationRate * 0.4; // 40% weight on overall validation
    score += emailValidRate * 0.4; // 40% weight on email validation
    score += (validation.phoneValidation.valid / validation.totalRecords) * 100 * 0.2; // 20% weight on phone
    
    return Math.round(Math.max(0, Math.min(100, score)));
  }

  /**
   * Assess campaign readiness based on score and data
   * @private
   */
  assessCampaignReadiness(score, validationResults) {
    if (score >= 85) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 65) return 'fair';
    if (score >= 50) return 'poor';
    return 'not_ready';
  }

  /**
   * Create fallback analysis when Claude fails
   * @private
   */
  createFallbackAnalysis(validationResults) {
    const { validation } = validationResults;
    const validationRate = Math.round((validation.validRecords / validation.totalRecords) * 100);
    const score = this.calculateFallbackScore(validationResults);
    
    return {
      overallScore: score,
      summary: `Data quality analysis shows ${validationRate}% validation rate with ${validation.validRecords} valid records out of ${validation.totalRecords} total.`,
      recommendations: [
        'Review and clean invalid email addresses',
        'Standardize phone number formats',
        'Segment data by quality score for targeted campaigns',
      ],
      risks: validationRate < 70 ? ['Low validation rate may impact deliverability'] : [],
      campaignReadiness: this.assessCampaignReadiness(score, validationResults),
      aiAnalysisStatus: 'fallback',
    };
  }

  /**
   * Create fallback campaign readiness assessment
   * @private
   */
  createFallbackReadiness(validationResults) {
    const score = this.calculateFallbackScore(validationResults);
    
    return {
      readinessScore: score,
      riskLevel: score >= 75 ? 'low' : score >= 60 ? 'medium' : 'high',
      recommendedCampaignTypes: score >= 75 ? ['email', 'sms'] : ['email'],
      recommendedActions: ['Clean invalid records', 'Test with small segment first'],
      aiAnalysisStatus: 'fallback',
    };
  }

  /**
   * Helper methods for parsing specific elements
   * @private
   */
  determineRiskLevel(score, validationResults) {
    if (score >= 80) return 'low';
    if (score >= 65) return 'medium';
    return 'high';
  }

  extractCampaignTypes(text) {
    const types = [];
    const campaignKeywords = {
      'email': ['email', 'newsletter', 'drip'],
      'sms': ['sms', 'text', 'mobile'],
      'social': ['social', 'facebook', 'instagram'],
      'direct_mail': ['direct mail', 'postal', 'print'],
    };
    
    Object.entries(campaignKeywords).forEach(([type, keywords]) => {
      if (keywords.some(keyword => text.toLowerCase().includes(keyword))) {
        types.push(type);
      }
    });
    
    return types.length > 0 ? types : ['email']; // Default to email
  }

  extractSegmentationSuggestions(text) {
    const suggestions = [];
    const segmentPatterns = [
      /segment(?:ation)?\s+by\s+(.+?)(?=\.|;|\n|$)/gi,
      /divide\s+(?:the\s+)?(?:list|data|contacts)\s+(?:by|into)\s+(.+?)(?=\.|;|\n|$)/gi,
    ];
    
    segmentPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const suggestion = match[1].trim();
        if (suggestion.length > 5 && suggestion.length < 100) {
          suggestions.push(suggestion);
        }
      }
    });
    
    return suggestions.slice(0, 3);
  }

  /**
   * Get service health status
   */
  getHealthStatus() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      model: 'claude-3-haiku-20240307',
      persona: 'connexio-ai-data-quality-expert',
      capabilities: [
        'file_validation_analysis',
        'campaign_readiness_assessment',
        'data_quality_recommendations',
        'risk_assessment',
      ],
    };
  }
}

export default ClaudeFileAnalyzer;