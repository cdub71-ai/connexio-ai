#!/bin/bash

# Maintenance and Operations Script for Connexio AI Fly.io Deployment
# Provides various maintenance operations for the deployed system

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
    echo -e "${BLUE}[MAINT]${NC} $1"
}

print_step() {
    echo -e "${PURPLE}[STEP]${NC} $1"
}

# App configurations
declare -A APPS
APPS[littlehorse]="connexio-ai-littlehorse"
APPS[workers]="connexio-ai-workers" 
APPS[enrichment]="connexio-ai-enrichment-workers"
APPS[orchestration]="connexio-ai-orchestration-workers"
APPS[postgres]="connexio-ai-postgres"
APPS[redis]="connexio-ai-redis"
APPS[autoscaling]="connexio-ai-autoscaling"

# Check system status
check_status() {
    print_header "System Status Check"
    
    for app_key in "${!APPS[@]}"; do
        local app_name="${APPS[$app_key]}"
        print_status "Checking $app_name..."
        
        # Get app status
        local status=$(flyctl status --app "$app_name" 2>/dev/null | grep -E "running|stopped|crashed" | wc -l)
        local machines=$(flyctl machines list --app "$app_name" 2>/dev/null | tail -n +2 | wc -l)
        
        if [ "$status" -gt 0 ]; then
            print_status "  ✅ $app_name: $machines machines"
        else
            print_warning "  ⚠️  $app_name: Status unknown"
        fi
        
        # Check recent deployments
        local recent_deploys=$(flyctl releases --app "$app_name" 2>/dev/null | head -5 | tail -n +2 | wc -l)
        if [ "$recent_deploys" -gt 0 ]; then
            print_status "  📦 Recent deployments: $recent_deploys"
        fi
    done
    
    echo
    print_status "System status check completed"
}

# View logs for all services
view_logs() {
    local app_filter=${1:-""}
    local follow=${2:-false}
    
    print_header "Viewing System Logs"
    
    if [ -n "$app_filter" ]; then
        local app_name="${APPS[$app_filter]}"
        if [ -n "$app_name" ]; then
            print_status "Viewing logs for $app_name"
            if [ "$follow" = "true" ]; then
                flyctl logs --app "$app_name" --follow
            else
                flyctl logs --app "$app_name" --lines 100
            fi
        else
            print_error "Unknown app: $app_filter"
            return 1
        fi
    else
        # Show logs from all critical services
        for app_key in "littlehorse" "workers"; do
            local app_name="${APPS[$app_key]}"
            print_status "Recent logs from $app_name:"
            flyctl logs --app "$app_name" --lines 20
            echo "---"
        done
    fi
}

# Restart services
restart_services() {
    local app_filter=${1:-"all"}
    
    print_header "Restarting Services"
    
    if [ "$app_filter" = "all" ]; then
        print_warning "This will restart ALL services. Continue? (y/N)"
        read -r confirmation
        if [[ ! "$confirmation" =~ ^[Yy]$ ]]; then
            print_status "Restart cancelled"
            return 0
        fi
        
        # Restart in dependency order
        local restart_order=("postgres" "redis" "littlehorse" "workers" "enrichment" "orchestration" "autoscaling")
        for app_key in "${restart_order[@]}"; do
            local app_name="${APPS[$app_key]}"
            print_status "Restarting $app_name..."
            flyctl machines restart --app "$app_name" || print_warning "Failed to restart $app_name"
            sleep 10  # Allow time for service to start
        done
    else
        local app_name="${APPS[$app_filter]}"
        if [ -n "$app_name" ]; then
            print_status "Restarting $app_name..."
            flyctl machines restart --app "$app_name"
        else
            print_error "Unknown app: $app_filter"
            return 1
        fi
    fi
    
    print_status "Restart completed"
}

# Scale services
scale_services() {
    local app_filter=${1:-""}
    local count=${2:-""}
    
    if [ -z "$app_filter" ] || [ -z "$count" ]; then
        print_error "Usage: scale <app> <count>"
        return 1
    fi
    
    local app_name="${APPS[$app_filter]}"
    if [ -z "$app_name" ]; then
        print_error "Unknown app: $app_filter"
        return 1
    fi
    
    print_header "Scaling $app_name to $count machines"
    flyctl scale count "$count" --app "$app_name"
    print_status "Scaling completed"
}

# Database maintenance
database_maintenance() {
    print_header "Database Maintenance"
    
    print_step "PostgreSQL Maintenance"
    
    # Get database stats
    print_status "Database statistics:"
    flyctl ssh console --app connexio-ai-postgres --command "psql -U connexio_ai_user -d connexio_ai -c \"SELECT schemaname,tablename,n_tup_ins,n_tup_upd,n_tup_del FROM pg_stat_user_tables;\""
    
    # Check database size
    print_status "Database sizes:"
    flyctl ssh console --app connexio-ai-postgres --command "psql -U connexio_ai_user -d connexio_ai -c \"SELECT pg_database.datname, pg_size_pretty(pg_database_size(pg_database.datname)) AS size FROM pg_database;\""
    
    # Run VACUUM and ANALYZE
    print_status "Running VACUUM ANALYZE..."
    flyctl ssh console --app connexio-ai-postgres --command "psql -U connexio_ai_user -d connexio_ai -c \"VACUUM ANALYZE;\""
    
    print_step "Redis Maintenance"
    
    # Get Redis stats
    print_status "Redis statistics:"
    flyctl ssh console --app connexio-ai-redis --command "redis-cli INFO memory"
    flyctl ssh console --app connexio-ai-redis --command "redis-cli INFO stats"
    
    print_status "Database maintenance completed"
}

# Backup system
backup_system() {
    local backup_type=${1:-"full"}
    local backup_dir="./backups/$(date +%Y%m%d_%H%M%S)"
    
    print_header "System Backup ($backup_type)"
    mkdir -p "$backup_dir"
    
    print_step "Backing up PostgreSQL"
    flyctl ssh console --app connexio-ai-postgres --command "pg_dump -U connexio_ai_user connexio_ai" > "$backup_dir/postgres_backup.sql"
    
    print_step "Backing up Redis"
    flyctl ssh console --app connexio-ai-redis --command "redis-cli SAVE"
    # Note: Redis backup would need additional setup to copy RDB file
    
    print_step "Backing up configuration"
    cp -r ./deploy "$backup_dir/"
    cp .env.* "$backup_dir/" 2>/dev/null || true
    
    print_step "Creating backup manifest"
    cat > "$backup_dir/manifest.json" << EOF
{
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "type": "$backup_type",
    "components": [
        "postgres",
        "redis", 
        "configuration"
    ],
    "apps": $(echo "${!APPS[@]}" | jq -R 'split(" ")')
}
EOF
    
    # Compress backup
    tar -czf "${backup_dir}.tar.gz" -C "$(dirname "$backup_dir")" "$(basename "$backup_dir")"
    rm -rf "$backup_dir"
    
    print_status "Backup completed: ${backup_dir}.tar.gz"
}

# Performance monitoring
monitor_performance() {
    local duration=${1:-300}  # 5 minutes default
    
    print_header "Performance Monitoring (${duration}s)"
    
    print_step "Collecting metrics from all services"
    
    local output_file="./monitoring/performance_$(date +%Y%m%d_%H%M%S).log"
    mkdir -p ./monitoring
    
    {
        echo "=== Performance Monitoring Started: $(date) ==="
        echo
        
        for app_key in "${!APPS[@]}"; do
            local app_name="${APPS[$app_key]}"
            echo "=== $app_name ==="
            
            # Get machine stats
            flyctl status --app "$app_name" 2>/dev/null || echo "Failed to get status"
            echo
            
            # Get recent logs for errors
            echo "Recent errors:"
            flyctl logs --app "$app_name" --lines 50 2>/dev/null | grep -i "error\|warn\|fail" | tail -10 || echo "No recent errors"
            echo
        done
        
        # Auto-scaling metrics if available
        if command -v ./deploy/scaling-cli.js &> /dev/null; then
            echo "=== Auto-scaling Status ==="
            ./deploy/scaling-cli.js status 2>/dev/null || echo "Auto-scaling service unavailable"
            echo
            
            echo "=== Application Metrics ==="
            ./deploy/scaling-cli.js metrics 2>/dev/null || echo "Metrics unavailable"
            echo
        fi
        
        echo "=== Performance Monitoring Completed: $(date) ==="
    } | tee "$output_file"
    
    print_status "Performance data saved to: $output_file"
}

# Health check all services
health_check() {
    print_header "System Health Check"
    
    local healthy=0
    local total=0
    
    for app_key in "${!APPS[@]}"; do
        local app_name="${APPS[$app_key]}"
        ((total++))
        
        print_status "Checking $app_name..."
        
        # Try to get status
        if flyctl status --app "$app_name" >/dev/null 2>&1; then
            local status=$(flyctl status --app "$app_name" | grep -E "running|healthy" | wc -l)
            if [ "$status" -gt 0 ]; then
                print_status "  ✅ $app_name is healthy"
                ((healthy++))
            else
                print_warning "  ⚠️  $app_name may have issues"
            fi
        else
            print_error "  ❌ $app_name is not responding"
        fi
    done
    
    echo
    if [ $healthy -eq $total ]; then
        print_status "🎉 All services are healthy ($healthy/$total)"
    elif [ $healthy -gt $((total / 2)) ]; then
        print_warning "⚠️  Most services are healthy ($healthy/$total)"
    else
        print_error "❌ System has significant issues ($healthy/$total healthy)"
    fi
}

# Update system
update_system() {
    print_header "System Update"
    
    print_warning "This will redeploy all services with latest code. Continue? (y/N)"
    read -r confirmation
    if [[ ! "$confirmation" =~ ^[Yy]$ ]]; then
        print_status "Update cancelled"
        return 0
    fi
    
    print_step "Running deployment script"
    ./deploy/deploy.sh --skip-tests
    
    print_status "System update completed"
}

# Clean up old resources
cleanup() {
    print_header "System Cleanup"
    
    print_step "Cleaning up old releases"
    for app_key in "${!APPS[@]}"; do
        local app_name="${APPS[$app_key]}"
        print_status "Cleaning up $app_name releases..."
        
        # Keep only last 10 releases
        flyctl releases --app "$app_name" --json 2>/dev/null | \
            jq -r '.[10:] | .[].id' 2>/dev/null | \
            head -5 | \
            xargs -I {} flyctl releases destroy {} --app "$app_name" 2>/dev/null || true
    done
    
    print_step "Cleaning up Docker images"
    docker system prune -f 2>/dev/null || true
    
    print_step "Cleaning up old backups"
    find ./backups -name "*.tar.gz" -mtime +7 -delete 2>/dev/null || true
    
    print_step "Cleaning up old monitoring logs"
    find ./monitoring -name "*.log" -mtime +3 -delete 2>/dev/null || true
    
    print_status "Cleanup completed"
}

# Show help
show_help() {
    echo "Connexio AI Maintenance Script"
    echo
    echo "Usage: $0 <command> [options]"
    echo
    echo "Commands:"
    echo "  status              - Check status of all services"
    echo "  logs [app] [follow] - View logs (optionally for specific app, optionally follow)"
    echo "  restart [app]       - Restart services (all or specific app)"
    echo "  scale <app> <count> - Scale specific app to count machines"
    echo "  db-maintenance      - Run database maintenance tasks"
    echo "  backup [type]       - Create system backup (full/config)"
    echo "  monitor [duration]  - Monitor performance for duration seconds"
    echo "  health              - Run comprehensive health check"
    echo "  update              - Update system with latest code"
    echo "  cleanup             - Clean up old resources"
    echo "  help                - Show this help"
    echo
    echo "Examples:"
    echo "  $0 status"
    echo "  $0 logs workers true"
    echo "  $0 restart littlehorse"
    echo "  $0 scale workers 5"
    echo "  $0 monitor 600"
}

# Main execution
main() {
    local command=${1:-"help"}
    
    case $command in
        status)
            check_status
            ;;
        logs)
            view_logs "$2" "$3"
            ;;
        restart)
            restart_services "$2"
            ;;
        scale)
            scale_services "$2" "$3"
            ;;
        db-maintenance)
            database_maintenance
            ;;
        backup)
            backup_system "$2"
            ;;
        monitor)
            monitor_performance "$2"
            ;;
        health)
            health_check
            ;;
        update)
            update_system
            ;;
        cleanup)
            cleanup
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            print_error "Unknown command: $command"
            echo
            show_help
            exit 1
            ;;
    esac
}

# Run main function
main "$@"