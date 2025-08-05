package ai.connexio.utils;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.Properties;

/**
 * Utility class for test helpers and common test functionality
 */
public class TestUtils {

    private static final ObjectMapper objectMapper = new ObjectMapper();
    private static Properties testProperties;
    private static JsonNode sampleCampaigns;
    private static JsonNode mockResponses;

    static {
        loadTestProperties();
        loadTestData();
    }

    /**
     * Load test properties from test.properties file
     */
    private static void loadTestProperties() {
        testProperties = new Properties();
        try (InputStream is = TestUtils.class.getResourceAsStream("/test.properties")) {
            if (is != null) {
                testProperties.load(is);
            }
        } catch (IOException e) {
            System.err.println("Failed to load test properties: " + e.getMessage());
        }
    }

    /**
     * Load test data from JSON files
     */
    private static void loadTestData() {
        try {
            // Load sample campaigns
            try (InputStream is = TestUtils.class.getResourceAsStream("/../../test-data/sample-campaigns.json")) {
                if (is != null) {
                    sampleCampaigns = objectMapper.readTree(is);
                }
            }

            // Load mock responses
            try (InputStream is = TestUtils.class.getResourceAsStream("/../../test-data/mock-responses.json")) {
                if (is != null) {
                    mockResponses = objectMapper.readTree(is);
                }
            }
        } catch (IOException e) {
            System.err.println("Failed to load test data: " + e.getMessage());
        }
    }

    /**
     * Get test property value
     */
    public static String getTestProperty(String key) {
        return testProperties.getProperty(key);
    }

    /**
     * Get test property value with default
     */
    public static String getTestProperty(String key, String defaultValue) {
        return testProperties.getProperty(key, defaultValue);
    }

    /**
     * Get test property as integer
     */
    public static int getTestPropertyAsInt(String key, int defaultValue) {
        String value = testProperties.getProperty(key);
        if (value != null) {
            try {
                return Integer.parseInt(value);
            } catch (NumberFormatException e) {
                System.err.println("Invalid integer property: " + key + " = " + value);
            }
        }
        return defaultValue;
    }

    /**
     * Get test property as boolean
     */
    public static boolean getTestPropertyAsBoolean(String key, boolean defaultValue) {
        String value = testProperties.getProperty(key);
        if (value != null) {
            return Boolean.parseBoolean(value);
        }
        return defaultValue;
    }

    /**
     * Create a sample Slack command for testing
     */
    public static ObjectNode createSampleSlackCommand(String commandText, String userId, String channelId) {
        ObjectNode command = objectMapper.createObjectNode();
        command.put("command", "/connexio");
        command.put("text", commandText);
        command.put("user_id", userId != null ? userId : "U123TEST");
        command.put("user_name", "test-user");
        command.put("channel_id", channelId != null ? channelId : "C123TEST");
        command.put("channel_name", "test-channel");
        command.put("team_id", "T123TEST");
        command.put("team_domain", "test-domain");
        command.put("trigger_id", "123.456.test");
        return command;
    }

    /**
     * Create a sample Slack command with default values
     */
    public static ObjectNode createSampleSlackCommand(String commandText) {
        return createSampleSlackCommand(commandText, null, null);
    }

    /**
     * Create workflow input for testing
     */
    public static Map<String, Object> createWorkflowInput(String commandText, String userId, String channelId) {
        Map<String, Object> slackCommand = new HashMap<>();
        slackCommand.put("command", "/connexio");
        slackCommand.put("text", commandText);
        slackCommand.put("user_id", userId != null ? userId : "U123TEST");
        slackCommand.put("user_name", "test-user");
        slackCommand.put("channel_id", channelId != null ? channelId : "C123TEST");
        slackCommand.put("channel_name", "test-channel");
        slackCommand.put("team_id", "T123TEST");

        Map<String, Object> input = new HashMap<>();
        input.put("slackCommand", slackCommand);
        input.put("slackChannelId", channelId != null ? channelId : "C123TEST");
        input.put("slackUserId", userId != null ? userId : "U123TEST");
        input.put("slackResponseUrl", "https://hooks.slack.com/commands/test");

        return input;
    }

    /**
     * Create workflow input with default values
     */
    public static Map<String, Object> createWorkflowInput(String commandText) {
        return createWorkflowInput(commandText, null, null);
    }

    /**
     * Get sample campaign data by name
     */
    public static JsonNode getSampleCampaign(String campaignType, String campaignName) {
        if (sampleCampaigns == null) {
            return null;
        }

        JsonNode campaigns = sampleCampaigns.get(campaignType);
        if (campaigns != null && campaigns.isArray()) {
            for (JsonNode campaign : campaigns) {
                if (campaignName.equals(campaign.path("name").asText())) {
                    return campaign;
                }
            }
        }
        return null;
    }

    /**
     * Get mock response by type and key
     */
    public static JsonNode getMockResponse(String responseType, String key) {
        if (mockResponses == null) {
            return null;
        }

        JsonNode responses = mockResponses.get(responseType);
        if (responses != null) {
            return responses.get(key);
        }
        return null;
    }

    /**
     * Get all email campaign samples
     */
    public static JsonNode getEmailCampaignSamples() {
        return sampleCampaigns != null ? sampleCampaigns.get("emailCampaigns") : null;
    }

    /**
     * Get all SMS campaign samples
     */
    public static JsonNode getSmsCampaignSamples() {
        return sampleCampaigns != null ? sampleCampaigns.get("smsCampaigns") : null;
    }

    /**
     * Get help query samples
     */
    public static JsonNode getHelpQuerySamples() {
        return sampleCampaigns != null ? sampleCampaigns.get("helpQueries") : null;
    }

    /**
     * Get edge case samples
     */
    public static JsonNode getEdgeCaseSamples() {
        return sampleCampaigns != null ? sampleCampaigns.get("edgeCases") : null;
    }

    /**
     * Get test suite configuration
     */
    public static JsonNode getTestSuite(String suiteName) {
        if (sampleCampaigns == null) {
            return null;
        }

        JsonNode testSuites = sampleCampaigns.get("testSuites");
        if (testSuites != null) {
            return testSuites.get(suiteName);
        }
        return null;
    }

    /**
     * Create a mock Anthropic response
     */
    public static ObjectNode createMockAnthropicResponse(String action, double confidence) {
        ObjectNode response = objectMapper.createObjectNode();
        
        ObjectNode content = response.putArray("content").addObject();
        
        ObjectNode intentJson = objectMapper.createObjectNode();
        intentJson.put("action", action);
        intentJson.putObject("parameters");
        intentJson.put("confidence", confidence);
        intentJson.put("summary", "Mock response for " + action);
        
        content.put("text", intentJson.toString());
        
        return response;
    }

    /**
     * Create a mock Sureshot campaign response
     */
    public static ObjectNode createMockSureshotResponse(String campaignType, String campaignId) {
        ObjectNode response = objectMapper.createObjectNode();
        response.put("id", campaignId);
        response.put("type", campaignType);
        response.put("name", "Mock " + campaignType.toUpperCase() + " Campaign");
        response.put("status", "draft");
        response.put("createdAt", "2024-01-15T10:30:00Z");
        
        ObjectNode audience = response.putObject("audience");
        audience.put("id", "AUD-MOCK-001");
        audience.put("name", "Mock Audience");
        audience.put("size", 1000);
        
        ObjectNode metrics = response.putObject("metrics");
        metrics.put("sent", 0);
        metrics.put("delivered", 0);
        metrics.put("opened", 0);
        metrics.put("clicked", 0);
        
        return response;
    }

    /**
     * Validate JSON structure
     */
    public static boolean isValidJson(String jsonString) {
        try {
            objectMapper.readTree(jsonString);
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    /**
     * Pretty print JSON for debugging
     */
    public static String prettyPrintJson(Object obj) {
        try {
            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(obj);
        } catch (IOException e) {
            return obj.toString();
        }
    }

    /**
     * Generate a unique test ID
     */
    public static String generateTestId(String prefix) {
        return prefix + "-" + System.currentTimeMillis() + "-" + Thread.currentThread().getId();
    }

    /**
     * Wait for condition with timeout
     */
    public static boolean waitForCondition(ConditionChecker checker, int timeoutSeconds) {
        long startTime = System.currentTimeMillis();
        long timeoutMs = timeoutSeconds * 1000L;
        
        while (System.currentTimeMillis() - startTime < timeoutMs) {
            try {
                if (checker.check()) {
                    return true;
                }
                Thread.sleep(500); // Check every 500ms
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return false;
            } catch (Exception e) {
                // Continue checking
            }
        }
        return false;
    }

    /**
     * Functional interface for condition checking
     */
    @FunctionalInterface
    public interface ConditionChecker {
        boolean check() throws Exception;
    }

    /**
     * Validate workflow result structure
     */
    public static boolean isValidWorkflowResult(JsonNode result) {
        return result != null &&
               result.has("action") &&
               result.has("status") &&
               result.has("timestamp");
    }

    /**
     * Validate campaign result structure
     */
    public static boolean isValidCampaignResult(JsonNode result) {
        return isValidWorkflowResult(result) &&
               (result.get("status").asText().equals("success") ? 
                result.has("campaignId") : result.has("message"));
    }

    /**
     * Get Little Horse connection settings for tests
     */
    public static Map<String, String> getLittleHorseTestConfig() {
        Map<String, String> config = new HashMap<>();
        config.put("host", getTestProperty("littlehorse.test.api.host", "localhost"));
        config.put("port", getTestProperty("littlehorse.test.api.port", "2023"));
        config.put("timeout", getTestProperty("littlehorse.test.timeout.seconds", "30"));
        return config;
    }

    /**
     * Check if integration tests are enabled
     */
    public static boolean isIntegrationTestEnabled() {
        return getTestPropertyAsBoolean("integration.test.enabled", false) ||
               "true".equals(System.getenv("INTEGRATION_TESTS"));
    }

    /**
     * Check if performance tests are enabled
     */
    public static boolean isPerformanceTestEnabled() {
        return getTestPropertyAsBoolean("performance.test.enabled", false) ||
               "true".equals(System.getenv("PERFORMANCE_TESTS"));
    }
}