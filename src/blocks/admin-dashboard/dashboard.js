import wixData from 'wix-data';
import { fetch } from 'wix-fetch';

$w.onReady(function () {
  initializeDashboard();
  setupEventHandlers();
});

/**
 * Initialize the admin dashboard
 */
async function initializeDashboard() {
  try {
    await loadBuyerConnections();
    await loadActiveSessions();
    await loadRecentLogs();
    await loadAnalytics();

    console.log('Dashboard initialized successfully');
  } catch (error) {
    console.error('Dashboard initialization error:', error);
    showError('Failed to load dashboard data');
  }
}

/**
 * Set up event handlers
 */
function setupEventHandlers() {
  // Add buyer button
  $w('#addBuyerButton').onClick(() => openAddBuyerModal());

  // Refresh buttons
  $w('#refreshConnectionsButton').onClick(() => loadBuyerConnections());
  $w('#refreshSessionsButton').onClick(() => loadActiveSessions());
  $w('#refreshLogsButton').onClick(() => loadRecentLogs());

  // Export buttons
  $w('#exportLogsButton').onClick(() => exportLogs());
  $w('#exportCartsButton').onClick(() => exportCarts());

  // Test buttons in buyer table
  $w('#buyerConnectionsTable').onRowSelect(event => {
    const buyerId = event.rowData.buyerId;
    $w('#testBuyerButton').show();
    $w('#testBuyerButton').onClick(() => testBuyerConnection(buyerId));
  });

  // Filter controls
  $w('#logProtocolFilter').onChange(() => filterLogs());
  $w('#logDateFilter').onChange(() => filterLogs());
  $w('#sessionBuyerFilter').onChange(() => filterSessions());
}

/**
 * Load buyer connections
 */
async function loadBuyerConnections() {
  try {
    $w('#connectionsLoader').show();

    const buyerQuery = await wixData
      .query('PunchoutBuyers')
      .include('lastActivity')
      .descending('lastActivity')
      .find();

    const tableData = buyerQuery.items.map(buyer => ({
      _id: buyer._id,
      buyerId: buyer.buyerId,
      type: buyer.type,
      status: buyer.active ? 'Active' : 'Inactive',
      lastActivity: buyer.lastActivity ? formatDate(buyer.lastActivity) : 'Never',
      actions: createActionButtons(buyer),
    }));

    $w('#buyerConnectionsTable').rows = tableData;
    $w('#totalBuyersText').text = `Total Buyers: ${tableData.length}`;
  } catch (error) {
    console.error('Error loading buyer connections:', error);
    showError('Failed to load buyer connections');
  } finally {
    $w('#connectionsLoader').hide();
  }
}

/**
 * Load active sessions
 */
async function loadActiveSessions() {
  try {
    $w('#sessionsLoader').show();

    const now = new Date();
    const sessionQuery = await wixData
      .query('PunchoutSessions')
      .gt('expiresAt', now)
      .include('createdAt')
      .descending('createdAt')
      .find();

    const tableData = sessionQuery.items.map(session => ({
      _id: session._id,
      sessionId: session.sid.substring(0, 8) + '...',
      buyerId: session.buyerId,
      userHint: session.userHint || 'N/A',
      createdAt: formatDateTime(session.createdAt),
      expiresAt: formatDateTime(session.expiresAt),
      timeRemaining: getTimeRemaining(session.expiresAt),
    }));

    $w('#activeSessionsTable').rows = tableData;
    $w('#activeSessionsCount').text = `Active Sessions: ${tableData.length}`;
  } catch (error) {
    console.error('Error loading active sessions:', error);
    showError('Failed to load active sessions');
  } finally {
    $w('#sessionsLoader').hide();
  }
}

/**
 * Load recent transaction logs
 */
async function loadRecentLogs() {
  try {
    $w('#logsLoader').show();

    const logQuery = await wixData
      .query('PunchoutLogs')
      .include('timestamp')
      .descending('timestamp')
      .limit(50)
      .find();

    const tableData = logQuery.items.map(log => ({
      _id: log._id,
      timestamp: formatDateTime(log.timestamp),
      direction: log.direction.toUpperCase(),
      protocol: log.protocol.toUpperCase(),
      buyerId: log.buyerId || 'N/A',
      endpoint: log.endpoint,
      status: log.httpStatus,
      statusIcon: getStatusIcon(log.httpStatus),
    }));

    $w('#transactionLogsTable').rows = tableData;
  } catch (error) {
    console.error('Error loading transaction logs:', error);
    showError('Failed to load transaction logs');
  } finally {
    $w('#logsLoader').hide();
  }
}

/**
 * Load analytics data
 */
async function loadAnalytics() {
  try {
    // Get sessions in last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const sessionQuery = await wixData
      .query('PunchoutSessions')
      .gt('createdAt', thirtyDaysAgo)
      .find();

    const cartQuery = await wixData.query('PunchoutCarts').gt('postedAt', thirtyDaysAgo).find();

    // Calculate metrics
    const totalSessions = sessionQuery.items.length;
    const totalCarts = cartQuery.items.length;
    const conversionRate =
      totalSessions > 0 ? ((totalCarts / totalSessions) * 100).toFixed(1) : '0.0';

    // Calculate total value
    const totalValue = cartQuery.items.reduce((sum, cart) => {
      return sum + parseFloat(cart.totals?.total || 0);
    }, 0);

    // Update analytics widgets
    $w('#totalSessionsMetric').text = totalSessions.toString();
    $w('#totalCartsMetric').text = totalCarts.toString();
    $w('#conversionRateMetric').text = `${conversionRate}%`;
    $w('#totalValueMetric').text = `$${totalValue.toFixed(2)}`;

    // Protocol breakdown
    const protocolCounts = {};
    sessionQuery.items.forEach(session => {
      const buyerQuery = wixData.query('PunchoutBuyers').eq('buyerId', session.buyerId).find();
      // Note: This would need to be optimized for production
    });
  } catch (error) {
    console.error('Error loading analytics:', error);
    showError('Failed to load analytics');
  }
}

/**
 * Open add buyer modal
 */
function openAddBuyerModal() {
  // Clear form
  $w('#buyerIdInput').value = '';
  $w('#buyerTypeDropdown').value = 'cXML';
  $w('#fromIdentityInput').value = '';
  $w('#toIdentityInput').value = '';
  $w('#senderIdentityInput').value = '';
  $w('#sharedSecretInput').value = '';
  $w('#priceListInput').value = '';

  // Show modal
  $w('#addBuyerModal').show();

  // Set up form handlers
  $w('#saveBuyerButton').onClick(() => saveBuyer());
  $w('#cancelBuyerButton').onClick(() => $w('#addBuyerModal').hide());
}

/**
 * Save new buyer
 */
async function saveBuyer() {
  try {
    $w('#saveBuyerButton').disable();

    // Validate form
    const buyerId = $w('#buyerIdInput').value;
    const type = $w('#buyerTypeDropdown').value;

    if (!buyerId || !type) {
      showError('Buyer ID and Type are required');
      return;
    }

    // Check if buyer already exists
    const existingBuyer = await wixData.query('PunchoutBuyers').eq('buyerId', buyerId).find();

    if (existingBuyer.items.length > 0) {
      showError('Buyer ID already exists');
      return;
    }

    // Build buyer data
    const buyerData = {
      buyerId: buyerId,
      type: type,
      active: true,
      createdDate: new Date(),
      catalogScope: {},
      fieldMappings: {},
    };

    if (type === 'cXML') {
      buyerData.identities = {
        from: $w('#fromIdentityInput').value,
        to: $w('#toIdentityInput').value,
        sender: $w('#senderIdentityInput').value,
      };
      buyerData.sharedSecret = $w('#sharedSecretInput').value;
    }

    if ($w('#priceListInput').value) {
      buyerData.priceListId = $w('#priceListInput').value;
    }

    // Save buyer
    await wixData.insert('PunchoutBuyers', buyerData);

    // Refresh table and close modal
    await loadBuyerConnections();
    $w('#addBuyerModal').hide();

    showSuccess('Buyer added successfully');
  } catch (error) {
    console.error('Error saving buyer:', error);
    showError('Failed to save buyer');
  } finally {
    $w('#saveBuyerButton').enable();
  }
}

/**
 * Test buyer connection
 */
async function testBuyerConnection(buyerId) {
  try {
    $w('#testBuyerButton').disable();

    const response = await fetch('/api/punchout/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buyerId }),
    });

    const result = await response.json();

    if (result.success) {
      showSuccess(`Connection test successful: ${result.message}`);
    } else {
      showError(`Connection test failed: ${result.error}`);
    }
  } catch (error) {
    console.error('Error testing connection:', error);
    showError('Connection test failed');
  } finally {
    $w('#testBuyerButton').enable();
  }
}

/**
 * Export logs to CSV
 */
async function exportLogs() {
  try {
    $w('#exportLogsButton').disable();

    const response = await fetch('/api/punchout/export/logs', {
      method: 'GET',
    });

    if (response.ok) {
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `punchout-logs-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();

      showSuccess('Logs exported successfully');
    } else {
      throw new Error('Export failed');
    }
  } catch (error) {
    console.error('Error exporting logs:', error);
    showError('Failed to export logs');
  } finally {
    $w('#exportLogsButton').enable();
  }
}

/**
 * Export carts to CSV
 */
async function exportCarts() {
  try {
    $w('#exportCartsButton').disable();

    const response = await fetch('/api/punchout/export/carts', {
      method: 'GET',
    });

    if (response.ok) {
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `punchout-carts-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();

      showSuccess('Carts exported successfully');
    } else {
      throw new Error('Export failed');
    }
  } catch (error) {
    console.error('Error exporting carts:', error);
    showError('Failed to export carts');
  } finally {
    $w('#exportCartsButton').enable();
  }
}

/**
 * Utility functions
 */
function formatDate(date) {
  return new Date(date).toLocaleDateString();
}

function formatDateTime(date) {
  return new Date(date).toLocaleString();
}

function getTimeRemaining(expiresAt) {
  const now = new Date();
  const expires = new Date(expiresAt);
  const diff = expires - now;

  if (diff <= 0) return 'Expired';

  const minutes = Math.floor(diff / (1000 * 60));
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function getStatusIcon(status) {
  if (status >= 200 && status < 300) return '✅';
  if (status >= 400 && status < 500) return '⚠️';
  if (status >= 500) return '❌';
  return '❔';
}

function createActionButtons(buyer) {
  return `
    <button data-buyer-id="${buyer._id}" class="edit-buyer-btn">Edit</button>
    <button data-buyer-id="${buyer._id}" class="test-buyer-btn">Test</button>
    <button data-buyer-id="${buyer._id}" class="delete-buyer-btn">Delete</button>
  `;
}

function showSuccess(message) {
  $w('#successMessage').text = message;
  $w('#successMessage').show();
  setTimeout(() => $w('#successMessage').hide(), 3000);
}

function showError(message) {
  $w('#errorMessage').text = message;
  $w('#errorMessage').show();
  setTimeout(() => $w('#errorMessage').hide(), 5000);
}

function filterLogs() {
  // Implementation for filtering logs based on selected criteria
  loadRecentLogs();
}

function filterSessions() {
  // Implementation for filtering sessions based on selected criteria
  loadActiveSessions();
}
