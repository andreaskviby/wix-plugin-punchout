import { ok, serverError } from 'wix-http-functions';
import wixData from 'wix-data';

/**
 * Export transaction logs to CSV
 */
export async function get_export_logs(request) {
  try {
    // Get date range from query parameters
    const url = new URL(request.url);
    const startDate = url.searchParams.get('startDate') || getDefaultStartDate();
    const endDate = url.searchParams.get('endDate') || new Date().toISOString();
    const protocol = url.searchParams.get('protocol'); // Optional filter
    
    // Query logs within date range
    let query = wixData.query('PunchoutLogs')
      .ge('timestamp', new Date(startDate))
      .le('timestamp', new Date(endDate))
      .descending('timestamp');
      
    if (protocol) {
      query = query.eq('protocol', protocol.toUpperCase());
    }
    
    const logs = await query.find();
    
    // Generate CSV content
    const csvContent = generateLogsCsv(logs.items);
    
    return ok({
      body: csvContent,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="punchout-logs-${formatDateForFilename(new Date())}.csv"`,
        'Cache-Control': 'no-cache'
      }
    });
    
  } catch (error) {
    console.error('Error exporting logs:', error);
    return serverError({
      body: JSON.stringify({ error: 'Failed to export logs' }),
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Export cart data to CSV
 */
export async function get_export_carts(request) {
  try {
    // Get date range from query parameters
    const url = new URL(request.url);
    const startDate = url.searchParams.get('startDate') || getDefaultStartDate();
    const endDate = url.searchParams.get('endDate') || new Date().toISOString();
    const buyerId = url.searchParams.get('buyerId'); // Optional filter
    
    // Query carts within date range
    let query = wixData.query('PunchoutCarts')
      .ge('postedAt', new Date(startDate))
      .le('postedAt', new Date(endDate))
      .descending('postedAt');
      
    if (buyerId) {
      query = query.eq('buyerId', buyerId);
    }
    
    const carts = await query.find();
    
    // Generate CSV content
    const csvContent = generateCartsCsv(carts.items);
    
    return ok({
      body: csvContent,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="punchout-carts-${formatDateForFilename(new Date())}.csv"`,
        'Cache-Control': 'no-cache'
      }
    });
    
  } catch (error) {
    console.error('Error exporting carts:', error);
    return serverError({
      body: JSON.stringify({ error: 'Failed to export carts' }),
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Export buyer analytics to CSV
 */
export async function get_export_analytics(request) {
  try {
    const url = new URL(request.url);
    const startDate = url.searchParams.get('startDate') || getDefaultStartDate();
    const endDate = url.searchParams.get('endDate') || new Date().toISOString();
    
    // Get buyers with their activity data
    const buyers = await wixData.query('PunchoutBuyers').find();
    
    // Get session and cart counts for each buyer
    const analyticsData = [];
    
    for (const buyer of buyers.items) {
      // Count sessions in date range
      const sessionCount = await wixData.query('PunchoutSessions')
        .eq('buyerId', buyer.buyerId)
        .ge('createdAt', new Date(startDate))
        .le('createdAt', new Date(endDate))
        .count();
        
      // Count carts in date range  
      const cartCount = await wixData.query('PunchoutCarts')
        .eq('buyerId', buyer.buyerId)
        .ge('postedAt', new Date(startDate))
        .le('postedAt', new Date(endDate))
        .count();
        
      // Calculate total cart value
      const carts = await wixData.query('PunchoutCarts')
        .eq('buyerId', buyer.buyerId)
        .ge('postedAt', new Date(startDate))
        .le('postedAt', new Date(endDate))
        .find();
        
      const totalValue = carts.items.reduce((sum, cart) => {
        return sum + parseFloat(cart.totals?.total || 0);
      }, 0);
      
      analyticsData.push({
        buyerId: buyer.buyerId,
        type: buyer.type,
        active: buyer.active,
        createdDate: buyer.createdDate,
        lastActivity: buyer.lastActivity,
        sessionCount: sessionCount.totalCount,
        cartCount: cartCount.totalCount,
        totalValue: totalValue.toFixed(2),
        conversionRate: sessionCount.totalCount > 0 ? 
          ((cartCount.totalCount / sessionCount.totalCount) * 100).toFixed(1) : '0.0'
      });
    }
    
    // Generate CSV content
    const csvContent = generateAnalyticsCsv(analyticsData);
    
    return ok({
      body: csvContent,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="punchout-analytics-${formatDateForFilename(new Date())}.csv"`,
        'Cache-Control': 'no-cache'
      }
    });
    
  } catch (error) {
    console.error('Error exporting analytics:', error);
    return serverError({
      body: JSON.stringify({ error: 'Failed to export analytics' }),
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Generate CSV content for transaction logs
 */
function generateLogsCsv(logs) {
  const headers = [
    'Timestamp',
    'Direction', 
    'Protocol',
    'Buyer ID',
    'Endpoint',
    'HTTP Status',
    'Session ID',
    'Error Message',
    'Payload Size'
  ];
  
  let csvContent = headers.join(',') + '\n';
  
  logs.forEach(log => {
    const row = [
      formatDateTime(log.timestamp),
      log.direction || '',
      log.protocol || '',
      log.buyerId || '',
      log.endpoint || '',
      log.httpStatus || '',
      log.sessionId || '', 
      escapeCsvField(log.errorMessage || ''),
      log.payload ? log.payload.length : 0
    ];
    
    csvContent += row.map(field => escapeCsvField(field.toString())).join(',') + '\n';
  });
  
  return csvContent;
}

/**
 * Generate CSV content for cart data
 */
function generateCartsCsv(carts) {
  const headers = [
    'Posted At',
    'Session ID',
    'Buyer ID',
    'Protocol',
    'Status',
    'Item Count',
    'Total Quantity',
    'Subtotal',
    'Total',
    'Currency',
    'Return URL'
  ];
  
  let csvContent = headers.join(',') + '\n';
  
  carts.forEach(cart => {
    const totals = cart.totals || {};
    const row = [
      formatDateTime(cart.postedAt),
      cart.sid || '',
      cart.buyerId || '',
      cart.protocol || '',
      cart.status || '',
      cart.lines ? cart.lines.length : 0,
      totals.totalQuantity || 0,
      totals.subtotal || '0.00',
      totals.total || '0.00',
      totals.currency || 'USD',
      escapeCsvField(cart.returnUrl || '')
    ];
    
    csvContent += row.map(field => escapeCsvField(field.toString())).join(',') + '\n';
  });
  
  return csvContent;
}

/**
 * Generate CSV content for analytics data
 */
function generateAnalyticsCsv(analyticsData) {
  const headers = [
    'Buyer ID',
    'Type',
    'Active',
    'Created Date',
    'Last Activity',
    'Session Count',
    'Cart Count', 
    'Total Value',
    'Conversion Rate %'
  ];
  
  let csvContent = headers.join(',') + '\n';
  
  analyticsData.forEach(data => {
    const row = [
      data.buyerId,
      data.type,
      data.active,
      formatDate(data.createdDate),
      data.lastActivity ? formatDate(data.lastActivity) : 'Never',
      data.sessionCount,
      data.cartCount,
      data.totalValue,
      data.conversionRate
    ];
    
    csvContent += row.map(field => escapeCsvField(field.toString())).join(',') + '\n';
  });
  
  return csvContent;
}

/**
 * Escape CSV fields that contain commas, quotes, or newlines
 */
function escapeCsvField(field) {
  if (field === null || field === undefined) {
    return '';
  }
  
  const fieldStr = field.toString();
  
  // If field contains comma, quote, or newline, wrap in quotes and escape quotes
  if (fieldStr.includes(',') || fieldStr.includes('"') || fieldStr.includes('\n')) {
    return '"' + fieldStr.replace(/"/g, '""') + '"';
  }
  
  return fieldStr;
}

/**
 * Format date for display
 */
function formatDate(date) {
  if (!date) return '';
  return new Date(date).toLocaleDateString();
}

/**
 * Format datetime for display  
 */
function formatDateTime(date) {
  if (!date) return '';
  return new Date(date).toLocaleString();
}

/**
 * Format date for filename (YYYY-MM-DD)
 */
function formatDateForFilename(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Get default start date (30 days ago)
 */
function getDefaultStartDate() {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return date.toISOString();
}