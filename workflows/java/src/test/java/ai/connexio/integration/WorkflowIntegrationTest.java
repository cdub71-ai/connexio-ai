package ai.connexio.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.littlehorse.sdk.common.config.LHConfig;
import io.littlehorse.sdk.common.proto.LHStatus;
import io.littlehorse.sdk.common.proto.WorkflowRun;
import io.littlehorse.sdk.worker.LHTaskWorkerFactory;
import ai.connexio.workflows.MarketingCampaignWorkflow;
import ai.connexio.workers.SlackCommandParser;
import ai.connexio.workers.CampaignActionExecutor;
import ai.connexio.workers.SlackResponseSender;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Integration tests for Marketing Campaign Workflow with Little Horse
 * 
 * These tests require a running Little Horse instance.
 * Set INTEGRATION_TESTS=true environment variable to enable.
 */
@EnabledIfEnvironmentVariable(named = "INTEGRATION_TESTS", matches = "true")
@DisplayName("Workflow Integration Tests")
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class WorkflowIntegrationTest {

    private static LHConfig lhConfig;
    private static LHTaskWorkerFactory workerFactory;
    private static ObjectMapper objectMapper;
    
    private static final String WORKFLOW_NAME = "marketing-campaign-workflow";
    private static final int WORKFLOW_TIMEOUT_SECONDS = 30;

    @BeforeAll
    static void setUpClass() throws Exception {
        System.out.println("🚀 Setting up Integration Tests");
        
        objectMapper = new ObjectMapper();
        
        // Initialize Little Horse configuration
        lhConfig = createTestLHConfig();
        
        // Deploy workflow
        MarketingCampaignWorkflow.deployWorkflow(lhConfig);
        
        // Start task workers
        startTaskWorkers();
        
        // Wait for workers to be ready
        Thread.sleep(5000);
        
        System.out.println("✅ Integration test setup complete");
    }

    @AfterAll
    static void tearDownClass() throws Exception {
        if (workerFactory != null) {
            workerFactory.close();
        }
        System.out.println("🧹 Integration test cleanup complete");
    }

    @Nested
    @DisplayName("Email Campaign Integration Tests")
    class EmailCampaignIntegrationTests {

        @Test
        @Order(1)
        @DisplayName("Should execute complete email campaign workflow")
        void shouldExecuteCompleteEmailCampaignWorkflow() throws Exception {
            // Given
            Map<String, Object> workflowInput = createEmailCampaignInput();

            // When
            WorkflowRun workflowRun = runWorkflowAndWait(workflowInput);

            // Then
            assertEquals(LHStatus.COMPLETED, workflowRun.getStatus());
            assertNotNull(workflowRun.getId());
            
            // Verify workflow variables
            JsonNode finalStatus = getWorkflowVariable(workflowRun, "finalStatus");
            assertNotNull(finalStatus);
            assertEquals("success", finalStatus.asText());
        }

        @Test
        @Order(2)
        @DisplayName("Should handle email campaign with custom parameters")
        void shouldHandleEmailCampaignWithCustomParameters() throws Exception {
            // Given
            Map<String, Object> workflowInput = createCustomEmailCampaignInput();

            // When
            WorkflowRun workflowRun = runWorkflowAndWait(workflowInput);

            // Then
            assertEquals(LHStatus.COMPLETED, workflowRun.getStatus());
            
            // Verify campaign result contains custom parameters
            JsonNode campaignResult = getWorkflowVariable(workflowRun, "campaignResult");
            assertNotNull(campaignResult);
            assertTrue(campaignResult.has("campaignId"));
        }

        private Map<String, Object> createEmailCampaignInput() {
            Map<String, Object> slackCommand = new HashMap<>();
            slackCommand.put("command", "/connexio");
            slackCommand.put("text", "create email campaign for product launch");
            slackCommand.put("user_id", "U123TEST");
            slackCommand.put("user_name", "test-user");
            slackCommand.put("channel_id", "C123TEST");
            slackCommand.put("channel_name", "test-channel");
            slackCommand.put("team_id", "T123TEST");

            Map<String, Object> input = new HashMap<>();
            input.put("slackCommand", slackCommand);
            input.put("slackChannelId", "C123TEST");
            input.put("slackUserId", "U123TEST");
            input.put("slackResponseUrl", "https://hooks.slack.com/commands/test");

            return input;
        }

        private Map<String, Object> createCustomEmailCampaignInput() {
            Map<String, Object> slackCommand = new HashMap<>();
            slackCommand.put("command", "/connexio");
            slackCommand.put("text", "create email campaign 'Summer Sale' with subject 'Get 30% Off Everything'");
            slackCommand.put("user_id", "U456TEST");
            slackCommand.put("user_name", "marketing-user");
            slackCommand.put("channel_id", "C456TEST");

            Map<String, Object> input = new HashMap<>();
            input.put("slackCommand", slackCommand);
            input.put("slackChannelId", "C456TEST");
            input.put("slackUserId", "U456TEST");
            input.put("slackResponseUrl", "https://hooks.slack.com/commands/test");

            return input;
        }
    }

    @Nested
    @DisplayName("SMS Campaign Integration Tests")
    class SmsCampaignIntegrationTests {

        @Test
        @Order(3)
        @DisplayName("Should execute complete SMS campaign workflow")
        void shouldExecuteCompleteSmsCampaignWorkflow() throws Exception {
            // Given
            Map<String, Object> workflowInput = createSmsCampaignInput();

            // When
            WorkflowRun workflowRun = runWorkflowAndWait(workflowInput);

            // Then
            assertEquals(LHStatus.COMPLETED, workflowRun.getStatus());
            
            // Verify campaign result
            JsonNode campaignResult = getWorkflowVariable(workflowRun, "campaignResult");
            assertNotNull(campaignResult);
            assertEquals("create_sms_campaign", campaignResult.get("action").asText());
            assertEquals("success", campaignResult.get("status").asText());
        }

        private Map<String, Object> createSmsCampaignInput() {
            Map<String, Object> slackCommand = new HashMap<>();
            slackCommand.put("command", "/connexio");
            slackCommand.put("text", "create sms campaign holiday sale 50% off everything");
            slackCommand.put("user_id", "U789TEST");
            slackCommand.put("channel_id", "C789TEST");

            Map<String, Object> input = new HashMap<>();
            input.put("slackCommand", slackCommand);
            input.put("slackChannelId", "C789TEST");
            input.put("slackUserId", "U789TEST");
            input.put("slackResponseUrl", "https://hooks.slack.com/commands/test");

            return input;
        }
    }

    @Nested
    @DisplayName("Help and Status Integration Tests")
    class HelpAndStatusIntegrationTests {

        @Test
        @Order(4)
        @DisplayName("Should execute help workflow successfully")
        void shouldExecuteHelpWorkflowSuccessfully() throws Exception {
            // Given
            Map<String, Object> workflowInput = createHelpInput();

            // When
            WorkflowRun workflowRun = runWorkflowAndWait(workflowInput);

            // Then
            assertEquals(LHStatus.COMPLETED, workflowRun.getStatus());
            
            // Verify help result
            JsonNode campaignResult = getWorkflowVariable(workflowRun, "campaignResult");
            assertNotNull(campaignResult);
            assertEquals("help", campaignResult.get("action").asText());
            assertTrue(campaignResult.has("availableCommands"));
        }

        @Test
        @Order(5)
        @DisplayName("Should handle campaign status request")
        void shouldHandleCampaignStatusRequest() throws Exception {
            // Given
            Map<String, Object> workflowInput = createStatusInput();

            // When
            WorkflowRun workflowRun = runWorkflowAndWait(workflowInput);

            // Then
            assertEquals(LHStatus.COMPLETED, workflowRun.getStatus());
            
            // Status requests without API configured should return error but complete
            JsonNode campaignResult = getWorkflowVariable(workflowRun, "campaignResult");
            assertNotNull(campaignResult);
            assertEquals("get_campaign_status", campaignResult.get("action").asText());
        }

        private Map<String, Object> createHelpInput() {
            Map<String, Object> slackCommand = new HashMap<>();
            slackCommand.put("command", "/connexio");
            slackCommand.put("text", "help");
            slackCommand.put("user_id", "U999TEST");
            slackCommand.put("channel_id", "C999TEST");

            Map<String, Object> input = new HashMap<>();
            input.put("slackCommand", slackCommand);
            input.put("slackChannelId", "C999TEST");
            input.put("slackUserId", "U999TEST");
            input.put("slackResponseUrl", "https://hooks.slack.com/commands/test");

            return input;
        }

        private Map<String, Object> createStatusInput() {
            Map<String, Object> slackCommand = new HashMap<>();
            slackCommand.put("command", "/connexio");
            slackCommand.put("text", "status CAMP-EMAIL-123456");
            slackCommand.put("user_id", "U111TEST");
            slackCommand.put("channel_id", "C111TEST");

            Map<String, Object> input = new HashMap<>();
            input.put("slackCommand", slackCommand);
            input.put("slackChannelId", "C111TEST");
            input.put("slackUserId", "U111TEST");
            input.put("slackResponseUrl", "https://hooks.slack.com/commands/test");

            return input;
        }
    }

    @Nested
    @DisplayName("Error Handling Integration Tests")
    class ErrorHandlingIntegrationTests {

        @Test
        @Order(6)
        @DisplayName("Should handle malformed input gracefully")
        void shouldHandleMalformedInputGracefully() throws Exception {
            // Given
            Map<String, Object> workflowInput = createMalformedInput();

            // When
            WorkflowRun workflowRun = runWorkflowAndWait(workflowInput);

            // Then
            // Should complete even with malformed input (error handling)
            assertTrue(workflowRun.getStatus() == LHStatus.COMPLETED || 
                      workflowRun.getStatus() == LHStatus.EXCEPTION);
        }

        @Test
        @Order(7)
        @DisplayName("Should handle unknown commands gracefully")
        void shouldHandleUnknownCommandsGracefully() throws Exception {
            // Given
            Map<String, Object> workflowInput = createUnknownCommandInput();

            // When
            WorkflowRun workflowRun = runWorkflowAndWait(workflowInput);

            // Then
            assertEquals(LHStatus.COMPLETED, workflowRun.getStatus());
            
            // Should default to help or handle gracefully
            JsonNode campaignResult = getWorkflowVariable(workflowRun, "campaignResult");
            assertNotNull(campaignResult);
        }

        private Map<String, Object> createMalformedInput() {
            Map<String, Object> slackCommand = new HashMap<>();
            // Missing required fields
            slackCommand.put("text", "malformed command");

            Map<String, Object> input = new HashMap<>();
            input.put("slackCommand", slackCommand);
            input.put("slackChannelId", "C222TEST");
            input.put("slackUserId", "U222TEST");

            return input;
        }

        private Map<String, Object> createUnknownCommandInput() {
            Map<String, Object> slackCommand = new HashMap<>();
            slackCommand.put("command", "/connexio");
            slackCommand.put("text", "unknown random command that makes no sense");
            slackCommand.put("user_id", "U333TEST");
            slackCommand.put("channel_id", "C333TEST");

            Map<String, Object> input = new HashMap<>();
            input.put("slackCommand", slackCommand);
            input.put("slackChannelId", "C333TEST");
            input.put("slackUserId", "U333TEST");
            input.put("slackResponseUrl", "https://hooks.slack.com/commands/test");

            return input;
        }
    }

    // Utility methods

    private static LHConfig createTestLHConfig() {
        LHConfig config = new LHConfig();
        
        // Use environment variables or defaults
        String host = System.getenv("LITTLEHORSE_API_HOST");
        String port = System.getenv("LITTLEHORSE_API_PORT");
        
        if (host != null) {
            config.setApiHost(host);
        } else {
            config.setApiHost("localhost");
        }
        
        if (port != null) {
            config.setApiPort(Integer.parseInt(port));
        } else {
            config.setApiPort(2023);
        }
        
        return config;
    }

    private static void startTaskWorkers() throws Exception {
        workerFactory = new LHTaskWorkerFactory(lhConfig);
        
        // Register task workers
        workerFactory.registerTaskWorker(new SlackCommandParser());
        workerFactory.registerTaskWorker(new CampaignActionExecutor());
        workerFactory.registerTaskWorker(new SlackResponseSender());
        
        // Start workers
        workerFactory.start();
    }

    private WorkflowRun runWorkflowAndWait(Map<String, Object> input) throws Exception {
        // Run workflow
        WorkflowRun workflowRun = lhConfig.getBlockingStub()
            .runWf(lhConfig.getRunWfRequestBuilder(WORKFLOW_NAME, input).build())
            .getWorkflowRun();

        // Wait for completion
        return waitForWorkflowCompletion(workflowRun.getId().getId());
    }

    private WorkflowRun waitForWorkflowCompletion(String workflowRunId) throws Exception {
        int attempts = 0;
        int maxAttempts = WORKFLOW_TIMEOUT_SECONDS;
        
        while (attempts < maxAttempts) {
            WorkflowRun workflowRun = lhConfig.getBlockingStub()
                .getWfRun(lhConfig.getWfRunIdBuilder(workflowRunId).build())
                .getWorkflowRun();
            
            LHStatus status = workflowRun.getStatus();
            
            if (status == LHStatus.COMPLETED || status == LHStatus.EXCEPTION || status == LHStatus.ERROR) {
                return workflowRun;
            }
            
            Thread.sleep(1000); // Wait 1 second
            attempts++;
        }
        
        throw new RuntimeException("Workflow did not complete within timeout: " + WORKFLOW_TIMEOUT_SECONDS + " seconds");
    }

    private JsonNode getWorkflowVariable(WorkflowRun workflowRun, String variableName) throws Exception {
        // This would extract variable values from the workflow run
        // Implementation depends on LittleHorse SDK version
        
        // For now, return null as placeholder
        // In real implementation, you'd extract the variable value
        return null;
    }
}