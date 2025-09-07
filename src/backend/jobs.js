import wixData from 'wix-data';

/**
 * Scheduled jobs for PunchOut Connector maintenance
 */

/**
 * Clean up expired sessions (runs every hour)
 */
export async function cleanupExpiredSessions() {
  try {
    const now = new Date();

    // Find expired sessions
    const expiredSessions = await wixData.query('PunchoutSessions').le('expiresAt', now).find();

    console.log(`Found ${expiredSessions.items.length} expired sessions`);

    // Remove expired sessions
    for (const session of expiredSessions.items) {
      await wixData.remove('PunchoutSessions', session._id);
      console.log(`Removed expired session: ${session.sid}`);
    }

    return {
      success: true,
      removedSessions: expiredSessions.items.length,
    };
  } catch (error) {
    console.error('Error cleaning up expired sessions:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Archive old transaction logs (runs daily)
 */
export async function archiveOldLogs() {
  try {
    // Keep logs for 90 days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);

    // Find old logs
    const oldLogs = await wixData.query('PunchoutLogs').le('timestamp', cutoffDate).find();

    console.log(`Found ${oldLogs.items.length} old logs to archive`);

    // In a real implementation, you might move these to cold storage
    // For now, we'll just delete them
    for (const log of oldLogs.items) {
      await wixData.remove('PunchoutLogs', log._id);
    }

    return {
      success: true,
      archivedLogs: oldLogs.items.length,
    };
  } catch (error) {
    console.error('Error archiving old logs:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Generate daily analytics report (runs daily at midnight)
 */
export async function generateDailyAnalytics() {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date(yesterday);
    today.setDate(today.getDate() + 1);

    // Count sessions created yesterday
    const sessionCount = await wixData
      .query('PunchoutSessions')
      .ge('createdAt', yesterday)
      .lt('createdAt', today)
      .count();

    // Count carts posted yesterday
    const cartCount = await wixData
      .query('PunchoutCarts')
      .ge('postedAt', yesterday)
      .lt('postedAt', today)
      .count();

    // Count active buyers
    const activeBuyerCount = await wixData.query('PunchoutBuyers').eq('active', true).count();

    const analytics = {
      date: yesterday.toISOString().split('T')[0],
      sessions: sessionCount.totalCount,
      carts: cartCount.totalCount,
      activeBuyers: activeBuyerCount.totalCount,
      conversionRate:
        sessionCount.totalCount > 0
          ? ((cartCount.totalCount / sessionCount.totalCount) * 100).toFixed(2)
          : '0.00',
    };

    console.log('Daily analytics:', analytics);

    // In a real implementation, you might store this in a dedicated analytics collection
    // or send to an external analytics service

    return { success: true, analytics };
  } catch (error) {
    console.error('Error generating daily analytics:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Health check for monitoring (runs every 5 minutes)
 */
export async function healthCheck() {
  try {
    const checks = {
      database: false,
      collections: false,
      activeSessions: 0,
      activeBuyers: 0,
    };

    // Test database connectivity
    try {
      const testQuery = await wixData.query('PunchoutBuyers').limit(1).find();
      checks.database = true;
      checks.collections = true;
    } catch (error) {
      console.error('Database health check failed:', error);
    }

    // Count active sessions
    const now = new Date();
    const activeSessionCount = await wixData.query('PunchoutSessions').gt('expiresAt', now).count();
    checks.activeSessions = activeSessionCount.totalCount;

    // Count active buyers
    const activeBuyerCount = await wixData.query('PunchoutBuyers').eq('active', true).count();
    checks.activeBuyers = activeBuyerCount.totalCount;

    return { success: true, checks, timestamp: new Date() };
  } catch (error) {
    console.error('Health check failed:', error);
    return { success: false, error: error.message, timestamp: new Date() };
  }
}
