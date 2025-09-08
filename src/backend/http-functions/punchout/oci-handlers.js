import { ok, badRequest, serverError, found } from 'wix-http-functions';
import wixData from 'wix-data';
import crypto from 'crypto';

/**
 * OCI PunchOut Start Handler
 * Accepts GET/POST requests with OCI parameters including HOOK_URL
 * Redirects to storefront with session
 */
export async function get_oci_start(request) {
  return handleOciStart(request, 'GET');
}

export async function post_oci_start(request) {
  return handleOciStart(request, 'POST');
}

async function handleOciStart(request, method) {
  try {
    console.log(`OCI Start Request received (${method})`);

    // Extract parameters from URL or form data
    let params;
    if (method === 'GET') {
      params = Object.fromEntries(new URLSearchParams(request.url.split('?')[1] || ''));
    } else {
      const formData = await request.formData();
      params = Object.fromEntries(formData.entries());
    }

    // Log incoming request
    await logTransaction(
      'in',
      'oci',
      null,
      '/punchout/oci/start',
      200,
      JSON.stringify(params),
      request.headers
    );

    // Validate required OCI parameters
    if (!params.HOOK_URL) {
      return badRequest({
        body: 'Missing required HOOK_URL parameter',
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // Find or create buyer for OCI
    const buyer = await findOrCreateOciBuyer(params);
    if (!buyer) {
      return badRequest({
        body: 'Unable to authenticate OCI buyer',
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // Create session with HOOK_URL
    const session = await createOciSession(buyer, params);

    // Build redirect URL to storefront
    const baseUrl = request.url.split('/')[0] + '//' + request.headers.host;
    const storefrontUrl = `${baseUrl}/punchout/start?sid=${session.sid}`;

    // Log outgoing response
    await logTransaction(
      'out',
      'oci',
      buyer.buyerId,
      '/punchout/oci/start',
      302,
      `Redirect to: ${storefrontUrl}`
    );

    return found({
      headers: {
        Location: storefrontUrl,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('OCI start error:', error);

    await logTransaction('out', 'oci', null, '/punchout/oci/start', 500, `Error: ${error.message}`);

    return serverError({
      body: 'Internal server error',
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

/**
 * OCI Return Handler
 * Builds OCI form fields and POSTs back to HOOK_URL
 */
export async function post_oci_return(request) {
  try {
    const formData = await request.formData();
    const sessionId = formData.get('sessionId');
    const cartData = JSON.parse(formData.get('cartData') || '[]');

    if (!sessionId) {
      return badRequest({
        body: 'Missing session ID',
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // Get session
    const sessionQuery = await wixData.query('PunchoutSessions').eq('sid', sessionId).find();

    if (sessionQuery.items.length === 0) {
      return badRequest({
        body: 'Invalid session',
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    const session = sessionQuery.items[0];

    if (!session.hookUrl) {
      return badRequest({
        body: 'No HOOK_URL in session',
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // Build OCI form fields
    const ociFields = buildOciFormFields(cartData);

    // Save cart
    await saveCart(session, cartData, 'oci');

    // POST to HOOK_URL
    const response = await postToHookUrl(session.hookUrl, ociFields);

    // Log transaction
    await logTransaction(
      'out',
      'oci',
      session.buyerId,
      '/punchout/oci/return',
      response.status,
      JSON.stringify(ociFields)
    );

    return ok({
      body: JSON.stringify({
        success: true,
        hookUrlResponse: response.status,
        itemCount: cartData.length,
      }),
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('OCI return error:', error);
    return serverError({
      body: JSON.stringify({ success: false, error: error.message }),
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Find or create OCI buyer based on parameters
 */
async function findOrCreateOciBuyer(params) {
  try {
    // Extract buyer identification from OCI parameters
    const buyerDomain = extractDomainFromUrl(params.HOOK_URL);
    const username = params.USERNAME || 'unknown';
    const buyerId = `oci_${buyerDomain}_${username}`.replace(/[^a-zA-Z0-9_]/g, '_');

    // Check if buyer exists
    const buyerQuery = await wixData
      .query('PunchoutBuyers')
      .eq('buyerId', buyerId)
      .eq('type', 'OCI')
      .find();

    let buyer = buyerQuery.items[0];

    if (!buyer) {
      // Create new OCI buyer
      const buyerData = {
        buyerId: buyerId,
        type: 'OCI',
        identities: {
          hookUrl: params.HOOK_URL,
          username: username,
          domain: buyerDomain,
        },
        active: true,
        createdDate: new Date(),
        lastActivity: new Date(),
        catalogScope: {},
        fieldMappings: {},
      };

      const result = await wixData.insert('PunchoutBuyers', buyerData);
      buyer = { ...buyerData, _id: result._id };
    } else {
      // Update last activity
      await wixData.update('PunchoutBuyers', buyer._id, {
        lastActivity: new Date(),
      });
    }

    return buyer;
  } catch (error) {
    console.error('Error finding/creating OCI buyer:', error);
    return null;
  }
}

/**
 * Create OCI session with HOOK_URL
 */
async function createOciSession(buyer, params) {
  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  const sessionData = {
    sid: sessionId,
    buyerId: buyer.buyerId,
    userHint: params.USERNAME || '',
    hookUrl: params.HOOK_URL,
    pricingTier: buyer.priceListId,
    expiresAt: expiresAt,
    createdAt: new Date(),
    cartData: {},
  };

  const result = await wixData.insert('PunchoutSessions', sessionData);
  return { ...sessionData, _id: result._id };
}

/**
 * Build OCI form fields from cart data
 */
function buildOciFormFields(cartData) {
  const fields = {};

  cartData.forEach((item, index) => {
    const itemNum = index + 1;

    fields[`NEW_ITEM-${itemNum}-DESCRIPTION`] = item.name || '';
    fields[`NEW_ITEM-${itemNum}-MATNR`] = item.sku || '';
    fields[`NEW_ITEM-${itemNum}-QUANTITY`] = item.quantity || '1';
    fields[`NEW_ITEM-${itemNum}-UNIT`] = item.uom || 'EA';
    fields[`NEW_ITEM-${itemNum}-PRICE`] = item.price || '0.00';
    fields[`NEW_ITEM-${itemNum}-CURRENCY`] = item.currency || 'USD';
    fields[`NEW_ITEM-${itemNum}-LEADTIME`] = item.leadTime || '0';
    fields[`NEW_ITEM-${itemNum}-VENDOR`] = item.vendor || '';
    fields[`NEW_ITEM-${itemNum}-VENDORMAT`] = item.vendorSku || '';
    fields[`NEW_ITEM-${itemNum}-MANUFACTCODE`] = item.manufacturerCode || '';
    fields[`NEW_ITEM-${itemNum}-SERVICE`] = item.service || '';
  });

  return fields;
}

/**
 * POST form fields to HOOK_URL
 */
async function postToHookUrl(hookUrl, fields) {
  const formBody = new URLSearchParams();

  Object.keys(fields).forEach(key => {
    formBody.append(key, fields[key]);
  });

  const response = await fetch(hookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formBody,
  });

  return response;
}

/**
 * Save cart to database
 */
async function saveCart(session, cartData, protocol) {
  try {
    const cartEntry = {
      sid: session.sid,
      buyerId: session.buyerId,
      lines: cartData,
      totals: calculateTotals(cartData),
      postedAt: new Date(),
      status: 'posted',
      returnUrl: session.hookUrl,
      protocol: protocol,
    };

    await wixData.insert('PunchoutCarts', cartEntry);
  } catch (error) {
    console.error('Error saving cart:', error);
  }
}

/**
 * Calculate cart totals
 */
function calculateTotals(cartData) {
  let subtotal = 0;
  let totalQuantity = 0;

  cartData.forEach(item => {
    const price = parseFloat(item.price || 0);
    const quantity = parseInt(item.quantity || 1);
    subtotal += price * quantity;
    totalQuantity += quantity;
  });

  return {
    subtotal: subtotal.toFixed(2),
    tax: '0.00',
    total: subtotal.toFixed(2),
    currency: cartData[0]?.currency || 'USD',
    itemCount: cartData.length,
    totalQuantity: totalQuantity,
  };
}

/**
 * Extract domain from URL
 */
function extractDomainFromUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

/**
 * Generate secure session ID
 */
function generateSessionId() {
  return crypto.randomBytes(32).toString('hex');
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
