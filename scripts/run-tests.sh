#!/bin/bash

# Connexio.ai Test Runner Script
# Comprehensive test harness for workflow validation

set -e

echo "🧪 Connexio.ai Test Runner"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

WORKFLOWS_DIR="workflows/java"
TEST_REPORTS_DIR="test-reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create test reports directory
mkdir -p "$TEST_REPORTS_DIR"

# Test configuration
UNIT_TESTS="true"
INTEGRATION_TESTS="false"
PERFORMANCE_TESTS="false"
COVERAGE_REPORT="true"
TEST_TIMEOUT="300" # 5 minutes

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --unit)
                UNIT_TESTS="true"
                shift
                ;;
            --integration)
                INTEGRATION_TESTS="true"
                shift
                ;;
            --performance)
                PERFORMANCE_TESTS="true"
                shift
                ;;
            --all)
                UNIT_TESTS="true"
                INTEGRATION_TESTS="true"
                PERFORMANCE_TESTS="true"
                shift
                ;;
            --no-coverage)
                COVERAGE_REPORT="false"
                shift
                ;;
            --timeout)
                TEST_TIMEOUT="$2"
                shift 2
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                echo -e "${RED}Unknown option: $1${NC}"
                show_help
                exit 1
                ;;
        esac
    done
}

# Show help information
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --unit              Run unit tests only (default)"
    echo "  --integration       Run integration tests (requires Little Horse)"
    echo "  --performance       Run performance tests"
    echo "  --all               Run all test types"
    echo "  --no-coverage       Skip coverage report generation"
    echo "  --timeout SECONDS   Test timeout in seconds (default: 300)"
    echo "  --help              Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                  # Run unit tests only"
    echo "  $0 --integration    # Run integration tests"
    echo "  $0 --all            # Run all tests"
    echo "  $0 --unit --no-coverage  # Unit tests without coverage"
}

# Check prerequisites
check_prerequisites() {
    echo -e "${BLUE}Checking prerequisites...${NC}"
    
    # Check Java
    if ! command -v java &> /dev/null; then
        echo -e "${RED}❌ Java not found${NC}"
        exit 1
    fi
    
    # Check Maven
    if ! command -v mvn &> /dev/null; then
        echo -e "${RED}❌ Maven not found${NC}"
        exit 1
    fi
    
    # Check workflows directory
    if [ ! -d "$WORKFLOWS_DIR" ]; then
        echo -e "${RED}❌ Workflows directory not found: $WORKFLOWS_DIR${NC}"
        exit 1
    fi
    
    # Check if Little Horse is running for integration tests
    if [ "$INTEGRATION_TESTS" = "true" ]; then
        check_littlehorse_connection
    fi
    
    echo -e "${GREEN}✅ Prerequisites OK${NC}"
}

# Check Little Horse connection
check_littlehorse_connection() {
    echo -e "${BLUE}Checking Little Horse connection...${NC}"
    
    LH_HOST=${LITTLEHORSE_API_HOST:-localhost}
    
    if ! curl -f "http://${LH_HOST}:9090/health" > /dev/null 2>&1; then
        echo -e "${RED}❌ Little Horse not running or not healthy${NC}"
        echo -e "${YELLOW}💡 Start Little Horse with: ./scripts/dev-setup.sh${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Little Horse connection OK${NC}"
}

# Build project
build_project() {
    echo -e "${BLUE}Building project...${NC}"
    
    cd "$WORKFLOWS_DIR"
    
    echo "Compiling sources..."
    mvn clean compile -q
    
    echo "Compiling test sources..."
    mvn test-compile -q
    
    cd - > /dev/null
    
    echo -e "${GREEN}✅ Build complete${NC}"
}

# Run unit tests
run_unit_tests() {
    echo -e "${BLUE}Running unit tests...${NC}"
    
    cd "$WORKFLOWS_DIR"
    
    local test_cmd="mvn test -Dtest=!**/*IntegrationTest"
    
    if [ "$COVERAGE_REPORT" = "true" ]; then
        test_cmd="$test_cmd jacoco:report"
    fi
    
    # Add timeout
    timeout "$TEST_TIMEOUT" $test_cmd > "../../../$TEST_REPORTS_DIR/unit-tests-${TIMESTAMP}.log" 2>&1
    local exit_code=$?
    
    cd - > /dev/null
    
    if [ $exit_code -eq 0 ]; then
        echo -e "${GREEN}✅ Unit tests passed${NC}"
        return 0
    else
        echo -e "${RED}❌ Unit tests failed${NC}"
        echo "Check log: $TEST_REPORTS_DIR/unit-tests-${TIMESTAMP}.log"
        return 1
    fi
}

# Run integration tests
run_integration_tests() {
    echo -e "${BLUE}Running integration tests...${NC}"
    
    cd "$WORKFLOWS_DIR"
    
    # Set environment variable to enable integration tests
    export INTEGRATION_TESTS=true
    
    local test_cmd="mvn test -Dtest=**/*IntegrationTest"
    
    timeout "$TEST_TIMEOUT" $test_cmd > "../../../$TEST_REPORTS_DIR/integration-tests-${TIMESTAMP}.log" 2>&1
    local exit_code=$?
    
    cd - > /dev/null
    
    if [ $exit_code -eq 0 ]; then
        echo -e "${GREEN}✅ Integration tests passed${NC}"
        return 0
    else
        echo -e "${RED}❌ Integration tests failed${NC}"
        echo "Check log: $TEST_REPORTS_DIR/integration-tests-${TIMESTAMP}.log"
        return 1
    fi
}

# Run performance tests
run_performance_tests() {
    echo -e "${BLUE}Running performance tests...${NC}"
    
    # Performance tests using test-workflow.sh
    local performance_log="$TEST_REPORTS_DIR/performance-tests-${TIMESTAMP}.log"
    
    echo "Starting performance test suite..." > "$performance_log"
    echo "Timestamp: $(date)" >> "$performance_log"
    echo "========================================" >> "$performance_log"
    
    # Run multiple workflows concurrently
    local total_tests=0
    local successful_tests=0
    local test_scenarios=("email" "sms" "help")
    
    for scenario in "${test_scenarios[@]}"; do
        echo "Testing scenario: $scenario" >> "$performance_log"
        
        for i in {1..10}; do
            total_tests=$((total_tests + 1))
            
            echo "  Test $i..." >> "$performance_log"
            
            if timeout 60 ./scripts/test-workflow.sh "$scenario" >> "$performance_log" 2>&1; then
                successful_tests=$((successful_tests + 1))
                echo "  ✅ Test $i passed" >> "$performance_log"
            else
                echo "  ❌ Test $i failed" >> "$performance_log"
            fi
        done
        
        echo "" >> "$performance_log"
    done
    
    local success_rate=$((successful_tests * 100 / total_tests))
    
    echo "Performance Test Summary:" >> "$performance_log"
    echo "Total tests: $total_tests" >> "$performance_log"
    echo "Successful: $successful_tests" >> "$performance_log"
    echo "Success rate: ${success_rate}%" >> "$performance_log"
    
    if [ $success_rate -ge 80 ]; then
        echo -e "${GREEN}✅ Performance tests passed (${success_rate}% success rate)${NC}"
        return 0
    else
        echo -e "${RED}❌ Performance tests failed (${success_rate}% success rate)${NC}"
        return 1
    fi
}

# Generate test report
generate_test_report() {
    echo -e "${BLUE}Generating test report...${NC}"
    
    local report_file="$TEST_REPORTS_DIR/test-summary-${TIMESTAMP}.html"
    
    cat > "$report_file" << EOF
<!DOCTYPE html>
<html>
<head>
    <title>Connexio.ai Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f0f0f0; padding: 20px; border-radius: 5px; }
        .section { margin: 20px 0; padding: 15px; border-left: 4px solid #007cba; }
        .success { border-left-color: #28a745; }
        .failure { border-left-color: #dc3545; }
        .warning { border-left-color: #ffc107; }
        .code { background: #f8f9fa; padding: 10px; border-radius: 3px; font-family: monospace; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🧪 Connexio.ai Test Report</h1>
        <p><strong>Generated:</strong> $(date)</p>
        <p><strong>Test Suite:</strong> Workflow Validation</p>
    </div>
    
    <div class="section">
        <h2>Test Configuration</h2>
        <ul>
            <li>Unit Tests: $UNIT_TESTS</li>
            <li>Integration Tests: $INTEGRATION_TESTS</li>
            <li>Performance Tests: $PERFORMANCE_TESTS</li>
            <li>Coverage Report: $COVERAGE_REPORT</li>
            <li>Timeout: ${TEST_TIMEOUT}s</li>
        </ul>
    </div>
    
    <div class="section">
        <h2>Test Results</h2>
        <p>Detailed results available in individual log files:</p>
        <ul>
EOF

    # Add links to log files
    for log_file in "$TEST_REPORTS_DIR"/*-${TIMESTAMP}.log; do
        if [ -f "$log_file" ]; then
            local log_name=$(basename "$log_file")
            echo "            <li><a href=\"$log_name\">$log_name</a></li>" >> "$report_file"
        fi
    done
    
    cat >> "$report_file" << EOF
        </ul>
    </div>
    
    <div class="section">
        <h2>Coverage Report</h2>
EOF

    if [ "$COVERAGE_REPORT" = "true" ] && [ -f "$WORKFLOWS_DIR/target/site/jacoco/index.html" ]; then
        echo "        <p><a href=\"$WORKFLOWS_DIR/target/site/jacoco/index.html\">View Coverage Report</a></p>" >> "$report_file"
    else
        echo "        <p>Coverage report not generated</p>" >> "$report_file"
    fi
    
    cat >> "$report_file" << EOF
    </div>
    
    <div class="section">
        <h2>Environment Information</h2>
        <div class="code">
Java Version: $(java -version 2>&1 | head -1)<br>
Maven Version: $(mvn --version | head -1)<br>
Little Horse Host: ${LITTLEHORSE_API_HOST:-localhost}<br>
Test Timestamp: $TIMESTAMP
        </div>
    </div>
</body>
</html>
EOF

    echo -e "${GREEN}✅ Test report generated: $report_file${NC}"
}

# Show test summary
show_test_summary() {
    echo ""
    echo -e "${BLUE}Test Summary${NC}"
    echo "============="
    
    local total_tests=0
    local passed_tests=0
    
    if [ "$UNIT_TESTS" = "true" ]; then
        total_tests=$((total_tests + 1))
        if [ -f "$TEST_REPORTS_DIR/unit-tests-${TIMESTAMP}.log" ]; then
            if grep -q "BUILD SUCCESS" "$TEST_REPORTS_DIR/unit-tests-${TIMESTAMP}.log"; then
                echo -e "• Unit Tests: ${GREEN}✅ PASSED${NC}"
                passed_tests=$((passed_tests + 1))
            else
                echo -e "• Unit Tests: ${RED}❌ FAILED${NC}"
            fi
        fi
    fi
    
    if [ "$INTEGRATION_TESTS" = "true" ]; then
        total_tests=$((total_tests + 1))
        if [ -f "$TEST_REPORTS_DIR/integration-tests-${TIMESTAMP}.log" ]; then
            if grep -q "BUILD SUCCESS" "$TEST_REPORTS_DIR/integration-tests-${TIMESTAMP}.log"; then
                echo -e "• Integration Tests: ${GREEN}✅ PASSED${NC}"
                passed_tests=$((passed_tests + 1))
            else
                echo -e "• Integration Tests: ${RED}❌ FAILED${NC}"
            fi
        fi
    fi
    
    if [ "$PERFORMANCE_TESTS" = "true" ]; then
        total_tests=$((total_tests + 1))
        if [ -f "$TEST_REPORTS_DIR/performance-tests-${TIMESTAMP}.log" ]; then
            if grep -q "Performance tests passed" "$TEST_REPORTS_DIR/performance-tests-${TIMESTAMP}.log"; then
                echo -e "• Performance Tests: ${GREEN}✅ PASSED${NC}"
                passed_tests=$((passed_tests + 1))
            else
                echo -e "• Performance Tests: ${RED}❌ FAILED${NC}"
            fi
        fi
    fi
    
    echo ""
    echo "Overall: $passed_tests/$total_tests tests passed"
    
    if [ $passed_tests -eq $total_tests ]; then
        echo -e "${GREEN}🎉 ALL TESTS PASSED!${NC}"
        return 0
    else
        echo -e "${RED}❌ SOME TESTS FAILED${NC}"
        return 1
    fi
}

# Main execution
main() {
    echo -e "${BLUE}Connexio.ai Test Harness${NC}"
    echo "========================="
    
    parse_args "$@"
    
    local overall_success=true
    
    check_prerequisites
    build_project
    
    # Run tests based on configuration
    if [ "$UNIT_TESTS" = "true" ]; then
        if ! run_unit_tests; then
            overall_success=false
        fi
    fi
    
    if [ "$INTEGRATION_TESTS" = "true" ]; then
        if ! run_integration_tests; then
            overall_success=false
        fi
    fi
    
    if [ "$PERFORMANCE_TESTS" = "true" ]; then
        if ! run_performance_tests; then
            overall_success=false
        fi
    fi
    
    generate_test_report
    show_test_summary
    
    if [ "$overall_success" = true ]; then
        echo -e "${GREEN}✅ Test execution completed successfully${NC}"
        exit 0
    else
        echo -e "${RED}❌ Test execution completed with failures${NC}"
        exit 1
    fi
}

# Handle script arguments
if [ $# -eq 0 ]; then
    # Default: run unit tests only
    main --unit
else
    main "$@"
fi