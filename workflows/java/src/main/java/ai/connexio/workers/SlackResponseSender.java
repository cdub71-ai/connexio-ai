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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Task Worker: Send Slack Response
 * 
 * Sends the campaign execution result back to Slack as a formatted message.
 */
@LHTaskWorker("send-slack-response")
public class SlackResponseSender {
    
    private static final Logger log = LoggerFactory.getLogger(SlackResponseSender.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final CloseableHttpClient httpClient = HttpClients.createDefault();
    
    private final String slackBotToken = System.getenv("SLACK_BOT_TOKEN");
    
    /**
     * Send campaign result back to Slack
     */
    public String sendSlackResponse(JsonNode result, String responseUrl, String channelId, String userId, WorkerContext context) {
        log.info("Sending Slack response to channel: {}, user: {}", channelId, userId);
        
        try {
            // Format the result into a Slack message
            ObjectNode slackMessage = formatSlackMessage(result, userId);
            
            // Send via response URL if available (for slash commands)
            if (responseUrl != null && !responseUrl.isEmpty()) {
                sendToResponseUrl(responseUrl, slackMessage);
            }
            
            // Also send via Bot API for persistence
            if (slackBotToken != null && channelId != null) {
                sendViaSlackAPI(channelId, slackMessage);
            }
            
            log.info("Successfully sent Slack response");
            return "success";
            
        } catch (Exception e) {
            log.error("Failed to send Slack response: {}", e.getMessage(), e);
            return "error: " + e.getMessage();
        }
    }
    
    /**
     * Format campaign result into Slack message
     */
    private ObjectNode formatSlackMessage(JsonNode result, String userId) {
        ObjectNode message = objectMapper.createObjectNode();
        message.put("response_type", "in_channel");
        
        String action = result.path("action").asText("unknown");
        String status = result.path("status").asText("unknown");
        String resultMessage = result.path("message").asText("No message");
        
        // Create formatted text
        StringBuilder text = new StringBuilder();
        text.append(String.format("🤖 *Connexio.ai Result for <@%s>*\n\n", userId));
        
        // Add status emoji
        String statusEmoji = status.equals("success") ? "✅" : "❌";
        text.append(String.format("%s *Status:* %s\n", statusEmoji, status.toUpperCase()));
        text.append(String.format("🎯 *Action:* %s\n", formatActionName(action)));
        text.append(String.format("💬 *Message:* %s\n", resultMessage));
        
        // Add campaign details if available
        if (result.has("campaignId")) {
            text.append(String.format("🆔 *Campaign ID:* `%s`\n", result.get("campaignId").asText()));
        }
        
        // Add timestamp
        long timestamp = result.path("timestamp").asLong(System.currentTimeMillis());
        text.append(String.format("⏰ *Time:* <!date^%d^{date_short_pretty} at {time}|%d>\n", 
                                 timestamp / 1000, timestamp));
        
        message.put("text", text.toString());
        
        // Add blocks for rich formatting
        var blocks = message.putArray("blocks");
        
        // Header block
        var headerBlock = blocks.addObject();
        headerBlock.put("type", "header");
        headerBlock.putObject("text")
            .put("type", "plain_text")
            .put("text", "🤖 Connexio.ai Campaign Result");
        
        // Main content block
        var contentBlock = blocks.addObject();
        contentBlock.put("type", "section");
        contentBlock.putObject("text")
            .put("type", "mrkdwn")
            .put("text", text.toString());
        
        // Add details if campaign was created successfully
        if (status.equals("success") && result.has("details")) {
            addCampaignDetailsBlock(blocks, result.get("details"));
        }
        
        // Add help commands if it was a help action
        if (action.equals("help") && result.has("availableCommands")) {
            addHelpCommandsBlock(blocks, result.get("availableCommands"));
        }
        
        return message;
    }
    
    /**
     * Add campaign details block
     */
    private void addCampaignDetailsBlock(var blocks, JsonNode details) {
        var detailsBlock = blocks.addObject();
        detailsBlock.put("type", "section");
        
        StringBuilder detailsText = new StringBuilder("*Campaign Details:*\n");
        
        if (details.has("id")) {
            detailsText.append(String.format("• ID: `%s`\n", details.get("id").asText()));
        }
        if (details.has("type")) {
            detailsText.append(String.format("• Type: %s\n", details.get("type").asText().toUpperCase()));
        }
        if (details.has("status")) {
            detailsText.append(String.format("• Status: %s\n", details.get("status").asText()));
        }
        
        detailsBlock.putObject("text")
            .put("type", "mrkdwn")
            .put("text", detailsText.toString());
    }
    
    /**
     * Add help commands block
     */
    private void addHelpCommandsBlock(var blocks, JsonNode commands) {
        var helpBlock = blocks.addObject();
        helpBlock.put("type", "section");
        
        StringBuilder helpText = new StringBuilder("*Available Commands:*\n");
        
        for (JsonNode command : commands) {
            String cmd = command.path("command").asText();
            String desc = command.path("description").asText();
            helpText.append(String.format("• `%s` - %s\n", cmd, desc));
        }
        
        helpBlock.putObject("text")
            .put("type", "mrkdwn")
            .put("text", helpText.toString());
    }
    
    /**
     * Format action name for display
     */
    private String formatActionName(String action) {
        return switch (action) {
            case "create_email_campaign" -> "Create Email Campaign";
            case "create_sms_campaign" -> "Create SMS Campaign";
            case "get_campaign_status" -> "Get Campaign Status";
            case "list_campaigns" -> "List Campaigns";
            case "help" -> "Help";
            default -> action.replace("_", " ").toUpperCase();
        };
    }
    
    /**
     * Send message to Slack response URL
     */
    private void sendToResponseUrl(String responseUrl, ObjectNode message) throws Exception {
        log.debug("Sending to response URL: {}", responseUrl);
        
        HttpPost httpPost = new HttpPost(responseUrl);
        httpPost.setHeader("Content-Type", "application/json");
        
        String messageBody = objectMapper.writeValueAsString(message);
        httpPost.setEntity(new StringEntity(messageBody));
        
        httpClient.execute(httpPost, response -> {
            log.debug("Response URL response status: {}", response.getCode());
            return null;
        });
    }
    
    /**
     * Send message via Slack Bot API
     */
    private void sendViaSlackAPI(String channelId, ObjectNode message) throws Exception {
        log.debug("Sending via Slack API to channel: {}", channelId);
        
        ObjectNode apiMessage = message.deepCopy();
        apiMessage.put("channel", channelId);
        
        HttpPost httpPost = new HttpPost("https://slack.com/api/chat.postMessage");
        httpPost.setHeader("Authorization", "Bearer " + slackBotToken);
        httpPost.setHeader("Content-Type", "application/json");
        
        String messageBody = objectMapper.writeValueAsString(apiMessage);
        httpPost.setEntity(new StringEntity(messageBody));
        
        httpClient.execute(httpPost, response -> {
            log.debug("Slack API response status: {}", response.getCode());
            return null;
        });
    }
}