import { ok } from 'wix-http-functions';

/**
 * Health check endpoint
 */
export async function get_health(request) {
  return ok({
    body: JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      service: 'wix-punchout-connector',
    }),
    headers: { 'Content-Type': 'application/json' },
  });
}
