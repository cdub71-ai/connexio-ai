# Connexio.ai Test Harness

Comprehensive test suite for validating Little Horse workflow functionality in the Connexio.ai marketing campaign system.

## Overview

This test harness provides multiple levels of testing to ensure the reliability and correctness of the marketing campaign workflow system:

- **Unit Tests**: Test individual components and workers in isolation
- **Integration Tests**: Test complete workflow execution with Little Horse
- **Performance Tests**: Validate system performance under load
- **Sample Data**: Realistic test scenarios and mock responses

## Quick Start

### Prerequisites

1. **Java 17+** and **Maven 3.6+**
2. **Little Horse** running locally (for integration tests)
3. **Docker** (for Little Horse setup)

### Running Tests

```bash
# Run unit tests only (default)
./scripts/run-tests.sh

# Run integration tests (requires Little Horse)
./scripts/run-tests.sh --integration

# Run all test types
./scripts/run-tests.sh --all

# Run with custom timeout
./scripts/run-tests.sh --timeout 600
```

### Setup Little Horse for Testing

```bash
# Start Little Horse and dependencies
./scripts/dev-setup.sh

# Deploy workflows
./scripts/deploy-workflows.sh

# Verify setup
./scripts/test-workflow.sh status
```

## Test Structure

### Unit Tests (`workflows/java/src/test/java`)

**MarketingCampaignWorkflowTest.java**
- Workflow structure validation
- Variable definitions
- Task configuration
- Error handling

**SlackCommandParserTest.java**
- Command parsing logic
- Claude API integration
- Fallback mechanisms
- Input validation

**CampaignActionExecutorTest.java**
- Campaign creation logic
- Sureshot API integration
- Mock responses
- Error scenarios

### Integration Tests

**WorkflowIntegrationTest.java**
- End-to-end workflow execution  
- Little Horse integration
- Real workflow variables
- Timeout handling

### Test Data (`tests/test-data/`)

**sample-campaigns.json**
- Email campaign scenarios
- SMS campaign scenarios  
- Status queries
- Help requests
- Edge cases

**mock-responses.json**
- Claude API responses
- Sureshot API responses
- Slack message formats
- Error responses

## Running Specific Test Types

### Unit Tests Only

```bash
./scripts/run-tests.sh --unit
```

Tests individual components without external dependencies:
- ✅ Fast execution (< 30 seconds)
- ✅ No setup required
- ✅ Comprehensive coverage
- ✅ Mocked external services

### Integration Tests

```bash
# Start Little Horse first
./scripts/dev-setup.sh

# Run integration tests
./scripts/run-tests.sh --integration
```

Tests complete workflow execution:
- ✅ Real Little Horse deployment
- ✅ End-to-end validation
- ✅ Workflow state verification
- ✅ Task worker integration

### Performance Tests

```bash
./scripts/run-tests.sh --performance
```

Validates system performance:
- ✅ Concurrent workflow execution
- ✅ Load testing scenarios
- ✅ Success rate measurement
- ✅ Response time analysis

## Test Scenarios

### Email Campaigns

1. **Product Launch Campaign**
   - Command: `create email campaign for new premium product launch`
   - Expected: Email campaign with premium audience
   - Validates: Complex parameter extraction

2. **Holiday Sale Campaign**
   - Command: `create email campaign for holiday sale 40% off`
   - Expected: Promotional email with discount
   - Validates: Discount code extraction

3. **Newsletter Automation**
   - Command: `create weekly newsletter email campaign`
   - Expected: Recurring newsletter setup
   - Validates: Frequency detection

### SMS Campaigns

1. **Flash Sale Alert**
   - Command: `create sms campaign flash sale 24 hours only`
   - Expected: Urgent SMS with time limit
   - Validates: Urgency detection

2. **Appointment Reminder**
   - Command: `create sms campaign appointment reminder tomorrow 2pm`
   - Expected: Scheduled reminder SMS
   - Validates: Date/time parsing

3. **Welcome Series**
   - Command: `create sms campaign welcome new customers`
   - Expected: Onboarding SMS sequence
   - Validates: Audience segmentation

### Status & Help

1. **Campaign Status Query**
   - Command: `status CAMP-EMAIL-1234567890`
   - Expected: Campaign metrics and status
   - Validates: ID extraction and lookup

2. **Help Request**
   - Command: `help`
   - Expected: Available commands and examples
   - Validates: Help content generation

### Edge Cases

1. **Empty Commands**
   - Command: `` (empty)
   - Expected: Default help response
   - Validates: Graceful handling

2. **Long Commands**
   - Command: Very long text (500+ chars)
   - Expected: Successful parsing
   - Validates: Text processing limits

3. **Special Characters**
   - Command: `create email 🎉 50% OFF!!! @everyone`
   - Expected: Proper character handling
   - Validates: Unicode and special chars

## Test Configuration

### Environment Variables

```bash
# Little Horse connection
export LITTLEHORSE_API_HOST=localhost
export LITTLEHORSE_API_PORT=2023

# Enable integration tests
export INTEGRATION_TESTS=true

# API keys for full integration (optional)
export ANTHROPIC_API_KEY=your-key
export SURESHOT_API_KEY=your-key
export SLACK_BOT_TOKEN=your-token
```

### Maven Configuration

```xml
<!-- Unit tests only -->
mvn test -Dtest=!**/*IntegrationTest

<!-- Integration tests only -->
mvn test -Dtest=**/*IntegrationTest

<!-- All tests with coverage -->
mvn test jacoco:report
```

## Test Reports

Test execution generates comprehensive reports:

### Console Output
- ✅ Real-time test progress
- ✅ Success/failure indicators  
- ✅ Error summaries
- ✅ Performance metrics

### Log Files (`test-reports/`)
- `unit-tests-TIMESTAMP.log` - Detailed unit test output
- `integration-tests-TIMESTAMP.log` - Integration test results
- `performance-tests-TIMESTAMP.log` - Performance test metrics
- `test-summary-TIMESTAMP.html` - HTML report with links

### Coverage Reports
- Location: `workflows/java/target/site/jacoco/index.html`
- Metrics: Line, branch, and method coverage
- Thresholds: 80% minimum coverage required

## Continuous Integration

### GitHub Actions Integration

```yaml
name: Test Workflow
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-java@v3
        with:
          java-version: '17'
      - name: Start Little Horse
        run: ./scripts/dev-setup.sh
      - name: Run Tests
        run: ./scripts/run-tests.sh --all
```

### Pre-commit Hooks

```bash
# Install pre-commit hook
echo './scripts/run-tests.sh --unit' > .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

## Troubleshooting

### Common Issues

**Unit Tests Failing**
```bash
# Check Java version
java -version

# Clean and rebuild
cd workflows/java && mvn clean compile test-compile
```

**Integration Tests Timeout**
```bash
# Check Little Horse status
curl http://localhost:9090/health

# Restart Little Horse
./scripts/dev-setup.sh restart
```

**Performance Tests Low Success Rate**
```bash
# Check system resources
top
df -h

# Reduce concurrency
# Edit run-tests.sh and lower test count
```

### Debug Mode

```bash
# Enable debug logging
export MAVEN_OPTS="-Xdebug -Xrunjdwp:transport=dt_socket,server=y,suspend=n,address=5005"

# Run with verbose output
./scripts/run-tests.sh --unit -X
```

### Test Data Validation

```bash
# Validate JSON test data
python -m json.tool tests/test-data/sample-campaigns.json
python -m json.tool tests/test-data/mock-responses.json

# Test sample scenarios manually
./scripts/test-workflow.sh email
./scripts/test-workflow.sh sms
./scripts/test-workflow.sh help
```

## Contributing

### Adding New Tests

1. **Unit Tests**: Add to appropriate `*Test.java` file
2. **Integration Tests**: Add to `WorkflowIntegrationTest.java`
3. **Test Data**: Update JSON files with new scenarios
4. **Documentation**: Update this README

### Test Naming Convention

```java
@Test
@DisplayName("Should handle email campaign with custom parameters")
void shouldHandleEmailCampaignWithCustomParameters() {
    // Test implementation
}
```

### Mock Data Guidelines

1. Use realistic campaign names and content
2. Include both success and error scenarios
3. Maintain consistent ID formats
4. Document expected behaviors

## Performance Benchmarks

### Target Metrics

- **Unit Tests**: < 30 seconds total
- **Integration Tests**: < 5 minutes total  
- **Workflow Execution**: < 10 seconds per workflow
- **Success Rate**: > 95% under normal load
- **Concurrent Workflows**: 50+ simultaneous executions

### Monitoring

```bash
# Real-time performance monitoring
./scripts/test-workflow.sh monitor WORKFLOW_ID

# Load testing
for i in {1..20}; do
  ./scripts/test-workflow.sh email &
done
wait
```

## Security Considerations

- Test data contains no real API keys or secrets
- Mock responses simulate real API behavior
- Integration tests use local Little Horse instance
- No production data in test scenarios

## Support

For issues with the test harness:

1. Check the troubleshooting section above
2. Review test logs in `test-reports/`
3. Verify Little Horse is running and healthy
4. Check environment variable configuration

The test harness is designed to be reliable and provide clear feedback on system health and workflow correctness.