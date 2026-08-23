import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  rpName: process.env.RP_NAME || 'Scoped Passkey Bank',
  defaultRpId: process.env.RP_ID || 'sp.exarnp1e.com',
  defaultOrigin: process.env.ORIGIN || 'https://sp.exarnp1e.com',
  sessionSecret: process.env.SESSION_SECRET || 'scoped-passkey-demo-secret-key-2026',

  /**
   * Helper to dynamically determine RP_ID and expected Origin based on request,
   * allowing seamless testing on localhost:8080 as well as production on sp.exarnp1e.com.
   */
  getRpIdAndOrigin(req) {
    const hostHeader = req.get('x-forwarded-host') || req.get('host') || '';
    const host = hostHeader.split(':')[0]; // Remove port if any
    const proto = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
    
    // If running on localhost or 127.0.0.1
    if (host === 'localhost' || host === '127.0.0.1') {
      const port = hostHeader.includes(':') ? `:${hostHeader.split(':')[1]}` : (config.port === 80 ? '' : `:${config.port}`);
      return {
        rpId: host,
        rpName: config.rpName,
        origin: `${proto}://${host}${port}`
      };
    }

    // Default to configured RP_ID (e.g. sp.exarnp1e.com) or the actual host domain
    const rpId = process.env.RP_ID || host || config.defaultRpId;
    const origin = process.env.ORIGIN || `${proto}://${hostHeader}`;

    return {
      rpId,
      rpName: config.rpName,
      origin
    };
  }
};
