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
import static org.mockito.Mockito.*;

/**
 * Unit tests for SlackCommandParser task worker
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Slack Command Parser Tests")
class SlackCommandParserTest {

    private SlackCommandParser parser;
    private ObjectMapper objectMapper;
    
    @Mock
    private WorkerContext mockContext;

    @BeforeEach
    void setUp() {
        parser = new SlackCommandParser();
        objectMapper = new ObjectMapper();
    }

    @Nested
    @DisplayName("Command Parsing Tests")
    class CommandParsingTests {

        @Test
        @DisplayName("Should parse create email campaign command")
        void shouldParseCreateEmailCampaignCommand() throws Exception {
            // Given
            ObjectNode command = objectMapper.createObjectNode();
            command.put("command", "/connexio");
            command.put("text", "create email campaign for product launch");
            
            String userId = "U123TEST";
            String channelId = "C123TEST";

            // When
            ObjectNode result = parser.parseSlackCommand(command, userId, channelId, mockContext);

            // Then
            assertNotNull(result);
            assertEquals(userId, result.get("userId").asText());
            assertEquals(channelId, result.get("channelId").asText());
            assertTrue(result.has("action"));
            assertTrue(result.has("timestamp"));
        }

        @Test
        @DisplayName("Should parse create SMS campaign command")
        void shouldParseCreateSmsCampaignCommand() throws Exception {
            // Given
            ObjectNode command = objectMapper.createObjectNode();
            command.put("command", "/connexio");
            command.put("text", "create sms campaign holiday sale");
            
            String userId = "U456TEST";
            String channelId = "C456TEST";

            // When
            ObjectNode result = parser.parseSlackCommand(command, userId, channelId, mockContext);

            // Then
            assertNotNull(result);
            assertEquals(userId, result.get("userId").asText());
            assertEquals(channelId, result.get("channelId").asText());
            assertTrue(result.has("action"));
        }

        @Test
        @DisplayName("Should parse help command")
        void shouldParseHelpCommand() throws Exception {
            // Given
            ObjectNode command = objectMapper.createObjectNode();
            command.put("command", "/connexio");
            command.put("text", "help");
            
            String userId = "U789TEST";
            String channelId = "C789TEST";

            // When
            ObjectNode result = parser.parseSlackCommand(command, userId, channelId, mockContext);

            // Then
            assertNotNull(result);
            assertEquals("help", result.get("action").asText());
            assertEquals(userId, result.get("userId").asText());
            assertEquals(channelId, result.get("channelId").asText());
        }

        @Test
        @DisplayName("Should parse status command")
        void shouldParseStatusCommand() throws Exception {
            // Given
            ObjectNode command = objectMapper.createObjectNode();
            command.put("command", "/connexio");
            command.put("text", "status CAMP-123");
            
            String userId = "U999TEST";
            String channelId = "C999TEST";

            // When
            ObjectNode result = parser.parseSlackCommand(command, userId, channelId, mockContext);

            // Then
            assertNotNull(result);
            assertTrue(result.has("action"));
            assertEquals(userId, result.get("userId").asText());
            assertEquals(channelId, result.get("channelId").asText());
        }
    }

    @Nested
    @DisplayName("Fallback Parsing Tests")
    class FallbackParsingTests {

        @Test
        @DisplayName("Should use fallback parsing when Claude API unavailable")
        void shouldUseFallbackParsingWhenClaudeApiUnavailable() throws Exception {
            // Given - parser without ANTHROPIC_API_KEY environment variable
            ObjectNode command = objectMapper.createObjectNode();
            command.put("command", "/create-campaign");
            command.put("text", "email campaign");
            
            String userId = "U123FALLBACK";
            String channelId = "C123FALLBACK";

            // When
            ObjectNode result = parser.parseSlackCommand(command, userId, channelId, mockContext);

            // Then
            assertNotNull(result);
            assertTrue(result.has("action"));
            assertTrue(result.has("confidence"));
            assertEquals(0.7, result.get("confidence").asDouble(), 0.1);
        }

        @Test
        @DisplayName("Should handle empty command text")
        void shouldHandleEmptyCommandText() throws Exception {
            // Given
            ObjectNode command = objectMapper.createObjectNode();
            command.put("command", "/connexio");
            command.put("text", "");
            
            String userId = "U123EMPTY";
            String channelId = "C123EMPTY";

            // When
            ObjectNode result = parser.parseSlackCommand(command, userId, channelId, mockContext);

            // Then
            assertNotNull(result);
            assertEquals("help", result.get("action").asText());
        }

        @Test
        @DisplayName("Should handle unknown commands")
        void shouldHandleUnknownCommands() throws Exception {
            // Given
            ObjectNode command = objectMapper.createObjectNode();
            command.put("command", "/connexio");
            command.put("text", "unknown random command");
            
            String userId = "U123UNKNOWN";
            String channelId = "C123UNKNOWN";

            // When
            ObjectNode result = parser.parseSlackCommand(command, userId, channelId, mockContext);

            // Then
            assertNotNull(result);
            assertTrue(result.has("action"));
            // Should default to help or handle gracefully
        }
    }

    @Nested
    @DisplayName("Error Handling Tests")
    class ErrorHandlingTests {

        @Test
        @DisplayName("Should handle malformed command input")
        void shouldHandleMalformedCommandInput() throws Exception {
            // Given
            ObjectNode command = objectMapper.createObjectNode();
            // Missing required fields
            
            String userId = "U123ERROR";
            String channelId = "C123ERROR";

            // When
            ObjectNode result = parser.parseSlackCommand(command, userId, channelId, mockContext);

            // Then
            assertNotNull(result);
            assertEquals("error", result.get("action").asText());
            assertTrue(result.has("error"));
        }

        @Test
        @DisplayName("Should handle null input gracefully")
        void shouldHandleNullInputGracefully() throws Exception {
            // Given
            JsonNode nullCommand = null;
            String userId = "U123NULL";
            String channelId = "C123NULL";

            // When & Then
            assertThrows(Exception.class, () -> {
                parser.parseSlackCommand(nullCommand, userId, channelId, mockContext);
            });
        }

        @Test
        @DisplayName("Should handle network errors from Claude API")
        void shouldHandleNetworkErrorsFromClaudeApi() throws Exception {
            // This test would require mocking HTTP client behavior
            // For now, we test that the parser doesn't crash
            
            ObjectNode command = objectMapper.createObjectNode();
            command.put("command", "/connexio");
            command.put("text", "test command");
            
            String userId = "U123NETWORK";
            String channelId = "C123NETWORK";

            // When
            ObjectNode result = parser.parseSlackCommand(command, userId, channelId, mockContext);

            // Then - should not throw exception and should provide fallback result
            assertNotNull(result);
            assertTrue(result.has("action"));
        }
    }

    @Nested
    @DisplayName("Result Structure Tests")
    class ResultStructureTests {

        @Test
        @DisplayName("Should return properly structured result")
        void shouldReturnProperlyStructuredResult() throws Exception {
            // Given
            ObjectNode command = objectMapper.createObjectNode();
            command.put("command", "/connexio");
            command.put("text", "create email campaign");
            
            String userId = "U123STRUCT";
            String channelId = "C123STRUCT";

            // When
            ObjectNode result = parser.parseSlackCommand(command, userId, channelId, mockContext);

            // Then
            assertNotNull(result);
            
            // Required fields
            assertTrue(result.has("action"));
            assertTrue(result.has("userId"));
            assertTrue(result.has("channelId"));
            assertTrue(result.has("timestamp"));
            assertTrue(result.has("originalCommand"));
            
            // Optional fields based on action
            if (result.has("parameters")) {
                assertTrue(result.get("parameters").isObject());
            }
            
            if (result.has("confidence")) {
                assertTrue(result.get("confidence").isNumber());
                double confidence = result.get("confidence").asDouble();
                assertTrue(confidence >= 0.0 && confidence <= 1.0);
            }
        }

        @Test
        @DisplayName("Should include metadata in result")
        void shouldIncludeMetadataInResult() throws Exception {
            // Given
            ObjectNode command = objectMapper.createObjectNode();
            command.put("command", "/connexio");
            command.put("text", "help");
            
            String userId = "U123META";
            String channelId = "C123META";

            // When
            ObjectNode result = parser.parseSlackCommand(command, userId, channelId, mockContext);

            // Then
            assertEquals(userId, result.get("userId").asText());
            assertEquals(channelId, result.get("channelId").asText());
            assertEquals("help", result.get("originalCommand").asText());
            assertTrue(result.get("timestamp").asLong() > 0);
        }
    }
}