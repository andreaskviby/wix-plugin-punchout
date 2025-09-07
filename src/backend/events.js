import wixData from 'wix-data';

/**
 * Backend event handlers for PunchOut Connector
 */

/**
 * Handle buyer creation events
 */
export function PunchoutBuyers_afterInsert(item, context) {
  console.log('New buyer created:', item.buyerId);

  // Could trigger notification to admin
  // Could set up default configurations
  // Could validate buyer setup
}

/**
 * Handle session expiration cleanup
 */
export function PunchoutSessions_afterUpdate(item, context) {
  // Check if session has expired and clean up if needed
  if (new Date() > new Date(item.expiresAt)) {
    console.log('Session expired:', item.sid);
    // Additional cleanup logic could go here
  }
}

/**
 * Handle cart posting events for analytics
 */
export function PunchoutCarts_afterInsert(item, context) {
  console.log('Cart posted for buyer:', item.buyerId);

  // Update buyer last activity
  updateBuyerLastActivity(item.buyerId);

  // Could trigger analytics updates
  // Could send notifications
}

/**
 * Update buyer's last activity timestamp
 */
async function updateBuyerLastActivity(buyerId) {
  try {
    const buyerQuery = await wixData.query('PunchoutBuyers').eq('buyerId', buyerId).find();

    if (buyerQuery.items.length > 0) {
      const buyer = buyerQuery.items[0];
      await wixData.update('PunchoutBuyers', buyer._id, {
        lastActivity: new Date(),
      });
    }
  } catch (error) {
    console.error('Error updating buyer last activity:', error);
  }
}
