import dotenv from 'dotenv';
dotenv.config();

export const Config = {
  // Bank Service Endpoints
  BANK_BASE_URL: process.env.BANK_BASE_URL || 'https://sp.exarnp1e.com',
  RP_ID: process.env.RP_ID || 'sp.exarnp1e.com',
  RP_ORIGIN: process.env.RP_ORIGIN || 'https://sp.exarnp1e.com',

  // OAuth 2.0 Client Settings
  CLIENT_ID: process.env.CLIENT_ID || 'mycredman-client',
  REDIRECT_URI: process.env.REDIRECT_URI || 'http://localhost:3000/oauth/callback',

  // Storage Settings
  DYNAMODB_TABLE: process.env.DYNAMODB_TABLE || 'ScopedPasskeyVault',
  USE_LOCAL_STORAGE: process.env.USE_LOCAL_STORAGE !== 'false',
  LOCAL_STORAGE_PATH: process.env.LOCAL_STORAGE_PATH || './data/passkey-vault.json',

  // Browser Automation Settings
  HEADLESS: process.env.HEADLESS !== 'false',
  BROWSER_TIMEOUT_MS: parseInt(process.env.BROWSER_TIMEOUT_MS || '30000', 10),

  // AWS Region
  AWS_REGION: process.env.AWS_REGION || 'asia-northeast1'
};
