import { ok, badRequest } from 'wix-http-functions';
import wixData from 'wix-data';

/**
 * Validate PunchOut Session API endpoint
 */
export async function post_validateSession(request) {
  try {
    const { sessionId } = await request.json();
    
    if (!sessionId) {
      return badRequest({
        body: JSON.stringify({ error: 'Missing session ID' }),
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Query session
    const sessionQuery = await wixData.query('PunchoutSessions')
      .eq('sid', sessionId)
      .find();

    if (sessionQuery.items.length === 0) {
      return badRequest({
        body: JSON.stringify({ error: 'Session not found' }),
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const session = sessionQuery.items[0];

    // Check if session is expired
    if (new Date() > new Date(session.expiresAt)) {
      // Clean up expired session
      await wixData.remove('PunchoutSessions', session._id);
      
      return badRequest({
        body: JSON.stringify({ error: 'Session expired' }),
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Return session info (excluding sensitive data)
    return ok({
      body: JSON.stringify({
        sid: session.sid,
        buyerId: session.buyerId,
        userHint: session.userHint,
        pricingTier: session.pricingTier,
        expiresAt: session.expiresAt,
        createdAt: session.createdAt
      }),
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Session validation error:', error);
    return badRequest({
      body: JSON.stringify({ error: 'Session validation failed' }),
      headers: { 'Content-Type': 'application/json' }
    });
  }
}