#!/bin/bash

# Deployment Validation Script for Connexio AI on Fly.io
# This script validates that all services are deployed and healthy

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[⚠]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_header() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# App configurations
declare -A APPS
APPS[postgres]="connexio-ai-postgres"
APPS[redis]="connexio-ai-redis"
APPS[littlehorse]="connexio-ai-littlehorse"
APPS[workers]="connexio-ai-workers"
APPS[enrichment]="connexio-ai-enrichment-workers"
APPS[orchestration]="connexio-ai-orchestration-workers"
APPS[autoscaling]="connexio-ai-autoscaling"

# Health check endpoints
declare -A HEALTH_ENDPOINTS
HEALTH_ENDPOINTS[littlehorse]="https://connexio-ai-littlehorse.fly.dev/health"
HEALTH_ENDPOINTS[workers]="https://connexio-ai-workers.fly.dev/health"
HEALTH_ENDPOINTS[enrichment]="https://connexio-ai-enrichment-workers.fly.dev/health"
HEALTH_ENDPOINTS[orchestration]="https://connexio-ai-orchestration-workers.fly.dev/health"
HEALTH_ENDPOINTS[autoscaling]="https://connexio-ai-autoscaling.fly.dev/health"

# Validate Fly.io authentication
validate_flyctl() {
    print_header "Validating Fly.io CLI authentication"
    
    if ! command -v flyctl &> /dev/null; then
        print_error "flyctl is not installed"
        return 1
    fi
    
    if ! flyctl auth whoami &> /dev/null; then
        print_error "Not authenticated with Fly.io"
        return 1
    fi
    
    print_status "Fly.io CLI is authenticated"
    return 0
}

# Check if apps exist
check_apps_exist() {
    print_header "Checking if applications exist"
    
    local missing_apps=()
    
    for app_key in "${!APPS[@]}"; do
        local app_name="${APPS[$app_key]}"
        
        if flyctl apps list | grep -q "$app_name"; then
            print_status "App exists: $app_name"
        else
            print_error "App missing: $app_name"
            missing_apps+=($app_name)
        fi
    done
    
    if [ ${#missing_apps[@]} -gt 0 ]; then
        print_error "Missing applications found. Run deployment script first."
        return 1
    fi
    
    return 0
}

# Check app status
check_app_status() {
    print_header "Checking application status"
    
    local unhealthy_apps=()
    
    for app_key in "${!APPS[@]}"; do
        local app_name="${APPS[$app_key]}"
        
        local status=$(flyctl status --app "$app_name" 2>/dev/null | grep -E "(running|stopped)" | head -1 | awk '{print $2}' || echo "unknown")
        
        case $status in
            "running")
                print_status "$app_name: Running"
                ;;
            "stopped")
                print_warning "$app_name: Stopped"
                unhealthy_apps+=($app_name)
                ;;
            *)
                print_error "$app_name: $status"
                unhealthy_apps+=($app_name)
                ;;
        esac
    done
    
    if [ ${#unhealthy_apps[@]} -gt 0 ]; then
        print_warning "Some applications are not running properly"
        return 1
    fi
    
    return 0
}

# Test health endpoints
test_health_endpoints() {
    print_header "Testing health endpoints"
    
    local failed_endpoints=()
    
    for app_key in "${!HEALTH_ENDPOINTS[@]}"; do
        local endpoint="${HEALTH_ENDPOINTS[$app_key]}"
        
        if curl -f -s --max-time 10 "$endpoint" > /dev/null; then
            print_status "Health check passed: $endpoint"
        else
            print_error "Health check failed: $endpoint"
            failed_endpoints+=($endpoint)
        fi
    done
    
    if [ ${#failed_endpoints[@]} -gt 0 ]; then
        print_warning "Some health endpoints are not responding"
        return 1
    fi
    
    return 0
}

# Test Little Horse connectivity
test_littlehorse_connectivity() {
    print_header "Testing Little Horse connectivity"
    
    # Test gRPC endpoint (this will fail with HTTP but confirms service is listening)
    if timeout 5 bash -c "</dev/tcp/connexio-ai-littlehorse.fly.dev/2023" 2>/dev/null; then
        print_status "Little Horse gRPC port is accessible"
    else
        print_error "Cannot connect to Little Horse gRPC port"
        return 1
    fi
    
    return 0
}

# Check secrets configuration
check_secrets() {
    print_header "Validating secrets configuration"
    
    local apps_with_secrets=("connexio-ai-workers" "connexio-ai-enrichment-workers" "connexio-ai-orchestration-workers")
    
    for app_name in "${apps_with_secrets[@]}"; do
        local secret_count=$(flyctl secrets list --app "$app_name" 2>/dev/null | wc -l || echo "0")
        
        if [ "$secret_count" -gt 5 ]; then
            print_status "$app_name: Secrets configured ($secret_count secrets)"
        else
            print_warning "$app_name: Few or no secrets configured"
        fi
    done
    
    return 0
}

# Test database connectivity
test_database_connectivity() {
    print_header "Testing database connectivity"
    
    # Test PostgreSQL
    if flyctl ssh console --app connexio-ai-postgres --command "pg_isready -h localhost" 2>/dev/null | grep -q "accepting connections"; then
        print_status "PostgreSQL is accepting connections"
    else
        print_warning "PostgreSQL connectivity test failed"
    fi
    
    # Test Redis
    if flyctl ssh console --app connexio-ai-redis --command "redis-cli ping" 2>/dev/null | grep -q "PONG"; then
        print_status "Redis is responding to ping"
    else
        print_warning "Redis connectivity test failed"
    fi
    
    return 0
}

# Generate deployment report
generate_report() {
    print_header "Generating deployment validation report"
    
    local report_file="deployment-validation-$(date +%Y%m%d-%H%M%S).txt"
    
    cat > "$report_file" << EOF
Connexio AI Deployment Validation Report
Generated: $(date)

=== APPLICATION STATUS ===
EOF
    
    for app_key in "${!APPS[@]}"; do
        local app_name="${APPS[$app_key]}"
        local status=$(flyctl status --app "$app_name" 2>/dev/null | grep -E "(running|stopped)" | head -1 | awk '{print $2}' || echo "unknown")
        echo "$app_name: $status" >> "$report_file"
    done
    
    cat >> "$report_file" << EOF

=== HEALTH ENDPOINTS ===
EOF
    
    for app_key in "${!HEALTH_ENDPOINTS[@]}"; do
        local endpoint="${HEALTH_ENDPOINTS[$app_key]}"
        local status="FAILED"
        
        if curl -f -s --max-time 10 "$endpoint" > /dev/null; then
            status="PASSED"
        fi
        
        echo "$endpoint: $status" >> "$report_file"
    done
    
    cat >> "$report_file" << EOF

=== RECOMMENDATIONS ===
EOF
    
    # Add recommendations based on validation results
    if [ ${#failed_endpoints[@]} -gt 0 ]; then
        echo "- Check logs for failed health endpoints" >> "$report_file"
    fi
    
    echo "- Monitor auto-scaling metrics" >> "$report_file"
    echo "- Set up alerting webhooks" >> "$report_file"
    echo "- Configure backup schedules" >> "$report_file"
    
    print_status "Report generated: $report_file"
}

# Main validation function
main() {
    print_header "Starting Connexio AI deployment validation"
    echo
    
    local validation_passed=true
    
    # Run validation checks
    validate_flyctl || validation_passed=false
    echo
    
    check_apps_exist || validation_passed=false
    echo
    
    check_app_status || validation_passed=false
    echo
    
    test_health_endpoints || validation_passed=false
    echo
    
    test_littlehorse_connectivity || validation_passed=false
    echo
    
    check_secrets || validation_passed=false
    echo
    
    test_database_connectivity || validation_passed=false
    echo
    
    generate_report
    echo
    
    # Final result
    if [ "$validation_passed" = "true" ]; then
        print_status "🎉 All validation checks passed! Deployment is healthy."
        echo
        print_header "Next steps:"
        echo "1. Configure your Slack app webhook URL"
        echo "2. Test a sample workflow"
        echo "3. Set up monitoring alerts"
        echo "4. Monitor logs: flyctl logs -a connexio-ai-workers"
        return 0
    else
        print_warning "⚠️  Some validation checks failed. Review the output above."
        echo
        print_header "Common fixes:"
        echo "1. Wait a few minutes for services to fully start"
        echo "2. Check application logs: flyctl logs -a <app-name>"
        echo "3. Restart failed services: flyctl apps restart <app-name>"
        echo "4. Re-run deployment script if needed"
        return 1
    fi
}

# Run main function
main "$@"