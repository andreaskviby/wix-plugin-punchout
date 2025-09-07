#!/bin/bash

# B2B PunchOut Connector Deployment Script
# Usage: ./deploy.sh [environment]
# Environments: development, staging, production

set -e

ENVIRONMENT=${1:-development}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR" && pwd)"

echo "🚀 Deploying B2B PunchOut Connector to $ENVIRONMENT"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Pre-deployment checks
log_info "Running pre-deployment checks..."

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2)
REQUIRED_NODE="16.0.0"

if ! npx semver -r ">=$REQUIRED_NODE" "$NODE_VERSION" >/dev/null 2>&1; then
    log_error "Node.js version $NODE_VERSION is not supported. Required: >=$REQUIRED_NODE"
    exit 1
fi

log_success "Node.js version: $NODE_VERSION"

# Check if Wix CLI is installed
if ! command -v wix &> /dev/null; then
    log_error "Wix CLI is not installed. Run: npm install -g @wix/cli"
    exit 1
fi

log_success "Wix CLI is available"

# Install dependencies
log_info "Installing dependencies..."
npm install --silent
log_success "Dependencies installed"

# Run linting
log_info "Running ESLint..."
if npm run lint > /dev/null 2>&1; then
    log_success "Code linting passed"
else
    log_warning "Linting issues detected - continuing deployment"
fi

# Run tests (if available)
if [ -f "jest.config.js" ] || grep -q "jest" package.json; then
    log_info "Running tests..."
    if npm test > /dev/null 2>&1; then
        log_success "Tests passed"
    else
        log_error "Tests failed - aborting deployment"
        exit 1
    fi
else
    log_warning "No tests found - skipping test phase"
fi

# Environment-specific configurations
case $ENVIRONMENT in
    "production")
        log_info "Configuring for production environment..."
        
        # Verify production secrets are set
        REQUIRED_SECRETS=(
            "COUPA_PROD_SECRET"
            "ARIBA_PROD_SECRET"
            "JAGGAER_PROD_SECRET"
        )
        
        for secret in "${REQUIRED_SECRETS[@]}"; do
            if ! wix secrets list --env production | grep -q "$secret"; then
                log_warning "Production secret $secret not found"
            fi
        done
        ;;
    "staging")
        log_info "Configuring for staging environment..."
        ;;
    "development")
        log_info "Configuring for development environment..."
        ;;
    *)
        log_error "Unknown environment: $ENVIRONMENT"
        exit 1
        ;;
esac

# Build project
log_info "Building project..."
if npm run build > /dev/null 2>&1; then
    log_success "Build completed successfully"
else
    log_error "Build failed"
    exit 1
fi

# Deploy to Wix
log_info "Deploying to Wix ($ENVIRONMENT)..."
if wix deploy --env "$ENVIRONMENT" --silent; then
    log_success "Deployment completed successfully"
else
    log_error "Deployment failed"
    exit 1
fi

# Create/update collections
log_info "Setting up data collections..."
if wix data create-collections --file src/backend/collections.json --env "$ENVIRONMENT" > /dev/null 2>&1; then
    log_success "Data collections configured"
else
    log_warning "Collections may already exist - continuing"
fi

# Health check
log_info "Running health check..."
sleep 5  # Wait for deployment to be ready

if [ "$ENVIRONMENT" = "production" ]; then
    HEALTH_URL="https://yourstore.wix.com/_functions/health"
else
    HEALTH_URL="https://$ENVIRONMENT.yourstore.wix.com/_functions/health"
fi

if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
    log_success "Health check passed"
else
    log_warning "Health check failed - deployment may need time to propagate"
fi

# Post-deployment tasks
log_info "Running post-deployment tasks..."

# Clear any cached data if needed
if [ "$ENVIRONMENT" = "production" ]; then
    log_info "Warming up production caches..."
    # Add any cache warming logic here
fi

# Display deployment summary
echo ""
echo "======================================"
echo "🎉 DEPLOYMENT COMPLETE"
echo "======================================"
echo "Environment: $ENVIRONMENT"
echo "Version: $(node -p "require('./package.json').version")"
echo "Timestamp: $(date)"
echo ""

if [ "$ENVIRONMENT" = "production" ]; then
    echo "🔗 Production URLs:"
    echo "   Health Check: $HEALTH_URL"
    echo "   cXML Setup: https://yourstore.wix.com/_functions/punchout/cxml/setup"
    echo "   OCI Start: https://yourstore.wix.com/_functions/punchout/oci/start"
    echo ""
    echo "📊 Next Steps:"
    echo "   1. Test with buyer systems"
    echo "   2. Monitor logs and performance"
    echo "   3. Update buyer configurations if needed"
    echo ""
fi

log_success "Deployment completed successfully! 🚀"