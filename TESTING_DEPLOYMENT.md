# B2B PunchOut Connector - Testing & Deployment Guide

## Overview
This guide provides step-by-step instructions for testing and deploying the Wix B2B PunchOut Connector to production.

## Prerequisites

### Development Environment
- Node.js 16+ 
- Wix CLI installed (`npm install -g @wix/cli`)
- Access to Wix Secrets Manager for storing sensitive data

### Testing Environment
- Test procurement system (Coupa sandbox, Ariba test environment, or SAP system)
- Valid test credentials and endpoints
- SSL certificate for production domain

## Development Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Wix Secrets
Store sensitive data in Wix Secrets Manager:
```bash
# Example shared secrets for test buyers
wix secrets set COUPA_TEST_SECRET "your-coupa-test-secret"
wix secrets set ARIBA_TEST_SECRET "your-ariba-test-secret"
```

### 3. Local Development
```bash
# Start development server
npm run dev

# In separate terminal, run linting
npm run lint

# Run tests
npm run test
```

## Testing Procedures

### Phase 1: Unit Testing

#### Backend HTTP Functions
```bash
# Test cXML setup endpoint
curl -X POST http://localhost:3000/_functions/punchout/cxml/setup \
  -H "Content-Type: text/xml" \
  -d @test-data/sample-setup-request.xml

# Test OCI start endpoint  
curl "http://localhost:3000/_functions/punchout/oci/start?HOOK_URL=http://test.sap.com/hook&USERNAME=testuser"
```

#### Data Collections
Verify collections are created properly:
```bash
# Check collections via Wix Data API
curl -X GET http://localhost:3000/_api/collections/PunchoutBuyers
```

### Phase 2: Integration Testing

#### cXML Flow Testing (Coupa/Ariba/JAGGAER)

1. **Setup Test Buyer**
   - Use admin dashboard to create test buyer
   - Configure identities: From, To, Sender
   - Set shared secret from Wix Secrets
   - Assign test price list

2. **Test Setup Request**
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <!DOCTYPE cXML SYSTEM "http://xml.cxml.org/schemas/cXML/1.2.014/cXML.dtd">
   <cXML payloadID="test-123" timestamp="2024-01-01T12:00:00Z">
     <Header>
       <From><Credential domain="test.coupa.com"><Identity>test-buyer</Identity></Credential></From>
       <To><Credential domain="yoursite.wix.com"><Identity>your-supplier</Identity></Credential></To>
       <Sender><Credential domain="test.coupa.com"><Identity>test-sender</Identity><SharedSecret>test-secret</SharedSecret></Credential></Sender>
     </Header>
     <Request>
       <PunchOutSetupRequest operation="create">
         <BuyerCookie>test-user-session</BuyerCookie>
       </PunchOutSetupRequest>
     </Request>
   </cXML>
   ```

3. **Verify Setup Response**
   - Should return 200 status
   - Should contain valid StartPage URL
   - Session should be created in PunchoutSessions collection

4. **Test Shopping Flow**
   - Navigate to StartPage URL
   - Verify PunchOut mode is active
   - Add items to cart
   - Check pricing reflects buyer configuration
   - Click "Return to Procurement"

5. **Verify POOM Generation**
   - Check POOM XML format
   - Verify all line items included
   - Check field mappings applied
   - Confirm totals calculated correctly

#### OCI Flow Testing (SAP)

1. **Setup Test URL**
   ```
   GET /punchout/oci/start?HOOK_URL=http://test.sap.com/hook&USERNAME=testuser&USEREMAIL=test@sap.com
   ```

2. **Verify Session Creation**
   - HOOK_URL stored correctly
   - User redirected to storefront
   - Session shows OCI type

3. **Test Return Flow**
   - Add items to cart
   - Click return button
   - Verify OCI form fields generated
   - Check POST to HOOK_URL succeeds

### Phase 3: End-to-End Testing

#### With Real Procurement Systems

1. **Coupa Testing**
   - Set up supplier profile in Coupa
   - Configure PunchOut catalog
   - Test full procurement workflow
   - Verify requisition creation

2. **Ariba Testing**
   - Register in Ariba Network
   - Configure cXML endpoints
   - Test with Ariba Buying
   - Verify shopping experience

3. **SAP Testing**  
   - Configure OCI catalog in SAP SRM
   - Test HOOK_URL integration
   - Verify cart return format
   - Check purchase requisition creation

## Performance Testing

### Load Testing
```bash
# Install testing tools
npm install -g artillery

# Run load tests
artillery run test-config/load-test.yml
```

### Monitoring Setup
- Configure Wix monitoring alerts
- Set up log aggregation
- Monitor HTTP function performance
- Track session creation/expiration

## Security Testing

### Checklist
- [ ] XML input validation (XXE prevention)
- [ ] Shared secret validation
- [ ] Session token security
- [ ] SQL injection prevention
- [ ] Input sanitization
- [ ] HTTPS enforcement
- [ ] Secrets never logged
- [ ] Session timeout enforcement

### Security Scan
```bash
# Run security audit
npm audit

# Test for common vulnerabilities
npm run security-scan
```

## Deployment Process

### Pre-Deployment Checklist
- [ ] All tests passing
- [ ] Security audit complete
- [ ] Performance testing satisfactory
- [ ] Documentation updated
- [ ] Secrets configured in production
- [ ] SSL certificate valid
- [ ] Buyer configurations migrated
- [ ] Rollback plan prepared

### Production Deployment

#### 1. Environment Setup
```bash
# Set production environment
export WIX_ENV=production

# Verify production secrets
wix secrets list --env production
```

#### 2. Build and Deploy
```bash
# Build for production
npm run build

# Deploy to Wix
wix deploy --env production

# Verify deployment
wix status --env production
```

#### 3. Post-Deployment Verification
```bash
# Health check
curl -X GET https://yoursite.wix.com/_functions/health

# Test setup endpoint
curl -X POST https://yoursite.wix.com/_functions/punchout/cxml/setup \
  -H "Content-Type: text/xml" \
  -d @production-test-data/health-check.xml
```

### Database Migration
```bash
# Create production collections
wix data create-collections --file src/backend/collections.json

# Migrate buyer data (if upgrading)
wix data migrate --from staging --to production
```

## Monitoring & Maintenance

### Health Monitoring
- Monitor HTTP function response times
- Track session creation/failure rates
- Alert on authentication failures
- Monitor cart conversion rates

### Log Management
```bash
# View logs
wix logs --env production --function punchout-cxml-setup

# Export logs for analysis
wix logs export --start "2024-01-01" --end "2024-01-31"
```

### Regular Maintenance
- Weekly log review and cleanup
- Monthly security updates
- Quarterly performance reviews
- Buyer configuration audits

## Troubleshooting

### Common Issues

#### Authentication Failures
1. Check shared secret configuration
2. Verify identity mapping
3. Review SSL certificate validity
4. Check timestamp synchronization

#### Session Issues
1. Verify session creation in database
2. Check session expiration times
3. Validate session token generation
4. Review CORS configuration

#### Cart Return Failures
1. Test buyer return URL accessibility
2. Validate XML/form formatting
3. Check network connectivity
4. Review timeout settings

### Debug Tools
```bash
# Enable debug logging
export DEBUG=punchout:*

# Test specific buyer
npm run debug-buyer --buyer-id=test-coupa

# Replay failed transaction
npm run replay-transaction --log-id=12345
```

## Support Contacts

### Development Team
- Lead Developer: [Your contact]
- DevOps Engineer: [DevOps contact]
- QA Lead: [QA contact]

### Buyer Support
- Technical Support: support@yourcompany.com
- Integration Help: integration@yourcompany.com
- Emergency Contact: +1-555-HELP (24/7)

## Rollback Procedures

### Immediate Rollback
```bash
# Rollback to previous version
wix deploy --version previous --env production

# Verify rollback successful
wix status --env production
```

### Data Rollback
```bash
# Restore database from backup
wix data restore --backup-id backup-20240101 --env production

# Verify data integrity
wix data validate --env production
```

This completes the testing and deployment guide. Follow these procedures carefully to ensure a successful production deployment of your B2B PunchOut Connector.