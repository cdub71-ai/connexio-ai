#!/bin/bash

# Environment Variable Management Script for Fly.io Deployment
# This script manages secrets and environment variables across all apps

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

# Check if flyctl is installed
check_flyctl() {
    if ! command -v flyctl &> /dev/null; then
        print_error "flyctl is not installed. Please install it first."
        exit 1
    fi
}

# Set secrets for Little Horse Kernel
set_littlehorse_secrets() {
    print_header "Setting secrets for Little Horse Kernel (connexio-ai-littlehorse)"
    
    flyctl secrets set \
        -a connexio-ai-littlehorse \
        LH_DATABASE_URL="postgres://connexio_ai_user:${POSTGRES_PASSWORD}@connexio-ai-postgres.internal:5432/connexio_ai" \
        LH_REDIS_URL="redis://connexio-ai-redis.internal:6379" \
        LH_JWT_SECRET="${JWT_SECRET}" \
        LH_ENCRYPTION_KEY="${ENCRYPTION_KEY}" \
        LH_ADMIN_PASSWORD="${ADMIN_PASSWORD}"
    
    print_status "Little Horse secrets set successfully"
}

# Set secrets for main workers
set_worker_secrets() {
    print_header "Setting secrets for Main Workers (connexio-ai-workers)"
    
    flyctl secrets set \
        -a connexio-ai-workers \
        DATABASE_URL="postgres://connexio_ai_user:${POSTGRES_PASSWORD}@connexio-ai-postgres.internal:5432/connexio_ai" \
        REDIS_URL="redis://connexio-ai-redis.internal:6379" \
        ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY}" \
        SLACK_BOT_TOKEN="${SLACK_BOT_TOKEN}" \
        SLACK_SIGNING_SECRET="${SLACK_SIGNING_SECRET}" \
        SLACK_APP_TOKEN="${SLACK_APP_TOKEN}" \
        TWILIO_ACCOUNT_SID="${TWILIO_ACCOUNT_SID}" \
        TWILIO_AUTH_TOKEN="${TWILIO_AUTH_TOKEN}" \
        TWILIO_MESSAGING_SERVICE_SID="${TWILIO_MESSAGING_SERVICE_SID}" \
        SURESHOT_API_KEY="${SURESHOT_API_KEY}" \
        SURESHOT_ELOQUA_INSTANCE="${SURESHOT_ELOQUA_INSTANCE}" \
        SURESHOT_ELOQUA_USER="${SURESHOT_ELOQUA_USER}" \
        SURESHOT_ELOQUA_PASSWORD="${SURESHOT_ELOQUA_PASSWORD}" \
        MICROSOFT_APP_ID="${MICROSOFT_APP_ID}" \
        MICROSOFT_APP_PASSWORD="${MICROSOFT_APP_PASSWORD}" \
        MICROSOFT_APP_TENANT_ID="${MICROSOFT_APP_TENANT_ID}"
    
    print_status "Main worker secrets set successfully"
}

# Set secrets for enrichment workers
set_enrichment_secrets() {
    print_header "Setting secrets for Enrichment Workers (connexio-ai-enrichment-workers)"
    
    flyctl secrets set \
        -a connexio-ai-enrichment-workers \
        DATABASE_URL="postgres://connexio_ai_user:${POSTGRES_PASSWORD}@connexio-ai-postgres.internal:5432/connexio_ai" \
        REDIS_URL="redis://connexio-ai-redis.internal:6379" \
        ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY}" \
        APOLLO_API_KEY="${APOLLO_API_KEY}" \
        LEADSPACE_API_KEY="${LEADSPACE_API_KEY}" \
        LEADSPACE_CUSTOMER_ID="${LEADSPACE_CUSTOMER_ID}"
    
    print_status "Enrichment worker secrets set successfully"
}

# Set secrets for orchestration workers
set_orchestration_secrets() {
    print_header "Setting secrets for Orchestration Workers (connexio-ai-orchestration-workers)"
    
    flyctl secrets set \
        -a connexio-ai-orchestration-workers \
        DATABASE_URL="postgres://connexio_ai_user:${POSTGRES_PASSWORD}@connexio-ai-postgres.internal:5432/connexio_ai" \
        REDIS_URL="redis://connexio-ai-redis.internal:6379" \
        ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY}" \
        SLACK_BOT_TOKEN="${SLACK_BOT_TOKEN}" \
        SLACK_SIGNING_SECRET="${SLACK_SIGNING_SECRET}" \
        TWILIO_ACCOUNT_SID="${TWILIO_ACCOUNT_SID}" \
        TWILIO_AUTH_TOKEN="${TWILIO_AUTH_TOKEN}" \
        SURESHOT_API_KEY="${SURESHOT_API_KEY}" \
        MICROSOFT_APP_ID="${MICROSOFT_APP_ID}" \
        MICROSOFT_APP_PASSWORD="${MICROSOFT_APP_PASSWORD}"
    
    print_status "Orchestration worker secrets set successfully"
}

# Set secrets for database
set_postgres_secrets() {
    print_header "Setting secrets for Postgres (connexio-ai-postgres)"
    
    flyctl secrets set \
        -a connexio-ai-postgres \
        POSTGRES_PASSWORD="${POSTGRES_PASSWORD}" \
        POSTGRES_REPLICATION_PASSWORD="${POSTGRES_REPLICATION_PASSWORD}"
    
    print_status "Postgres secrets set successfully"
}

# Set secrets for Redis
set_redis_secrets() {
    print_header "Setting secrets for Redis (connexio-ai-redis)"
    
    flyctl secrets set \
        -a connexio-ai-redis \
        REDIS_PASSWORD="${REDIS_PASSWORD}"
    
    print_status "Redis secrets set successfully"
}

# Load environment variables from .env.production file
load_env_file() {
    if [ -f ".env.production" ]; then
        print_status "Loading environment variables from .env.production"
        export $(cat .env.production | grep -v '^#' | xargs)
    else
        print_warning ".env.production file not found. Using environment variables."
    fi
}

# Validate required environment variables
validate_env_vars() {
    print_header "Validating required environment variables"
    
    required_vars=(
        "POSTGRES_PASSWORD"
        "POSTGRES_REPLICATION_PASSWORD" 
        "REDIS_PASSWORD"
        "JWT_SECRET"
        "ENCRYPTION_KEY"
        "ADMIN_PASSWORD"
        "ANTHROPIC_API_KEY"
        "SLACK_BOT_TOKEN"
        "SLACK_SIGNING_SECRET"
        "TWILIO_ACCOUNT_SID"
        "TWILIO_AUTH_TOKEN"
        "SURESHOT_API_KEY"
        "APOLLO_API_KEY"
        "LEADSPACE_API_KEY"
        "LEADSPACE_CUSTOMER_ID"
    )
    
    missing_vars=()
    
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            missing_vars+=($var)
        fi
    done
    
    if [ ${#missing_vars[@]} -gt 0 ]; then
        print_error "Missing required environment variables:"
        for var in "${missing_vars[@]}"; do
            print_error "  - $var"
        done
        exit 1
    fi
    
    print_status "All required environment variables are set"
}

# Generate random secrets if not provided
generate_secrets() {
    print_header "Generating missing secrets"
    
    if [ -z "$JWT_SECRET" ]; then
        export JWT_SECRET=$(openssl rand -base64 32)
        print_status "Generated JWT_SECRET"
    fi
    
    if [ -z "$ENCRYPTION_KEY" ]; then
        export ENCRYPTION_KEY=$(openssl rand -base64 32)
        print_status "Generated ENCRYPTION_KEY"
    fi
    
    if [ -z "$ADMIN_PASSWORD" ]; then
        export ADMIN_PASSWORD=$(openssl rand -base64 16)
        print_status "Generated ADMIN_PASSWORD: $ADMIN_PASSWORD"
    fi
    
    if [ -z "$POSTGRES_PASSWORD" ]; then
        export POSTGRES_PASSWORD=$(openssl rand -base64 16)
        print_status "Generated POSTGRES_PASSWORD"
    fi
    
    if [ -z "$POSTGRES_REPLICATION_PASSWORD" ]; then
        export POSTGRES_REPLICATION_PASSWORD=$(openssl rand -base64 16)
        print_status "Generated POSTGRES_REPLICATION_PASSWORD"
    fi
    
    if [ -z "$REDIS_PASSWORD" ]; then
        export REDIS_PASSWORD=$(openssl rand -base64 16)
        print_status "Generated REDIS_PASSWORD"
    fi
}

# Save generated secrets to file
save_secrets() {
    if [ "$1" = "--save-secrets" ]; then
        print_header "Saving generated secrets to .env.secrets"
        cat > .env.secrets << EOF
# Generated secrets - KEEP SECURE
JWT_SECRET=${JWT_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_REPLICATION_PASSWORD=${POSTGRES_REPLICATION_PASSWORD}
REDIS_PASSWORD=${REDIS_PASSWORD}
EOF
        chmod 600 .env.secrets
        print_status "Secrets saved to .env.secrets (secure permissions set)"
    fi
}

# Main execution
main() {
    print_header "Starting environment variable setup for Connexio AI"
    
    check_flyctl
    load_env_file
    generate_secrets
    save_secrets "$@"
    validate_env_vars
    
    # Set secrets for all applications
    set_postgres_secrets
    set_redis_secrets
    set_littlehorse_secrets
    set_worker_secrets
    set_enrichment_secrets
    set_orchestration_secrets
    
    print_header "Environment setup completed successfully!"
    print_status "All secrets have been set for Fly.io applications"
    
    if [ -f ".env.secrets" ]; then
        print_warning "Remember to securely store the .env.secrets file"
        print_warning "Never commit it to version control"
    fi
}

# Run main function with all arguments
main "$@"