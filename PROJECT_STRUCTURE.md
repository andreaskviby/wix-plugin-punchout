# Project Structure Overview

## B2B PunchOut Connector for Wix

```
wix-plugin-punchout/
├── README.md                          # Original specification document
├── TESTING_DEPLOYMENT.md             # Testing and deployment guide  
├── BUYER_ONBOARDING.md               # Buyer integration documentation
├── package.json                      # Project dependencies and scripts
├── wix.config.json                   # Wix app configuration
├── tsconfig.json                     # TypeScript configuration
├── .eslintrc.json                    # ESLint configuration
├── .gitignore                        # Git ignore rules
│
├── src/
│   ├── backend/
│   │   ├── collections.json          # Data collection definitions
│   │   │
│   │   └── http-functions/
│   │       ├── api/
│   │       │   ├── validate-session.js    # Session validation endpoint
│   │       │   └── export.js              # CSV export functionality
│   │       │
│   │       └── punchout/
│   │           ├── cxml-setup.js          # cXML setup request handler
│   │           ├── cxml-return.js         # cXML return (POOM) handler
│   │           └── oci-handlers.js        # OCI start/return handlers
│   │
│   ├── blocks/
│   │   └── admin-dashboard/
│   │       ├── block.json             # Admin dashboard block configuration
│   │       └── dashboard.js           # Admin dashboard implementation
│   │
│   └── pages/
│       └── punchout-storefront.js     # PunchOut-enabled storefront page
│
└── [Additional files to be created]
    ├── src/backend/events.js          # Backend event handlers
    ├── src/backend/jobs.js            # Scheduled jobs
    └── test/                          # Test files
```

## Key Components

### Backend HTTP Functions
- **cXML Setup**: Handles PunchOutSetupRequest from Coupa/Ariba/JAGGAER
- **cXML Return**: Generates and sends PunchOutOrderMessage (POOM)
- **OCI Handlers**: Manages SAP SRM/ERP integration with HOOK_URL
- **Session Validation**: API for validating active sessions
- **Export Functions**: CSV export for logs, carts, and analytics

### Data Collections  
- **PunchoutBuyers**: Buyer configurations and credentials
- **PunchoutSessions**: Active PunchOut sessions with pricing/scope
- **PunchoutLogs**: Transaction logging for monitoring/debugging  
- **PunchoutCarts**: Cart data for analytics and troubleshooting

### Admin Dashboard (Wix Block)
- Buyer connection management
- Session monitoring  
- Transaction log viewer
- Analytics and reporting
- CSV export functionality

### Storefront Integration
- PunchOut session detection and initialization
- Buyer-specific catalog filtering and pricing
- "Return to Procurement" functionality  
- Cart conversion to cXML/OCI formats

## Architecture Highlights

### Security Features
- Shared secret authentication for cXML
- Session token validation with HMAC
- XML input validation (XXE prevention)
- Sensitive data encryption in Wix Secrets
- Comprehensive request/response logging

### Protocol Support
- **cXML 1.2+**: Full PunchOut setup and order message support
- **OCI 4.0+**: HOOK_URL based cart return for SAP systems
- **Multi-buyer**: Support for multiple procurement systems
- **Field Mapping**: Configurable product field transformations

### Enterprise Features  
- Session-based pricing and catalog scoping
- Real-time transaction monitoring
- CSV export for compliance and analytics
- Comprehensive error handling and logging
- Scalable multi-tenant architecture

### Best Practices Implemented
- RESTful API design
- Proper error handling and status codes
- Comprehensive logging without sensitive data
- Modular, maintainable code structure
- Security-first implementation
- Performance optimized queries
- Proper session management and cleanup