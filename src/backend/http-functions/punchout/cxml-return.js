import { ok, badRequest, serverError } from 'wix-http-functions';
import wixData from 'wix-data';
import crypto from 'crypto';

/**
 * cXML PunchOut Order Message (POOM) Handler
 * Builds and sends POOM to buyer's return URL
 */
export async function post_cxml_return(request) {
  try {
    const formData = await request.formData();
    const sessionId = formData.get('sessionId');
    const cartData = JSON.parse(formData.get('cartData') || '[]');

    if (!sessionId) {
      return badRequest({
        body: JSON.stringify({ success: false, error: 'Missing session ID' }),
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get session
    const sessionQuery = await wixData.query('PunchoutSessions')
      .eq('sid', sessionId)
      .find();

    if (sessionQuery.items.length === 0) {
      return badRequest({
        body: JSON.stringify({ success: false, error: 'Invalid session' }),
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const session = sessionQuery.items[0];

    // Get buyer
    const buyerQuery = await wixData.query('PunchoutBuyers')
      .eq('buyerId', session.buyerId)
      .find();

    if (buyerQuery.items.length === 0) {
      return badRequest({
        body: JSON.stringify({ success: false, error: 'Buyer not found' }),
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const buyer = buyerQuery.items[0];

    // Build POOM XML
    const poomXml = buildPunchOutOrderMessage(buyer, session, cartData);
    
    // Save cart
    await saveCart(session, cartData, 'cxml');

    // Send POOM to buyer's return URL
    let response;
    if (buyer.returnUrlRules && buyer.returnUrlRules.url) {
      response = await sendPoomToBuyer(buyer.returnUrlRules.url, poomXml);
    } else {
      // If no return URL configured, return the POOM for browser POST
      response = { status: 200, method: 'browser_post' };
    }
    
    // Log transaction
    await logTransaction('out', 'cxml', session.buyerId, '/punchout/cxml/return', response.status, poomXml);

    // Clean up session
    await wixData.remove('PunchoutSessions', session._id);

    return ok({
      body: JSON.stringify({ 
        success: true, 
        method: response.method || 'server_post',
        buyerResponse: response.status,
        poom: response.method === 'browser_post' ? poomXml : undefined,
        itemCount: cartData.length 
      }),
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('cXML return error:', error);
    return serverError({
      body: JSON.stringify({ success: false, error: error.message }),
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Build PunchOut Order Message (POOM) XML
 */
function buildPunchOutOrderMessage(buyer, session, cartData) {
  const payloadId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const totals = calculateTotals(cartData);

  let itemsXml = '';
  cartData.forEach((item, index) => {
    const lineNumber = index + 1;
    const supplierPartId = applyFieldMapping(buyer, 'sku', item.sku) || item.sku;
    const classification = applyFieldMapping(buyer, 'category', item.category) || '';
    const unitPrice = parseFloat(item.price || 0).toFixed(2);
    const quantity = parseInt(item.quantity || 1);

    itemsXml += `
    <ItemIn quantity="${quantity}" lineNumber="${lineNumber}">
      <ItemID>
        <SupplierPartID>${escapeXml(supplierPartId)}</SupplierPartID>
        <SupplierPartAuxiliaryID>${escapeXml(item.sku)}</SupplierPartAuxiliaryID>
      </ItemID>
      <ItemDetail>
        <UnitPrice>
          <Money currency="${item.currency || 'USD'}">${unitPrice}</Money>
        </UnitPrice>
        <Description xml:lang="en">${escapeXml(item.name || '')}</Description>
        <UnitOfMeasure>${escapeXml(item.uom || 'EA')}</UnitOfMeasure>
        ${classification ? `<Classification domain="UNSPSC">${escapeXml(classification)}</Classification>` : ''}
        <ManufacturerPartID>${escapeXml(item.manufacturerPartId || '')}</ManufacturerPartID>
        <ManufacturerName>${escapeXml(item.manufacturer || '')}</ManufacturerName>
      </ItemDetail>
      ${buildExtrinsics(buyer, item)}
    </ItemIn>`;
  });

  const poomXml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE cXML SYSTEM "http://xml.cxml.org/schemas/cXML/1.2.014/cXML.dtd">
<cXML payloadID="${payloadId}" timestamp="${timestamp}">
  <Header>
    <From>
      <Credential domain="${buyer.identities.to}">
        <Identity>${buyer.identities.to}</Identity>
      </Credential>
    </From>
    <To>
      <Credential domain="${buyer.identities.from}">
        <Identity>${buyer.identities.from}</Identity>
      </Credential>
    </To>
    <Sender>
      <Credential domain="${buyer.identities.sender}">
        <Identity>${buyer.identities.sender}</Identity>
        <SharedSecret>${buyer.sharedSecret}</SharedSecret>
      </Credential>
    </Sender>
  </Header>
  <Message>
    <PunchOutOrderMessage>
      <BuyerCookie>${escapeXml(session.userHint || '')}</BuyerCookie>
      <PunchOutOrderMessageHeader operationAllowed="create">
        <Total>
          <Money currency="${totals.currency}">${totals.total}</Money>
        </Total>
      </PunchOutOrderMessageHeader>
      ${itemsXml}
    </PunchOutOrderMessage>
  </Message>
</cXML>`;

  return poomXml;
}

/**
 * Apply field mapping based on buyer configuration
 */
function applyFieldMapping(buyer, fieldType, value) {
  if (!buyer.fieldMappings || !buyer.fieldMappings[fieldType]) {
    return value;
  }

  const mapping = buyer.fieldMappings[fieldType];
  return mapping[value] || value;
}

/**
 * Build extrinsic fields for additional item data
 */
function buildExtrinsics(buyer, item) {
  let extrinsics = '';
  
  // Add custom fields based on buyer configuration
  if (buyer.fieldMappings && buyer.fieldMappings.extrinsics) {
    Object.keys(buyer.fieldMappings.extrinsics).forEach(key => {
      const value = item[key];
      if (value) {
        extrinsics += `<Extrinsic name="${escapeXml(key)}">${escapeXml(value)}</Extrinsic>\n      `;
      }
    });
  }

  // Add standard extrinsics
  if (item.leadTime) {
    extrinsics += `<Extrinsic name="LeadTime">${escapeXml(item.leadTime)}</Extrinsic>\n      `;
  }
  
  if (item.vendor) {
    extrinsics += `<Extrinsic name="Vendor">${escapeXml(item.vendor)}</Extrinsic>\n      `;
  }

  return extrinsics;
}

/**
 * Send POOM to buyer's return URL
 */
async function sendPoomToBuyer(returnUrl, poomXml) {
  try {
    const response = await fetch(returnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
        'User-Agent': 'Wix-PunchOut-Connector/1.0'
      },
      body: poomXml,
      timeout: 30000 // 30 second timeout
    });

    return { 
      status: response.status, 
      method: 'server_post',
      statusText: response.statusText 
    };

  } catch (error) {
    console.error('Error sending POOM to buyer:', error);
    return { 
      status: 500, 
      method: 'server_post',
      error: error.message 
    };
  }
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
      protocol: protocol
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
    totalQuantity: totalQuantity
  };
}

/**
 * Escape XML special characters
 */
function escapeXml(str) {
  if (!str) return '';
  return str.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Log transaction for monitoring and debugging
 */
async function logTransaction(direction, protocol, buyerId, endpoint, httpStatus, payload, headers = {}) {
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
      headers: sanitizedHeaders
    });
  } catch (error) {
    console.error('Logging error:', error);
  }
}