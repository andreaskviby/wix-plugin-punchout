import { fetch } from 'wix-fetch';
import wixData from 'wix-data';
import { cart } from 'wix-ecom';

$w.onReady(function () {
  // Check if this is a PunchOut session
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('sid');

  if (sessionId) {
    initializePunchOutSession(sessionId);
  }
});

/**
 * Initialize PunchOut session
 */
async function initializePunchOutSession(sessionId) {
  try {
    // Validate session
    const session = await validatePunchOutSession(sessionId);
    if (!session) {
      showError('Invalid or expired PunchOut session');
      return;
    }

    // Store session info globally
    $w('#hiddenSessionId').value = sessionId;

    // Get buyer info
    const buyer = await getBuyerInfo(session.buyerId);
    if (!buyer) {
      showError('Buyer configuration not found');
      return;
    }

    // Apply buyer-specific catalog filtering and pricing
    await applyCatalogScope(buyer);
    await applyPricing(buyer, session);

    // Update UI for PunchOut mode
    showPunchOutInterface(buyer);

    // Hide standard checkout and show PunchOut return button
    hideStandardCheckout();
    showReturnToProcurementButton(buyer);

    // Set up cart monitoring
    setupCartMonitoring(sessionId);

    console.log('PunchOut session initialized successfully');
  } catch (error) {
    console.error('Error initializing PunchOut session:', error);
    showError('Failed to initialize PunchOut session');
  }
}

/**
 * Validate PunchOut session
 */
async function validatePunchOutSession(sessionId) {
  try {
    const response = await fetch('/api/punchout/validate-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });

    if (response.ok) {
      return await response.json();
    }
    return null;
  } catch (error) {
    console.error('Session validation error:', error);
    return null;
  }
}

/**
 * Get buyer information
 */
async function getBuyerInfo(buyerId) {
  try {
    const buyerQuery = await wixData.query('PunchoutBuyers').eq('buyerId', buyerId).find();

    return buyerQuery.items[0];
  } catch (error) {
    console.error('Error getting buyer info:', error);
    return null;
  }
}

/**
 * Apply catalog scope based on buyer configuration
 */
async function applyCatalogScope(buyer) {
  if (!buyer.catalogScope || Object.keys(buyer.catalogScope).length === 0) {
    return; // No filtering needed
  }

  try {
    // Filter products based on buyer's catalog scope
    const catalogScope = buyer.catalogScope;

    if (catalogScope.allowedCollections) {
      // Show only specific collections
      $w('#productGallery').setFilter(
        wixData.filter().hasSome('collections', catalogScope.allowedCollections)
      );
    }

    if (catalogScope.allowedTags) {
      // Show only products with specific tags
      $w('#productGallery').setFilter(wixData.filter().hasSome('ribbon', catalogScope.allowedTags));
    }

    if (catalogScope.excludedProducts) {
      // Hide specific products
      $w('#productGallery').setFilter(
        wixData.filter().not(wixData.filter().hasSome('_id', catalogScope.excludedProducts))
      );
    }
  } catch (error) {
    console.error('Error applying catalog scope:', error);
  }
}

/**
 * Apply buyer-specific pricing
 */
async function applyPricing(buyer, session) {
  try {
    if (buyer.priceListId) {
      // Apply price list if configured
      // This would integrate with Wix eCommerce pricing APIs
      console.log(`Applying price list: ${buyer.priceListId}`);
    }

    // Show pricing tier indicator
    if (session.pricingTier) {
      $w('#pricingTierIndicator').text = `Pricing: ${session.pricingTier}`;
      $w('#pricingTierIndicator').show();
    }
  } catch (error) {
    console.error('Error applying pricing:', error);
  }
}

/**
 * Show PunchOut-specific interface elements
 */
function showPunchOutInterface(buyer) {
  // Show PunchOut banner
  $w('#punchoutBanner').show();
  $w('#buyerName').text = buyer.buyerId;

  // Show session info
  $w('#sessionInfo').show();
  $w('#sessionProtocol').text = buyer.type;

  // Add PunchOut-specific styling
  $w('#page').addClass('punchout-mode');
}

/**
 * Hide standard e-commerce checkout elements
 */
function hideStandardCheckout() {
  // Hide standard checkout button
  if ($w('#checkoutButton')) {
    $w('#checkoutButton').hide();
  }

  // Hide cart widget if present
  if ($w('#cartWidget')) {
    $w('#cartWidget').hide();
  }

  // Hide payment-related elements
  if ($w('#paymentSection')) {
    $w('#paymentSection').hide();
  }
}

/**
 * Show Return to Procurement button
 */
function showReturnToProcurementButton(buyer) {
  const returnButton = $w('#returnToProcurementButton');
  returnButton.show();

  // Update button text based on buyer type
  const buyerName = buyer.identities?.from || buyer.buyerId;
  returnButton.label = `Return to ${buyerName}`;

  // Set up click handler
  returnButton.onClick(() => {
    returnToProcurement();
  });
}

/**
 * Set up cart monitoring to update return button
 */
function setupCartMonitoring(sessionId) {
  // Monitor cart changes
  cart.onChange(cart => {
    const itemCount = cart.lineItems.length;
    const returnButton = $w('#returnToProcurementButton');

    if (itemCount > 0) {
      returnButton.label = `Return ${itemCount} items to Procurement`;
      returnButton.enable();
    } else {
      returnButton.label = 'Return to Procurement';
      returnButton.disable();
    }
  });
}

/**
 * Handle return to procurement
 */
async function returnToProcurement() {
  try {
    $w('#returnToProcurementButton').disable();
    $w('#loadingIndicator').show();

    // Get current cart
    const currentCart = await cart.getCurrentCart();
    if (!currentCart || currentCart.lineItems.length === 0) {
      showError('Cart is empty');
      return;
    }

    // Convert cart to PunchOut format
    const cartData = convertCartToPunchOut(currentCart);

    // Get session info
    const sessionId = $w('#hiddenSessionId').value;
    const session = await validatePunchOutSession(sessionId);

    if (!session) {
      showError('Session has expired');
      return;
    }

    // Determine return method based on buyer type
    const buyer = await getBuyerInfo(session.buyerId);
    let returnResponse;

    if (buyer.type === 'cXML') {
      returnResponse = await sendCxmlReturn(sessionId, cartData);
    } else if (buyer.type === 'OCI') {
      returnResponse = await sendOciReturn(sessionId, cartData);
    } else {
      throw new Error('Unknown buyer type');
    }

    if (returnResponse.success) {
      showReturnSuccess(returnResponse, buyer);

      // Clear cart
      await cart.removeAllItems();

      // Redirect or close window after delay
      setTimeout(() => {
        if (returnResponse.method === 'browser_post') {
          submitPoomForm(returnResponse.poom, buyer.returnUrlRules.url);
        } else {
          window.close();
        }
      }, 3000);
    } else {
      showError(`Return failed: ${returnResponse.error}`);
    }
  } catch (error) {
    console.error('Return to procurement error:', error);
    showError('Failed to return to procurement system');
  } finally {
    $w('#loadingIndicator').hide();
    $w('#returnToProcurementButton').enable();
  }
}

/**
 * Convert Wix cart to PunchOut format
 */
function convertCartToPunchOut(cart) {
  return cart.lineItems.map(item => ({
    sku: item.catalogReference?.catalogItemId || item.productName?.original,
    name: item.productName?.original || '',
    quantity: item.quantity,
    price: item.price?.amount || 0,
    currency: item.price?.currency || 'USD',
    uom: 'EA', // Default unit of measure
    category: item.productName?.category || '',
    vendor: item.productName?.brand || '',
    manufacturerPartId: item.catalogReference?.options?.customTextFields?.manufacturerPartId || '',
    manufacturer: item.catalogReference?.options?.customTextFields?.manufacturer || '',
    leadTime: item.catalogReference?.options?.customTextFields?.leadTime || '0',
  }));
}

/**
 * Send cXML return (POOM)
 */
async function sendCxmlReturn(sessionId, cartData) {
  const response = await fetch('/api/punchout/cxml/return', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      sessionId,
      cartData: JSON.stringify(cartData),
    }),
  });

  return await response.json();
}

/**
 * Send OCI return
 */
async function sendOciReturn(sessionId, cartData) {
  const response = await fetch('/api/punchout/oci/return', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      sessionId,
      cartData: JSON.stringify(cartData),
    }),
  });

  return await response.json();
}

/**
 * Submit POOM form for browser POST method
 */
function submitPoomForm(poomXml, returnUrl) {
  // Create hidden form for POOM submission
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = returnUrl;

  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = 'cxml-document';
  input.value = poomXml;

  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();
}

/**
 * Show return success message
 */
function showReturnSuccess(response, buyer) {
  $w('#successMessage').show();
  $w('#successText').text = `Successfully returned ${response.itemCount} items to ${buyer.buyerId}`;

  if (response.method === 'browser_post') {
    $w('#successDetails').text = 'You will be redirected back to your procurement system...';
  } else {
    $w('#successDetails').text =
      'Items have been sent to your procurement system. You may close this window.';
  }
}

/**
 * Show error message
 */
function showError(message) {
  $w('#errorMessage').show();
  $w('#errorText').text = message;

  // Hide error after 5 seconds
  setTimeout(() => {
    $w('#errorMessage').hide();
  }, 5000);
}
