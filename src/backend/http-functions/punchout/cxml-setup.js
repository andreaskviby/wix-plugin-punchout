import { ok, badRequest, serverError, forbidden } from 'wix-http-functions';
import wixData from 'wix-data';
import { getSecret } from 'wix-secrets-backend';
import xml2js from 'xml2js';
import crypto from 'crypto';

/**
 * cXML PunchOut Setup Request Handler
 * Accepts POST requests with cXML PunchOutSetupRequest
 * Returns PunchOutSetupResponse with StartPage URL
 */
export async function post_setup(request) {
  try {
    console.log('cXML Setup Request received');

    // Parse XML body
    const xmlBody = await request.text();
    const parser = new xml2js.Parser({
      explicitArray: false,
      ignoreAttrs: false,
      mergeAttrs: true,
    });

    let parsedXml;
    try {
      parsedXml = await parser.parseStringPromise(xmlBody);
    } catch (xmlError) {
      console.error('XML parsing error:', xmlError);
      return badRequest({
        body: createErrorResponse('XML_PARSE_ERROR', 'Invalid XML format'),
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    // Log incoming request
    await logTransaction('in', 'cxml', null, '/punchout/cxml/setup', 200, xmlBody, request.headers);

    // Extract cXML elements
    const cxml = parsedXml.cXML;
    if (!cxml || !cxml.Request || !cxml.Request.PunchOutSetupRequest) {
      return badRequest({
        body: createErrorResponse('INVALID_REQUEST', 'Missing PunchOutSetupRequest'),
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    const setupRequest = cxml.Request.PunchOutSetupRequest;
    const header = cxml.Header;

    // Authenticate buyer
    const buyer = await authenticateBuyer(header, setupRequest);
    if (!buyer) {
      return forbidden({
        body: createErrorResponse('AUTH_FAILED', 'Authentication failed'),
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    // Create session
    const session = await createPunchoutSession(buyer, setupRequest);

    // Build StartPage URL
    const baseUrl = request.url.split('/')[0] + '//' + request.headers.host;
    const startPageUrl = `${baseUrl}/punchout/start?sid=${session.sid}`;

    // Create response XML
    const responseXml = createSetupResponse(cxml, startPageUrl);

    // Log outgoing response
    await logTransaction('out', 'cxml', buyer.buyerId, '/punchout/cxml/setup', 200, responseXml);

    return ok({
      body: responseXml,
      headers: {
        'Content-Type': 'text/xml',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Setup request error:', error);

    const errorResponse = createErrorResponse('INTERNAL_ERROR', 'Internal server error');
    await logTransaction('out', 'cxml', null, '/punchout/cxml/setup', 500, errorResponse);

    return serverError({
      body: errorResponse,
      headers: { 'Content-Type': 'text/xml' },
    });
  }
}

/**
 * Authenticate buyer based on cXML header and setup request
 */
async function authenticateBuyer(header, setupRequest) {
  try {
    const fromIdentity = header.From?.Credential?.Identity;
    const toIdentity = header.To?.Credential?.Identity;
    const senderIdentity = header.Sender?.Credential?.Identity;
    const sharedSecret = header.Sender?.Credential?.SharedSecret;

    if (!fromIdentity || !toIdentity || !senderIdentity || !sharedSecret) {
      console.warn('Missing required authentication fields');
      return null;
    }

    // Query buyer from database
    const buyerQuery = await wixData
      .query('PunchoutBuyers')
      .eq('type', 'cXML')
      .eq('active', true)
      .find();

    const buyer = buyerQuery.items.find(b => {
      const identities = b.identities || {};
      return (
        identities.from === fromIdentity &&
        identities.to === toIdentity &&
        identities.sender === senderIdentity
      );
    });

    if (!buyer) {
      console.warn('Buyer not found for identities:', { fromIdentity, toIdentity, senderIdentity });
      return null;
    }

    // Verify shared secret
    const storedSecret = await getSecret(buyer.sharedSecret);
    if (storedSecret !== sharedSecret) {
      console.warn('Shared secret mismatch for buyer:', buyer.buyerId);
      return null;
    }

    // Update last activity
    await wixData.update('PunchoutBuyers', buyer._id, {
      lastActivity: new Date(),
    });

    return buyer;
  } catch (error) {
    console.error('Authentication error:', error);
    return null;
  }
}

/**
 * Create a new PunchOut session
 */
async function createPunchoutSession(buyer, setupRequest) {
  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  const sessionData = {
    sid: sessionId,
    buyerId: buyer.buyerId,
    userHint: setupRequest.BuyerCookie?.content || '',
    pricingTier: buyer.priceListId,
    expiresAt: expiresAt,
    createdAt: new Date(),
    cartData: {},
  };

  const result = await wixData.insert('PunchoutSessions', sessionData);
  return { ...sessionData, _id: result._id };
}

/**
 * Generate secure session ID
 */
function generateSessionId() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create cXML SetupResponse
 */
function createSetupResponse(originalCxml, startPageUrl) {
  const payloadId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE cXML SYSTEM "http://xml.cxml.org/schemas/cXML/1.2.014/cXML.dtd">
<cXML payloadID="${payloadId}" timestamp="${timestamp}">
  <Response>
    <Status code="200" text="OK"/>
    <PunchOutSetupResponse>
      <StartPage>
        <URL>${startPageUrl}</URL>
      </StartPage>
    </PunchOutSetupResponse>
  </Response>
</cXML>`;
}

/**
 * Create error response XML
 */
function createErrorResponse(errorCode, errorText) {
  const payloadId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE cXML SYSTEM "http://xml.cxml.org/schemas/cXML/1.2.014/cXML.dtd">
<cXML payloadID="${payloadId}" timestamp="${timestamp}">
  <Response>
    <Status code="400" text="${errorCode}">${errorText}</Status>
  </Response>
</cXML>`;
}

/**
 * Log transaction for monitoring and debugging
 */
async function logTransaction(
  direction,
  protocol,
  buyerId,
  endpoint,
  httpStatus,
  payload,
  headers = {}
) {
  try {
    // Remove sensitive headers
    const sanitizedHeaders = { ...headers };
    delete sanitizedHeaders.authorization;
    delete sanitizedHeaders.cookie;

    await wixData.insert('PunchoutLogs', {
      timestamp: new Date(),
      direction,
      protocol,
      buyerId,
      endpoint,
      httpStatus,
      payload,
      headers: sanitizedHeaders,
    });
  } catch (error) {
    console.error('Logging error:', error);
  }
}
