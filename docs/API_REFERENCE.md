# API Reference - B2B PunchOut Connector

## Overview
Complete API documentation for the Wix B2B PunchOut Connector endpoints.

## Base URL
- **Development**: `http://localhost:3000`  
- **Production**: `https://yourstore.wix.com`

---

## PunchOut Protocol Endpoints

### cXML Setup Request
Handle cXML PunchOutSetupRequest from procurement systems.

**Endpoint**: `POST /_functions/punchout/cxml/setup`

**Content-Type**: `text/xml`

**Request Body**: cXML PunchOutSetupRequest
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE cXML SYSTEM "http://xml.cxml.org/schemas/cXML/1.2.014/cXML.dtd">
<cXML payloadID="unique-id" timestamp="2024-01-15T10:30:00Z">
  <Header>
    <From><Credential domain="buyer.coupa.com"><Identity>buyer-id</Identity></Credential></From>
    <To><Credential domain="yourstore.wix.com"><Identity>supplier-id</Identity></Credential></To>
    <Sender><Credential domain="buyer.coupa.com"><Identity>sender-id</Identity><SharedSecret>secret</SharedSecret></Credential></Sender>
  </Header>
  <Request>
    <PunchOutSetupRequest operation="create">
      <BuyerCookie>user-session-id</BuyerCookie>
    </PunchOutSetupRequest>
  </Request>
</cXML>
```

**Response**: cXML PunchOutSetupResponse
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE cXML SYSTEM "http://xml.cxml.org/schemas/cXML/1.2.014/cXML.dtd">
<cXML payloadID="response-id" timestamp="2024-01-15T10:30:01Z">
  <Response>
    <Status code="200" text="OK"/>
    <PunchOutSetupResponse>
      <StartPage>
        <URL>https://yourstore.wix.com/punchout/start?sid=session-token</URL>
      </StartPage>
    </PunchOutSetupResponse>
  </Response>
</cXML>
```

**Status Codes**:
- `200` - Success
- `400` - Invalid XML or missing required fields
- `403` - Authentication failed
- `500` - Internal server error

---

### cXML Return (POOM)
Generate and send PunchOut Order Message to buyer system.

**Endpoint**: `POST /_functions/punchout/cxml/return`

**Content-Type**: `application/x-www-form-urlencoded`

**Request Parameters**:
- `sessionId` (string, required) - Active session ID
- `cartData` (JSON string, required) - Cart items array

**Cart Data Format**:
```json
[
  {
    "sku": "PROD-123",
    "name": "Product Name", 
    "quantity": 2,
    "price": "19.99",
    "currency": "USD",
    "uom": "EA",
    "category": "Office Supplies",
    "vendor": "Supplier Name",
    "manufacturerPartId": "MFR-123"
  }
]
```

**Response**:
```json
{
  "success": true,
  "method": "server_post",
  "buyerResponse": 200,
  "itemCount": 2
}
```

---

### OCI Start
Initialize OCI session for SAP systems.

**Endpoint**: `GET|POST /_functions/punchout/oci/start`

**Query Parameters**:
- `HOOK_URL` (string, required) - SAP return URL
- `USERNAME` (string, optional) - User name
- `USEREMAIL` (string, optional) - User email
- `CALLER` (string, optional) - Calling system (default: SRM)
- `VERSION` (string, optional) - OCI version (default: 4.0)

**Response**: HTTP 302 redirect to storefront with session

---

### OCI Return
Return cart to SAP system via HOOK_URL.

**Endpoint**: `POST /_functions/punchout/oci/return`

**Content-Type**: `application/x-www-form-urlencoded`

**Request Parameters**:
- `sessionId` (string, required) - Active session ID  
- `cartData` (JSON string, required) - Cart items array

**Response**:
```json
{
  "success": true,
  "hookUrlResponse": 200,
  "itemCount": 3
}
```

---

## Admin API Endpoints

### Session Validation
Validate active PunchOut session.

**Endpoint**: `POST /_functions/api/validate-session`

**Content-Type**: `application/json`

**Request**:
```json
{
  "sessionId": "session-token-here"
}
```

**Response**:
```json
{
  "sid": "session-token-here",
  "buyerId": "coupa_acme_corp",
  "userHint": "john.doe",
  "pricingTier": "contract_pricing",
  "expiresAt": "2024-01-15T11:30:00Z",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

---

### Export Transaction Logs
Export transaction logs as CSV.

**Endpoint**: `GET /_functions/api/export/logs`

**Query Parameters**:
- `startDate` (ISO date, optional) - Start date filter
- `endDate` (ISO date, optional) - End date filter  
- `protocol` (string, optional) - Protocol filter (cXML/OCI)

**Response**: CSV file download

---

### Export Cart Data
Export cart data as CSV.

**Endpoint**: `GET /_functions/api/export/carts`

**Query Parameters**:
- `startDate` (ISO date, optional) - Start date filter
- `endDate` (ISO date, optional) - End date filter
- `buyerId` (string, optional) - Buyer filter

**Response**: CSV file download

---

### Export Analytics
Export buyer analytics as CSV.

**Endpoint**: `GET /_functions/api/export/analytics`

**Query Parameters**:
- `startDate` (ISO date, optional) - Start date filter
- `endDate` (ISO date, optional) - End date filter

**Response**: CSV file download

---

## Health Check

### System Health
Check system health and status.

**Endpoint**: `GET /_functions/health`

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z", 
  "version": "1.0.0",
  "service": "wix-punchout-connector"
}
```

---

## Error Responses

### Standard Error Format
```json
{
  "error": "Error description",
  "code": "ERROR_CODE", 
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### cXML Error Format
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE cXML SYSTEM "http://xml.cxml.org/schemas/cXML/1.2.014/cXML.dtd">
<cXML payloadID="error-response-id" timestamp="2024-01-15T10:30:00Z">
  <Response>
    <Status code="400" text="ERROR_CODE">Error description</Status>
  </Response>
</cXML>
```

### Common Error Codes
- `XML_PARSE_ERROR` - Invalid XML format
- `AUTH_FAILED` - Authentication failed
- `INVALID_REQUEST` - Missing required fields
- `SESSION_EXPIRED` - Session no longer valid
- `INTERNAL_ERROR` - Server error

---

## Rate Limits
- **Setup Requests**: 100 requests per minute per buyer
- **Session Operations**: 1000 requests per minute per session
- **Export Operations**: 10 requests per hour per admin user

## Authentication
- **cXML**: Shared secret in XML header
- **OCI**: Domain-based authentication
- **Admin APIs**: Wix authentication required

## SDKs and Examples
- [Node.js Examples](../test-data/)
- [Postman Collection](../test-data/postman-collection.json)
- [Load Testing Scripts](../test-data/load-test.yml)