package ai.connexio.workers;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.littlehorse.sdk.worker.LHTaskWorker;
import io.littlehorse.sdk.worker.WorkerContext;
import org.apache.hc.client5.http.classic.methods.HttpGet;
import org.apache.hc.client5.http.classic.methods.HttpPost;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.core5.http.io.entity.StringEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Task Worker: Execute Campaign Action
 * 
 * Executes the marketing campaign action based on parsed intent
 * from the Slack command.
 */
@LHTaskWorker("execute-campaign-action")
public class CampaignActionExecutor {
    
    private static final Logger log = LoggerFactory.getLogger(CampaignActionExecutor.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final CloseableHttpClient httpClient = HttpClients.createDefault();
    
    private final String sureshotApiKey = System.getenv("SURESHOT_API_KEY");
    private final String sureshotBaseUrl = System.getenv("SURESHOT_BASE_URL");
    private final String sureshotWorkspaceId = System.getenv("SURESHOT_WORKSPACE_ID");
    
    /**
     * Execute campaign action based on parsed intent
     */
    public ObjectNode executeCampaignAction(JsonNode intent, JsonNode originalCommand, WorkerContext context) {
        log.info("Executing campaign action: {}", intent.get("action").asText());
        
        try {
            String action = intent.get("action").asText();
            JsonNode parameters = intent.get("parameters");
            
            ObjectNode result = objectMapper.createObjectNode();
            result.put("action", action);
            result.put("timestamp", System.currentTimeMillis());
            
            switch (action) {
                case "create_email_campaign":
                    return executeCreateEmailCampaign(parameters, result);
                    
                case "create_sms_campaign":
                    return executeCreateSmsCampaign(parameters, result);
                    
                case "get_campaign_status":
                    return executeGetCampaignStatus(parameters, result);
                    
                case "list_campaigns":
                    return executeListCampaigns(result);
                    
                case "help":
                    return executeHelp(result);
                    
                default:
                    result.put("status", "error");
                    result.put("message", "Unknown action: " + action);
                    return result;
            }
            
        } catch (Exception e) {
            log.error("Failed to execute campaign action: {}", e.getMessage(), e);
            
            ObjectNode errorResult = objectMapper.createObjectNode();
            errorResult.put("status", "error");
            errorResult.put("message", "Execution failed: " + e.getMessage());
            errorResult.put("action", intent.get("action").asText("unknown"));
            return errorResult;
        }
    }
    
    /**
     * Execute create email campaign
     */
    private ObjectNode executeCreateEmailCampaign(JsonNode parameters, ObjectNode result) throws Exception {
        log.info("Creating email campaign with parameters: {}", parameters.toString());
        
        if (sureshotApiKey == null) {
            log.warn("Sureshot API not configured, using mock response");
            return createMockCampaignResult(result, "email", "CAMP-EMAIL-" + System.currentTimeMillis());
        }
        
        // Prepare Sureshot API request
        ObjectNode campaignRequest = objectMapper.createObjectNode();
        campaignRequest.put("workspaceId", sureshotWorkspaceId);
        campaignRequest.put("type", "email");
        campaignRequest.put("name", parameters.path("name").asText("New Email Campaign"));
        campaignRequest.put("subject", parameters.path("subject").asText("Marketing Campaign"));
        campaignRequest.put("content", parameters.path("content").asText("Campaign content"));
        
        // Call Sureshot API
        ObjectNode apiResponse = callSureshotApi("/campaigns", campaignRequest);
        
        result.put("status", "success");
        result.put("campaignId", apiResponse.get("id").asText());
        result.put("message", "Email campaign created successfully");
        result.set("details", apiResponse);
        
        return result;
    }
    
    /**
     * Execute create SMS campaign
     */
    private ObjectNode executeCreateSmsCampaign(JsonNode parameters, ObjectNode result) throws Exception {
        log.info("Creating SMS campaign with parameters: {}", parameters.toString());
        
        if (sureshotApiKey == null) {
            log.warn("Sureshot API not configured, using mock response");
            return createMockCampaignResult(result, "sms", "CAMP-SMS-" + System.currentTimeMillis());
        }
        
        // Prepare Sureshot API request
        ObjectNode campaignRequest = objectMapper.createObjectNode();
        campaignRequest.put("workspaceId", sureshotWorkspaceId);
        campaignRequest.put("type", "sms");
        campaignRequest.put("name", parameters.path("name").asText("New SMS Campaign"));
        campaignRequest.put("message", parameters.path("message").asText("SMS campaign message"));
        
        // Call Sureshot API
        ObjectNode apiResponse = callSureshotApi("/campaigns", campaignRequest);
        
        result.put("status", "success");
        result.put("campaignId", apiResponse.get("id").asText());
        result.put("message", "SMS campaign created successfully");
        result.set("details", apiResponse);
        
        return result;
    }
    
    /**
     * Execute get campaign status
     */
    private ObjectNode executeGetCampaignStatus(JsonNode parameters, ObjectNode result) throws Exception {
        String campaignId = parameters.path("campaignId").asText();
        log.info("Getting status for campaign: {}", campaignId);
        
        if (sureshotApiKey == null || campaignId.isEmpty()) {
            result.put("status", "error");
            result.put("message", "Campaign ID required or API not configured");
            return result;
        }
        
        // Call Sureshot API
        ObjectNode statusResponse = callSureshotApiGet("/campaigns/" + campaignId);
        
        result.put("status", "success");
        result.put("campaignId", campaignId);
        result.set("campaignStatus", statusResponse);
        result.put("message", "Campaign status retrieved");
        
        return result;
    }
    
    /**
     * Execute list campaigns
     */
    private ObjectNode executeListCampaigns(ObjectNode result) throws Exception {
        log.info("Listing campaigns");
        
        if (sureshotApiKey == null) {
            result.put("status", "success");
            result.put("message", "Mock: No campaigns found (API not configured)");
            result.putArray("campaigns");
            return result;
        }
        
        // Call Sureshot API
        ObjectNode campaignsResponse = callSureshotApiGet("/campaigns?workspaceId=" + sureshotWorkspaceId);
        
        result.put("status", "success");
        result.set("campaigns", campaignsResponse.get("data"));
        result.put("message", "Campaigns retrieved successfully");
        
        return result;
    }
    
    /**
     * Execute help action
     */
    private ObjectNode executeHelp(ObjectNode result) {
        log.info("Providing help information");
        
        result.put("status", "success");
        result.put("message", "Connexio.ai Help");
        
        var commands = result.putArray("availableCommands");
        commands.addObject()
            .put("command", "/connexio create email campaign")
            .put("description", "Create a new email marketing campaign");
        commands.addObject()
            .put("command", "/connexio create sms campaign")
            .put("description", "Create a new SMS marketing campaign");
        commands.addObject()
            .put("command", "/connexio status [campaign-id]")
            .put("description", "Check campaign status");
        commands.addObject()
            .put("command", "/connexio list campaigns")
            .put("description", "List all campaigns");
        
        return result;
    }
    
    /**
     * Create mock campaign result for testing
     */
    private ObjectNode createMockCampaignResult(ObjectNode result, String type, String campaignId) {
        result.put("status", "success");
        result.put("campaignId", campaignId);
        result.put("message", type.toUpperCase() + " campaign created successfully (MOCK)");
        
        ObjectNode mockDetails = result.putObject("details");
        mockDetails.put("id", campaignId);
        mockDetails.put("type", type);
        mockDetails.put("status", "draft");
        mockDetails.put("createdAt", System.currentTimeMillis());
        
        return result;
    }
    
    /**
     * Call Sureshot API (POST)
     */
    private ObjectNode callSureshotApi(String endpoint, ObjectNode requestBody) throws Exception {
        HttpPost httpPost = new HttpPost(sureshotBaseUrl + endpoint);
        httpPost.setHeader("Authorization", "Bearer " + sureshotApiKey);
        httpPost.setHeader("Content-Type", "application/json");
        
        String requestBodyStr = objectMapper.writeValueAsString(requestBody);
        httpPost.setEntity(new StringEntity(requestBodyStr));
        
        return httpClient.execute(httpPost, response -> {
            String responseBody = new String(response.getEntity().getContent().readAllBytes());
            return (ObjectNode) objectMapper.readTree(responseBody);
        });
    }
    
    /**
     * Call Sureshot API (GET)
     */
    private ObjectNode callSureshotApiGet(String endpoint) throws Exception {
        HttpGet httpGet = new HttpGet(sureshotBaseUrl + endpoint);
        httpGet.setHeader("Authorization", "Bearer " + sureshotApiKey);
        httpGet.setHeader("Content-Type", "application/json");
        
        return httpClient.execute(httpGet, response -> {
            String responseBody = new String(response.getEntity().getContent().readAllBytes());
            return (ObjectNode) objectMapper.readTree(responseBody);
        });
    }
}