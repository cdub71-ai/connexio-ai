package ai.connexio.workers;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.littlehorse.sdk.worker.WorkerContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Unit tests for CampaignActionExecutor task worker
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Campaign Action Executor Tests")
class CampaignActionExecutorTest {

    private CampaignActionExecutor executor;
    private ObjectMapper objectMapper;
    
    @Mock
    private WorkerContext mockContext;

    @BeforeEach
    void setUp() {
        executor = new CampaignActionExecutor();
        objectMapper = new ObjectMapper();
    }

    @Nested
    @DisplayName("Email Campaign Tests")
    class EmailCampaignTests {

        @Test
        @DisplayName("Should execute email campaign creation successfully")
        void shouldExecuteEmailCampaignCreationSuccessfully() throws Exception {
            // Given
            ObjectNode intent = createEmailCampaignIntent();
            ObjectNode originalCommand = createOriginalCommand();

            // When
            ObjectNode result = executor.executeCampaignAction(intent, originalCommand, mockContext);

            // Then
            assertNotNull(result);
            assertEquals("create_email_campaign", result.get("action").asText());
            assertEquals("success", result.get("status").asText());
            assertTrue(result.has("campaignId"));
            assertTrue(result.has("message"));
            assertTrue(result.has("timestamp"));
        }

        @Test
        @DisplayName("Should handle email campaign with custom parameters")
        void shouldHandleEmailCampaignWithCustomParameters() throws Exception {
            // Given
            ObjectNode intent = createEmailCampaignIntent();
            intent.putObject("parameters")
                  .put("name", "Custom Email Campaign")
                  .put("subject", "Special Offer")
                  .put("content", "Limited time offer!");
            
            ObjectNode originalCommand = createOriginalCommand();

            // When
            ObjectNode result = executor.executeCampaignAction(intent, originalCommand, mockContext);

            // Then
            assertNotNull(result);
            assertEquals("success", result.get("status").asText());
            assertTrue(result.get("campaignId").asText().startsWith("CAMP-EMAIL-"));
        }

        private ObjectNode createEmailCampaignIntent() {
            ObjectNode intent = objectMapper.createObjectNode();
            intent.put("action", "create_email_campaign");
            intent.put("confidence", 0.9);
            
            ObjectNode parameters = intent.putObject("parameters");
            parameters.put("name", "Test Email Campaign");
            parameters.put("subject", "Test Subject");
            parameters.put("content", "Test content");
            
            return intent;
        }
    }

    @Nested
    @DisplayName("SMS Campaign Tests")
    class SmsCampaignTests {

        @Test
        @DisplayName("Should execute SMS campaign creation successfully")
        void shouldExecuteSmsCampaignCreationSuccessfully() throws Exception {
            // Given
            ObjectNode intent = createSmsCampaignIntent();
            ObjectNode originalCommand = createOriginalCommand();

            // When
            ObjectNode result = executor.executeCampaignAction(intent, originalCommand, mockContext);

            // Then
            assertNotNull(result);
            assertEquals("create_sms_campaign", result.get("action").asText());
            assertEquals("success", result.get("status").asText());
            assertTrue(result.has("campaignId"));
            assertTrue(result.get("campaignId").asText().startsWith("CAMP-SMS-"));
        }

        @Test
        @DisplayName("Should handle SMS campaign with custom message")
        void shouldHandleSmsCarampaignWithCustomMessage() throws Exception {
            // Given
            ObjectNode intent = createSmsCampaignIntent();
            intent.putObject("parameters")
                  .put("name", "Holiday SMS Campaign")
                  .put("message", "🎄 50% off everything! Use code: HOLIDAY50");
            
            ObjectNode originalCommand = createOriginalCommand();

            // When
            ObjectNode result = executor.executeCampaignAction(intent, originalCommand, mockContext);

            // Then
            assertNotNull(result);
            assertEquals("success", result.get("status").asText());
            assertTrue(result.has("details"));
        }

        private ObjectNode createSmsCampaignIntent() {
            ObjectNode intent = objectMapper.createObjectNode();
            intent.put("action", "create_sms_campaign");
            intent.put("confidence", 0.85);
            
            ObjectNode parameters = intent.putObject("parameters");
            parameters.put("name", "Test SMS Campaign");  
            parameters.put("message", "Test SMS message");
            
            return intent;
        }
    }

    @Nested
    @DisplayName("Campaign Status Tests")
    class CampaignStatusTests {

        @Test
        @DisplayName("Should handle get campaign status with valid ID")
        void shouldHandleGetCampaignStatusWithValidId() throws Exception {
            // Given
            ObjectNode intent = createStatusIntent("CAMP-EMAIL-123456");
            ObjectNode originalCommand = createOriginalCommand();

            // When
            ObjectNode result = executor.executeCampaignAction(intent, originalCommand, mockContext);

            // Then
            assertNotNull(result);
            assertEquals("get_campaign_status", result.get("action").asText());
            // Without Sureshot API configured, should return error
            assertEquals("error", result.get("status").asText());
        }

        @Test
        @DisplayName("Should handle get campaign status without ID")
        void shouldHandleGetCampaignStatusWithoutId() throws Exception {
            // Given
            ObjectNode intent = createStatusIntent("");
            ObjectNode originalCommand = createOriginalCommand();

            // When
            ObjectNode result = executor.executeCampaignAction(intent, originalCommand, mockContext);

            // Then
            assertNotNull(result);
            assertEquals("error", result.get("status").asText());
            assertTrue(result.get("message").asText().contains("Campaign ID required"));
        }

        private ObjectNode createStatusIntent(String campaignId) {
            ObjectNode intent = objectMapper.createObjectNode();
            intent.put("action", "get_campaign_status");
            
            ObjectNode parameters = intent.putObject("parameters");
            parameters.put("campaignId", campaignId);
            
            return intent;
        }
    }

    @Nested
    @DisplayName("List Campaigns Tests")
    class ListCampaignsTests {

        @Test
        @DisplayName("Should handle list campaigns successfully")
        void shouldHandleListCampaignsSuccessfully() throws Exception {
            // Given
            ObjectNode intent = createListIntent();
            ObjectNode originalCommand = createOriginalCommand();

            // When
            ObjectNode result = executor.executeCampaignAction(intent, originalCommand, mockContext);

            // Then
            assertNotNull(result);
            assertEquals("list_campaigns", result.get("action").asText());
            assertEquals("success", result.get("status").asText());
            assertTrue(result.has("campaigns"));
            assertTrue(result.get("campaigns").isArray());
        }

        private ObjectNode createListIntent() {
            ObjectNode intent = objectMapper.createObjectNode();
            intent.put("action", "list_campaigns");
            intent.putObject("parameters");
            return intent;
        }
    }

    @Nested
    @DisplayName("Help Tests")
    class HelpTests {

        @Test
        @DisplayName("Should provide help information")
        void shouldProvideHelpInformation() throws Exception {
            // Given
            ObjectNode intent = createHelpIntent();
            ObjectNode originalCommand = createOriginalCommand();

            // When
            ObjectNode result = executor.executeCampaignAction(intent, originalCommand, mockContext);

            // Then
            assertNotNull(result);
            assertEquals("help", result.get("action").asText());
            assertEquals("success", result.get("status").asText());
            assertTrue(result.has("availableCommands"));
            assertTrue(result.get("availableCommands").isArray());
            assertTrue(result.get("availableCommands").size() > 0);
        }

        private ObjectNode createHelpIntent() {
            ObjectNode intent = objectMapper.createObjectNode();
            intent.put("action", "help");
            intent.putObject("parameters");
            return intent;
        }
    }

    @Nested
    @DisplayName("Error Handling Tests")
    class ErrorHandlingTests {

        @Test
        @DisplayName("Should handle unknown action")
        void shouldHandleUnknownAction() throws Exception {
            // Given
            ObjectNode intent = objectMapper.createObjectNode();
            intent.put("action", "unknown_action");
            intent.putObject("parameters");
            
            ObjectNode originalCommand = createOriginalCommand();

            // When
            ObjectNode result = executor.executeCampaignAction(intent, originalCommand, mockContext);

            // Then
            assertNotNull(result);
            assertEquals("unknown_action", result.get("action").asText());
            assertEquals("error", result.get("status").asText());
            assertTrue(result.get("message").asText().contains("Unknown action"));
        }

        @Test
        @DisplayName("Should handle malformed intent")
        void shouldHandleMalformedIntent() throws Exception {
            // Given
            ObjectNode intent = objectMapper.createObjectNode();
            // Missing action field
            
            ObjectNode originalCommand = createOriginalCommand();

            // When
            ObjectNode result = executor.executeCampaignAction(intent, originalCommand, mockContext);

            // Then
            assertNotNull(result);
            assertEquals("error", result.get("status").asText());
        }

        @Test
        @DisplayName("Should handle null parameters gracefully")
        void shouldHandleNullParametersGracefully() throws Exception {
            // Given
            ObjectNode intent = objectMapper.createObjectNode();
            intent.put("action", "create_email_campaign");
            // No parameters object
            
            ObjectNode originalCommand = createOriginalCommand();

            // When
            ObjectNode result = executor.executeCampaignAction(intent, originalCommand, mockContext);

            // Then
            assertNotNull(result);
            assertEquals("success", result.get("status").asText());
            // Should use default parameters
        }
    }

    @Nested
    @DisplayName("Mock Response Tests")
    class MockResponseTests {

        @Test
        @DisplayName("Should generate consistent mock campaign IDs")
        void shouldGenerateConsistentMockCampaignIds() throws Exception {
            // Given
            ObjectNode intent1 = createEmailCampaignIntent();
            ObjectNode intent2 = createSmsCampaignIntent();
            ObjectNode originalCommand = createOriginalCommand();

            // When
            ObjectNode result1 = executor.executeCampaignAction(intent1, originalCommand, mockContext);
            ObjectNode result2 = executor.executeCampaignAction(intent2, originalCommand, mockContext);

            // Then
            String emailId = result1.get("campaignId").asText();
            String smsId = result2.get("campaignId").asText();
            
            assertTrue(emailId.startsWith("CAMP-EMAIL-"));
            assertTrue(smsId.startsWith("CAMP-SMS-"));
            assertNotEquals(emailId, smsId);
        }

        @Test
        @DisplayName("Should include mock details in response")
        void shouldIncludeMockDetailsInResponse() throws Exception {
            // Given
            ObjectNode intent = createEmailCampaignIntent();
            ObjectNode originalCommand = createOriginalCommand();

            // When
            ObjectNode result = executor.executeCampaignAction(intent, originalCommand, mockContext);

            // Then
            assertTrue(result.has("details"));
            JsonNode details = result.get("details");
            
            assertTrue(details.has("id"));
            assertTrue(details.has("type"));
            assertTrue(details.has("status"));
            assertTrue(details.has("createdAt"));
            assertEquals("email", details.get("type").asText());
            assertEquals("draft", details.get("status").asText());
        }

        private ObjectNode createEmailCampaignIntent() {
            ObjectNode intent = objectMapper.createObjectNode();
            intent.put("action", "create_email_campaign");
            intent.putObject("parameters")
                  .put("name", "Test Campaign")
                  .put("subject", "Test Subject");
            return intent;
        }

        private ObjectNode createSmsCampaignIntent() {
            ObjectNode intent = objectMapper.createObjectNode();
            intent.put("action", "create_sms_campaign");
            intent.putObject("parameters")
                  .put("name", "Test SMS")
                  .put("message", "Test Message");
            return intent;
        }
    }

    private ObjectNode createOriginalCommand() {
        ObjectNode command = objectMapper.createObjectNode();
        command.put("command", "/connexio");
        command.put("text", "test command");
        command.put("user_id", "U123TEST");
        command.put("channel_id", "C123TEST");
        return command;
    }
}