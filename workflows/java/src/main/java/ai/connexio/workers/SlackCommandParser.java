package ai.connexio.workers;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.littlehorse.sdk.worker.LHTaskWorker;
import io.littlehorse.sdk.worker.WorkerContext;
import org.apache.hc.client5.http.classic.methods.HttpPost;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.core5.http.io.entity.StringEntity;
import org.apache.hc.core5.http.io.support.ClassicRequestBuilder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Task Worker: Parse Slack Command with Claude API
 * 
 * Analyzes the Slack command using Claude API to understand user intent
 * and extract campaign parameters.
 */
@LHTaskWorker("parse-slack-command")
public class SlackCommandParser {
    
    private static final Logger log = LoggerFactory.getLogger(SlackCommandParser.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final CloseableHttpClient httpClient = HttpClients.createDefault();
    
    private final String anthropicApiKey = System.getenv("ANTHROPIC_API_KEY");
    private final String anthropicApiUrl = "https://api.anthropic.com/v1/messages";
    
    /**
     * Parse Slack command using Claude API
     */
    public ObjectNode parseSlackCommand(JsonNode command, String userId, String channelId, WorkerContext context) {
        log.info("Parsing Slack command for user: {}, channel: {}", userId, channelId);
        
        try {
            String commandText = command.get("text").asText();
            String commandType = command.get("command").asText();
            
            log.debug("Command: {} - Text: {}", commandType, commandText);
            
            // Create Claude API request
            ObjectNode claudeRequest = createClaudeRequest(commandText, commandType);
            
            // Call Claude API
            ObjectNode claudeResponse = callClaudeApi(claudeRequest);
            
            // Parse Claude response into structured intent
            ObjectNode parsedIntent = parseClaudeResponse(claudeResponse, commandText, commandType);
            
            // Add metadata
            parsedIntent.put("userId", userId);
            parsedIntent.put("channelId", channelId);
            parsedIntent.put("timestamp", System.currentTimeMillis());
            parsedIntent.put("originalCommand", commandText);
            
            log.info("Successfully parsed command intent: {}", parsedIntent.get("action").asText());
            return parsedIntent;
            
        } catch (Exception e) {
            log.error("Failed to parse Slack command: {}", e.getMessage(), e);
            
            // Return error intent
            ObjectNode errorIntent = objectMapper.createObjectNode();
            errorIntent.put("action", "error");
            errorIntent.put("error", e.getMessage());
            errorIntent.put("userId", userId);
            errorIntent.put("channelId", channelId);
            return errorIntent;
        }
    }
    
    /**
     * Create Claude API request payload
     */
    private ObjectNode createClaudeRequest(String commandText, String commandType) {
        ObjectNode request = objectMapper.createObjectNode();
        request.put("model", "claude-3-haiku-20240307");
        request.put("max_tokens", 512);
        
        String systemPrompt = """
            You are Connexio.ai, an AI Marketing Ops Agent. Parse Slack commands and extract marketing campaign intent.
            
            Available actions:
            - create_email_campaign: Create email marketing campaign
            - create_sms_campaign: Create SMS marketing campaign  
            - get_campaign_status: Check campaign status
            - list_campaigns: List active campaigns
            - help: Show help information
            
            Return JSON with:
            {
              "action": "action_name",
              "parameters": { extracted parameters },
              "confidence": 0.0-1.0,
              "summary": "brief description"
            }
            """;
        
        String userPrompt = String.format("""
            Command: %s
            Text: %s
            
            Parse this command and return the structured intent as JSON.
            """, commandType, commandText);
        
        // Messages array
        var messages = request.putArray("messages");
        messages.addObject()
            .put("role", "user")
            .put("content", userPrompt);
        
        return request;
    }
    
    /**
     * Call Claude API
     */
    private ObjectNode callClaudeApi(ObjectNode request) throws Exception {
        HttpPost httpPost = new HttpPost(anthropicApiUrl);
        httpPost.setHeader("x-api-key", anthropicApiKey);
        httpPost.setHeader("Content-Type", "application/json");
        httpPost.setHeader("anthropic-version", "2023-06-01");
        
        String requestBody = objectMapper.writeValueAsString(request);
        httpPost.setEntity(new StringEntity(requestBody));
        
        return httpClient.execute(httpPost, response -> {
            String responseBody = new String(response.getEntity().getContent().readAllBytes());
            return (ObjectNode) objectMapper.readTree(responseBody);
        });
    }
    
    /**
     * Parse Claude response into structured intent
     */
    private ObjectNode parseClaudeResponse(ObjectNode claudeResponse, String originalText, String commandType) {
        try {
            JsonNode content = claudeResponse.get("content").get(0).get("text");
            String responseText = content.asText();
            
            // Try to extract JSON from Claude response
            int jsonStart = responseText.indexOf('{');
            int jsonEnd = responseText.lastIndexOf('}') + 1;
            
            if (jsonStart != -1 && jsonEnd > jsonStart) {
                String jsonStr = responseText.substring(jsonStart, jsonEnd);
                return (ObjectNode) objectMapper.readTree(jsonStr);
            }
            
        } catch (Exception e) {
            log.warn("Failed to parse Claude JSON response, using fallback: {}", e.getMessage());
        }
        
        // Fallback: simple command parsing
        return createFallbackIntent(originalText, commandType);
    }
    
    /**
     * Create fallback intent when Claude parsing fails
     */
    private ObjectNode createFallbackIntent(String commandText, String commandType) {
        ObjectNode intent = objectMapper.createObjectNode();
        ObjectNode parameters = objectMapper.createObjectNode();
        
        if (commandType.equals("/create-campaign") || commandText.toLowerCase().contains("create")) {
            intent.put("action", "create_email_campaign");
            intent.put("summary", "Create a new email campaign");
            parameters.put("name", "New Campaign");
        } else if (commandText.toLowerCase().contains("status")) {
            intent.put("action", "get_campaign_status");
            intent.put("summary", "Get campaign status");
        } else if (commandText.toLowerCase().contains("list")) {
            intent.put("action", "list_campaigns");
            intent.put("summary", "List campaigns");
        } else {
            intent.put("action", "help");
            intent.put("summary", "Show help information");
        }
        
        intent.set("parameters", parameters);
        intent.put("confidence", 0.7);
        
        return intent;
    }
}