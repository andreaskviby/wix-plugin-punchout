# B2B PunchOut Connector for Wix

**Let enterprise buyers shop your Wix catalog inside their e-procurement—no custom IT.**

A best-in-class Wix app that implements cXML/OCI PunchOut protocols so buyers in Ariba, Coupa, JAGGAER, SAP and other procurement systems can click a PunchOut link, land in your Wix store with negotiated pricing, and send their cart back to procurement for approval and PO.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)](https://nodejs.org/)
[![Wix](https://img.shields.io/badge/Built%20for-Wix-blue)](https://www.wix.com/)

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development server  
npm run dev

# Deploy to Wix
npm run deploy
```

## ✨ Key Features

### 🌐 **Multi-Protocol Support**
- **cXML 1.2+**: Full support for Ariba, Coupa, JAGGAER
- **OCI 4.0+**: Native SAP SRM/ERP integration
- Standards-compliant implementation

### 🔐 **Enterprise Security**
- Shared secret authentication
- Session-based security with HMAC tokens
- XML input validation (XXE prevention)
- Comprehensive audit logging

### 📊 **Advanced Administration**
- Real-time buyer connection management
- Session monitoring and analytics
- Transaction logging with CSV export
- Performance metrics and reporting

### 💰 **Flexible Pricing & Cataloging**
- Buyer-specific pricing tiers
- Catalog scope management
- Custom field mappings
- Multi-currency support

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Procurement   │    │  Wix PunchOut    │    │   Wix Store     │
│     System      │───▶│    Connector     │───▶│   Storefront    │
│ (Ariba/Coupa/   │    │                  │    │                 │
│  JAGGAER/SAP)   │◀───│  HTTP Functions  │◀───│  Shopping Cart  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Core Components

- **HTTP Functions**: Handle cXML/OCI protocol requests
- **Admin Dashboard**: Buyer management and monitoring (Wix Block)
- **Session Management**: Secure session handling with pricing
- **Data Collections**: Buyers, sessions, logs, and cart storage
- **Storefront Integration**: PunchOut-aware shopping experience

## 📋 Protocol Support

### cXML Flow (Ariba/Coupa/JAGGAER)
1. **Setup Request**: `POST /punchout/cxml/setup`
2. **Setup Response**: Returns StartPage URL with session
3. **Shopping**: Buyer browses Wix store with contract pricing  
4. **Cart Return**: Generates and sends PunchOutOrderMessage (POOM)

### OCI Flow (SAP SRM/ERP)
1. **Start Request**: `GET/POST /punchout/oci/start?HOOK_URL=...`
2. **Shopping**: Session-aware browsing with SAP user context
3. **Cart Return**: `POST` to HOOK_URL with OCI form fields

## 🛠️ Installation & Setup

### Prerequisites
- Node.js 16+
- Wix Developer Account
- SSL Certificate (for production)

### Development Setup

1. **Clone and Install**
   ```bash
   git clone [repository-url]
   cd wix-plugin-punchout
   npm install
   ```

2. **Configure Wix Secrets**
   ```bash
   # Store buyer shared secrets
   wix secrets set BUYER_COUPA_SECRET "your-coupa-shared-secret"
   wix secrets set BUYER_ARIBA_SECRET "your-ariba-shared-secret"
   ```

3. **Start Development**
   ```bash
   npm run dev
   ```

4. **Deploy Collections**
   ```bash
   wix data create-collections --file src/backend/collections.json
   ```

## 📚 Documentation

### Technical Documentation
- **[Testing & Deployment Guide](TESTING_DEPLOYMENT.md)** - Complete testing procedures and production deployment
- **[Buyer Onboarding Guide](BUYER_ONBOARDING.md)** - Step-by-step integration for each procurement system  
- **[Project Structure](PROJECT_STRUCTURE.md)** - Detailed code organization and architecture

### Business & Marketing
- **[Business Case & Market Analysis](BUSINESS_CASE.md)** - Comprehensive market opportunity and ROI analysis
- **[Executive Brief](EXECUTIVE_BRIEF.md)** - Quick summary for decision-makers and partners

## 🔧 Configuration

### Buyer Setup Example
```javascript
{
  "buyerId": "coupa_acme_corp",
  "type": "cXML",
  "identities": {
    "from": "buyer.coupa.com", 
    "to": "yourstore.wix.com",
    "sender": "buyer.coupa.com"
  },
  "sharedSecret": "stored-in-wix-secrets",
  "priceListId": "coupa_pricing",
  "catalogScope": {
    "allowedCollections": ["b2b-products"]
  },
  "fieldMappings": {
    "sku": "supplierPartId",
    "category": "unspscCode"
  }
}
```

## 📊 API Endpoints

### PunchOut Endpoints
- `POST /_functions/punchout/cxml/setup` - cXML setup handler
- `POST /_functions/punchout/cxml/return` - POOM generation
- `GET|POST /_functions/punchout/oci/start` - OCI session start  
- `POST /_functions/punchout/oci/return` - OCI cart return

### Admin APIs
- `POST /_functions/api/validate-session` - Session validation
- `GET /_functions/api/export/logs` - Export transaction logs
- `GET /_functions/api/export/carts` - Export cart data
- `GET /_functions/health` - Health check endpoint

## 🧪 Testing

### Unit Tests
```bash
npm test
```

### Integration Testing
```bash
# Test cXML setup
curl -X POST http://localhost:3000/_functions/punchout/cxml/setup \
  -H "Content-Type: text/xml" \
  -d @test-data/sample-setup-request.xml

# Test OCI start  
curl "http://localhost:3000/_functions/punchout/oci/start?HOOK_URL=http://test.sap.com/hook&USERNAME=testuser"
```

### Load Testing
```bash
npm install -g artillery
artillery run test-config/load-test.yml
```

## 📈 Monitoring & Analytics

### Built-in Analytics
- Session creation and conversion rates
- Buyer activity tracking  
- Transaction volume metrics
- Performance monitoring

### Export Capabilities
- CSV export of all transaction logs
- Cart data for business analysis
- Buyer analytics for account management

## 🛡️ Security Features

- **Authentication**: Shared secret validation for cXML
- **Session Security**: HMAC-signed session tokens  
- **Input Validation**: XML parsing with XXE protection
- **Audit Trail**: Comprehensive logging without sensitive data
- **Encryption**: All sensitive data stored in Wix Secrets

## 🌍 Procurement System Compatibility

### Tested With
- ✅ **Coupa** - Full cXML support with requisition creation
- ✅ **SAP Ariba** - Standards-compliant cXML implementation  
- ✅ **JAGGAER** - Native cXML/OCI integration
- ✅ **SAP SRM/ERP** - OCI HOOK_URL cart return

### Standards Compliance
- cXML 1.2.014+ specification
- OCI 4.0+ specification  
- HTTPS/TLS encryption
- XML Schema validation

## 📦 Deployment

### Production Deployment
```bash
# Build for production
npm run build

# Deploy to Wix
npm run deploy --env production

# Verify deployment
npm run health-check
```

### Environment Configuration
- Production secrets management
- SSL certificate setup
- Performance monitoring
- Backup procedures

## 🤝 Support & Contributing

### Getting Help
- **Technical Support**: support@yourcompany.com
- **Integration Help**: integration@yourcompany.com  
- **Emergency**: +1-555-EMERGENCY (24/7)

### Contributing
1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🏆 Why Choose This Connector?

### Enterprise-Grade
- Built for high-volume B2B transactions
- Scalable multi-tenant architecture
- Comprehensive error handling and recovery

### Developer-Friendly  
- Clean, documented code
- Extensive testing suite
- Easy customization and extension

### Business-Ready
- Complete admin dashboard
- Real-time monitoring and alerts
- Professional buyer onboarding documentation

---

**Transform your Wix store into an enterprise B2B platform with seamless procurement integration.** 

Start with our comprehensive testing guide and get your first buyer connected in under an hour.