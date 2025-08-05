#!/bin/bash

# Main Deployment Script for Connexio AI on Fly.io
# This script orchestrates the complete deployment process

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}[DEPLOY]${NC} $1"
}

print_step() {
    echo -e "${PURPLE}[STEP]${NC} $1"
}

# Configuration
DEPLOYMENT_ENV=${1:-production}
SKIP_TESTS=${SKIP_TESTS:-false}
SKIP_BUILD=${SKIP_BUILD:-false}
DRY_RUN=${DRY_RUN:-false}

# App configurations
declare -A APPS
APPS[littlehorse]="connexio-ai-littlehorse"
APPS[workers]="connexio-ai-workers"
APPS[enrichment]="connexio-ai-enrichment-workers"
APPS[orchestration]="connexio-ai-orchestration-workers"
APPS[postgres]="connexio-ai-postgres"
APPS[redis]="connexio-ai-redis"
APPS[autoscaling]="connexio-ai-autoscaling"

# Deployment order (dependencies first)
DEPLOYMENT_ORDER=(
    "postgres"
    "redis"  
    "littlehorse"
    "workers"
    "enrichment"
    "orchestration"
    "autoscaling"
)

# Check prerequisites
check_prerequisites() {
    print_header "Checking prerequisites"
    
    # Check if flyctl is installed
    if ! command -v flyctl &> /dev/null; then
        print_error "flyctl is not installed. Please install it first."
        exit 1
    fi
    
    # Check if user is authenticated
    if ! flyctl auth whoami &> /dev/null; then
        print_error "Not authenticated with Fly.io. Please run 'flyctl auth login' first."
        exit 1
    fi
    
    # Check if Docker is running
    if ! docker info &> /dev/null; then
        print_error "Docker is not running. Please start Docker first."
        exit 1
    fi
    
    # Check if in correct directory
    if [ ! -f "package.json" ] || [ ! -d "workers" ]; then
        print_error "Please run this script from the project root directory."
        exit 1
    fi
    
    print_status "Prerequisites check passed"
}

# Run tests
run_tests() {
    if [ "$SKIP_TESTS" = "true" ]; then
        print_warning "Skipping tests (SKIP_TESTS=true)"
        return
    fi
    
    print_step "Running tests"
    
    # Run main project tests
    if [ -f "package.json" ] && grep -q '"test"' package.json; then
        npm test || {
            print_error "Main project tests failed"
            exit 1
        }
    fi
    
    # Run worker tests
    if [ -f "workers/package.json" ] && grep -q '"test"' workers/package.json; then
        cd workers
        npm test || {
            print_error "Worker tests failed"
            exit 1
        }
        cd ..
    fi
    
    print_status "All tests passed"
}

# Build applications
build_applications() {
    if [ "$SKIP_BUILD" = "true" ]; then
        print_warning "Skipping build (SKIP_BUILD=true)"
        return
    fi
    
    print_step "Building applications"
    
    # Build main application
    if [ -f "package.json" ] && grep -q '"build"' package.json; then
        print_status "Building main application"
        npm run build || {
            print_error "Main application build failed"
            exit 1
        }
    fi
    
    # Build workers
    if [ -f "workers/package.json" ] && grep -q '"build"' workers/package.json; then
        print_status "Building workers"
        cd workers
        npm run build || {
            print_error "Workers build failed"
            exit 1
        }
        cd ..
    fi
    
    print_status "All builds completed"
}

# Create or update Fly.io apps
create_apps() {
    print_step "Creating/updating Fly.io applications"
    
    for app_key in "${DEPLOYMENT_ORDER[@]}"; do
        local app_name="${APPS[$app_key]}"
        print_status "Processing app: $app_name"
        
        # Check if app exists
        if flyctl apps list | grep -q "$app_name"; then
            print_status "App $app_name already exists"
        else
            print_status "Creating app $app_name"
            if [ "$DRY_RUN" = "false" ]; then
                flyctl apps create "$app_name" --org connexio-ai || {
                    print_warning "Failed to create $app_name (may already exist)"
                }
            else
                print_status "[DRY RUN] Would create app $app_name"
            fi
        fi
    done
}

# Deploy databases first
deploy_databases() {
    print_step "Deploying databases"
    
    # Deploy PostgreSQL
    print_status "Deploying PostgreSQL"
    if [ "$DRY_RUN" = "false" ]; then
        cd deploy
        flyctl deploy --config postgres-fly.toml --remote-only || {
            print_error "PostgreSQL deployment failed"
            exit 1
        }
        cd ..
    else
        print_status "[DRY RUN] Would deploy PostgreSQL"
    fi
    
    # Deploy Redis
    print_status "Deploying Redis"
    if [ "$DRY_RUN" = "false" ]; then
        cd deploy
        flyctl deploy --config redis-fly.toml --remote-only || {
            print_error "Redis deployment failed"
            exit 1
        }
        cd ..
    else
        print_status "[DRY RUN] Would deploy Redis"
    fi
    
    # Wait for databases to be ready
    if [ "$DRY_RUN" = "false" ]; then
        print_status "Waiting for databases to be ready..."
        sleep 30
        
        # Health check for databases
        check_database_health
    fi
}

# Check database health
check_database_health() {
    print_status "Checking database health"
    
    local max_attempts=10
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        print_status "Health check attempt $attempt/$max_attempts"
        
        # Check PostgreSQL
        if flyctl status --app connexio-ai-postgres | grep -q "running"; then
            print_status "PostgreSQL is healthy"
            break
        fi
        
        if [ $attempt -eq $max_attempts ]; then
            print_error "Database health check failed after $max_attempts attempts"
            exit 1
        fi
        
        sleep 10
        ((attempt++))
    done
}

# Deploy applications
deploy_applications() {
    print_step "Deploying applications"
    
    # Deploy Little Horse Kernel
    print_status "Deploying Little Horse Kernel"
    if [ "$DRY_RUN" = "false" ]; then
        flyctl deploy --config fly.toml --remote-only || {
            print_error "Little Horse deployment failed"
            exit 1
        }
    else
        print_status "[DRY RUN] Would deploy Little Horse Kernel"
    fi
    
    # Deploy Workers
    print_status "Deploying Workers"
    if [ "$DRY_RUN" = "false" ]; then
        cd workers
        flyctl deploy --config fly.toml --remote-only || {
            print_error "Workers deployment failed"
            exit 1
        }
        cd ..
    else
        print_status "[DRY RUN] Would deploy Workers"
    fi
    
    # Deploy Enrichment Workers
    print_status "Deploying Enrichment Workers"
    if [ "$DRY_RUN" = "false" ]; then
        cd workers
        flyctl deploy --config fly-enrichment.toml --remote-only || {
            print_error "Enrichment Workers deployment failed"
            exit 1
        }
        cd ..
    else
        print_status "[DRY RUN] Would deploy Enrichment Workers"
    fi
    
    # Deploy Orchestration Workers
    print_status "Deploying Orchestration Workers"
    if [ "$DRY_RUN" = "false" ]; then
        cd workers
        flyctl deploy --config fly-orchestration.toml --remote-only || {
            print_error "Orchestration Workers deployment failed"
            exit 1
        }
        cd ..
    else
        print_status "[DRY RUN] Would deploy Orchestration Workers"
    fi
    
    # Deploy Auto-scaling Service
    print_status "Deploying Auto-scaling Service"
    if [ "$DRY_RUN" = "false" ]; then
        cd deploy
        flyctl deploy --config fly-autoscaling.toml --remote-only || {
            print_error "Auto-scaling service deployment failed"
            exit 1
        }
        cd ..
    else
        print_status "[DRY RUN] Would deploy Auto-scaling Service"
    fi
}

# Setup environment variables and secrets
setup_environment() {
    print_step "Setting up environment variables and secrets"
    
    if [ "$DRY_RUN" = "false" ]; then
        # Run environment management script
        ./deploy/env-management.sh --save-secrets || {
            print_error "Environment setup failed"
            exit 1
        }
    else
        print_status "[DRY RUN] Would setup environment variables"
    fi
}

# Health checks for all services
run_health_checks() {
    print_step "Running health checks"
    
    if [ "$DRY_RUN" = "true" ]; then
        print_status "[DRY RUN] Would run health checks"
        return
    fi
    
    local services=(
        "connexio-ai-postgres:5432"
        "connexio-ai-redis:6379"
        "connexio-ai-littlehorse:1822"
        "connexio-ai-workers:3000"
        "connexio-ai-enrichment-workers:3000"
        "connexio-ai-orchestration-workers:3000"
        "connexio-ai-autoscaling:3003"
    )
    
    local max_attempts=20
    local healthy_services=0
    
    for service in "${services[@]}"; do
        local app_name=$(echo "$service" | cut -d':' -f1)
        local port=$(echo "$service" | cut -d':' -f2)
        
        print_status "Checking health of $app_name"
        
        local attempt=1
        local healthy=false
        
        while [ $attempt -le $max_attempts ]; do
            if flyctl status --app "$app_name" | grep -q "running"; then
                healthy=true
                break
            fi
            
            sleep 15
            ((attempt++))
        done
        
        if [ "$healthy" = "true" ]; then
            print_status "$app_name is healthy"
            ((healthy_services++))
        else
            print_warning "$app_name health check failed"
        fi
    done
    
    if [ $healthy_services -eq ${#services[@]} ]; then
        print_status "All services are healthy!"
    else
        print_warning "$healthy_services/${#services[@]} services are healthy"
    fi
}

# Deployment summary
print_deployment_summary() {
    print_header "Deployment Summary"
    
    echo
    print_status "Deployed Applications:"
    for app_key in "${DEPLOYMENT_ORDER[@]}"; do
        local app_name="${APPS[$app_key]}"
        echo "  • $app_name"
    done
    
    echo
    print_status "Next Steps:"
    echo "  1. Monitor deployment: flyctl logs --app connexio-ai-littlehorse"
    echo "  2. Check auto-scaling: ./deploy/scaling-cli.js status"
    echo "  3. Monitor health: curl http://connexio-ai-autoscaling.internal:3003/health"
    echo "  4. View metrics: ./deploy/scaling-cli.js metrics"
    
    if [ -f ".env.secrets" ]; then
        echo
        print_warning "Important: .env.secrets file created with generated secrets"
        print_warning "Store this file securely and do not commit to version control"
    fi
    
    echo
    print_status "Deployment completed successfully! 🎉"
}

# Rollback function
rollback_deployment() {
    print_header "Rolling back deployment"
    
    for app_key in "${DEPLOYMENT_ORDER[@]}"; do
        local app_name="${APPS[$app_key]}"
        print_status "Rolling back $app_name"
        
        if [ "$DRY_RUN" = "false" ]; then
            flyctl releases --app "$app_name" | head -2 | tail -1 | awk '{print $1}' | xargs -I {} flyctl releases rollback {} --app "$app_name" || {
                print_warning "Rollback failed for $app_name"
            }
        else
            print_status "[DRY RUN] Would rollback $app_name"
        fi
    done
}

# Signal handlers for graceful shutdown
trap 'print_error "Deployment interrupted"; exit 1' INT TERM

# Main execution
main() {
    print_header "Starting Connexio AI Deployment to Fly.io"
    print_status "Environment: $DEPLOYMENT_ENV"
    print_status "Dry Run: $DRY_RUN"
    echo
    
    # Parse command line options
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --skip-tests)
                SKIP_TESTS=true
                shift
                ;;
            --skip-build)
                SKIP_BUILD=true
                shift
                ;;
            --rollback)
                rollback_deployment
                exit 0
                ;;
            --help)
                echo "Usage: $0 [environment] [options]"
                echo "Options:"
                echo "  --dry-run      Show what would be deployed without executing"
                echo "  --skip-tests   Skip running tests"
                echo "  --skip-build   Skip building applications"
                echo "  --rollback     Rollback the last deployment"
                echo "  --help         Show this help message"
                exit 0
                ;;
            *)
                DEPLOYMENT_ENV=$1
                shift
                ;;
        esac
    done
    
    # Execute deployment steps
    check_prerequisites
    run_tests
    build_applications
    create_apps
    setup_environment
    deploy_databases
    deploy_applications
    run_health_checks
    print_deployment_summary
}

# Run main function
main "$@"