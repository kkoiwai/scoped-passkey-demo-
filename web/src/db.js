import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../data');
const DB_FILE = path.join(DATA_DIR, 'store.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial Database Structure
const initialData = {
  users: {},
  passkeys: {},
  balances: {},
  transactions: [],
  challenges: {},
  oauthCodes: {},
  accessTokens: {}
};

// In-Memory Database Store
let db = { ...initialData };

// Load from JSON file if exists
function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      db = { ...initialData, ...JSON.parse(content) };
    } else {
      saveDb();
    }
  } catch (err) {
    console.warn('[DB] Failed to load store.json, using in-memory store:', err.message);
  }
}

// Save to JSON file
function saveDb() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[DB] Failed to save store.json:', err.message);
  }
}

// Initialize on startup
loadDb();

export const Database = {
  // Raw Data Access
  getRawData() {
    return db;
  },

  // User Management
  getUserById(userId) {
    return db.users[userId] || null;
  },

  getUserByUsername(username) {
    return Object.values(db.users).find(u => u.username.toLowerCase() === username.toLowerCase()) || null;
  },

  createUser(username, displayName) {
    const id = Buffer.from(username).toString('base64url');
    const user = {
      id,
      username,
      displayName: displayName || username.split('@')[0],
      createdAt: new Date().toISOString()
    };
    db.users[id] = user;

    // Initial Balance: 100,000 JPY
    db.balances[id] = 100000;

    // Initial Transaction Record
    db.transactions.push({
      id: `tx_${Date.now()}_init`,
      userId: id,
      type: 'deposit',
      amount: 100000,
      recipient: '-',
      description: '口座開設ボーナス (初期残高)',
      passkeyId: null,
      passkeyScope: 'full',
      timestamp: new Date().toISOString()
    });

    saveDb();
    return user;
  },

  // Passkey Management
  getPasskeyById(credentialId) {
    return db.passkeys[credentialId] || null;
  },

  getPasskeysByUserId(userId) {
    return Object.values(db.passkeys).filter(p => p.userId === userId);
  },

  savePasskey({
    id,
    userId,
    publicKey,
    counter = 0,
    deviceType = 'multiDevice',
    backedUp = true,
    transports = ['internal'],
    aaguid = '00000000-0000-0000-0000-000000000000',
    name = 'Passkey',
    scope = 'full',
    transferLimit = null
  }) {
    const passkey = {
      id,
      userId,
      publicKey: Buffer.isBuffer(publicKey) ? Buffer.from(publicKey).toString('base64url') : publicKey,
      counter,
      deviceType,
      backedUp,
      transports,
      aaguid,
      name,
      scope: scope || 'full', // 'full' | 'read_only' | 'limited_transfer'
      transferLimit: scope === 'limited_transfer' ? (parseInt(transferLimit, 10) || 5000) : null,
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString()
    };
    db.passkeys[id] = passkey;
    saveDb();
    return passkey;
  },

  updatePasskeyCounter(credentialId, newCounter) {
    if (db.passkeys[credentialId]) {
      db.passkeys[credentialId].counter = newCounter;
      db.passkeys[credentialId].lastUsedAt = new Date().toISOString();
      saveDb();
    }
  },

  deletePasskey(credentialId) {
    if (db.passkeys[credentialId]) {
      delete db.passkeys[credentialId];
      saveDb();
      return true;
    }
    return false;
  },

  // Balance & Transactions
  getBalance(userId) {
    return db.balances[userId] ?? 0;
  },

  getTransactions(userId) {
    return db.transactions
      .filter(t => t.userId === userId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  },

  transferMoney({
    userId,
    recipient,
    amount,
    description = '送金',
    passkeyId = null,
    passkeyScope = 'full'
  }) {
    const currentBalance = db.balances[userId] ?? 0;
    const transferAmount = parseInt(amount, 10);

    if (isNaN(transferAmount) || transferAmount <= 0) {
      throw new Error('送金金額が不正です。');
    }

    if (currentBalance < transferAmount) {
      throw new Error(`残高不足です（現在残高: ¥${currentBalance.toLocaleString()}）。`);
    }

    db.balances[userId] = currentBalance - transferAmount;

    const tx = {
      id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      userId,
      type: 'transfer',
      amount: transferAmount,
      recipient: recipient || '相手先口座',
      description,
      passkeyId,
      passkeyScope,
      timestamp: new Date().toISOString()
    };

    db.transactions.push(tx);
    saveDb();
    return { newBalance: db.balances[userId], transaction: tx };
  },

  // WebAuthn Challenges
  saveChallenge(key, challenge) {
    db.challenges[key] = {
      challenge,
      expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes
    };
  },

  getChallenge(key) {
    const entry = db.challenges[key];
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      delete db.challenges[key];
      return null;
    }
    return entry.challenge;
  },

  deleteChallenge(key) {
    delete db.challenges[key];
  },

  // OAuth 2.0 Auth Codes & Access Tokens
  saveOAuthCode({
    code,
    clientId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod = 'S256',
    userId,
    scope = 'full',
    transferLimit = null,
    passkeyName = 'Android Passkey'
  }) {
    db.oauthCodes[code] = {
      code,
      clientId,
      redirectUri,
      codeChallenge,
      codeChallengeMethod,
      userId,
      scope,
      transferLimit: scope === 'limited_transfer' ? (parseInt(transferLimit, 10) || 5000) : null,
      passkeyName,
      expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
    };
    saveDb();
  },

  getOAuthCode(code) {
    const entry = db.oauthCodes[code];
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      delete db.oauthCodes[code];
      saveDb();
      return null;
    }
    return entry;
  },

  consumeOAuthCode(code) {
    const entry = this.getOAuthCode(code);
    if (entry) {
      delete db.oauthCodes[code];
      saveDb();
    }
    return entry;
  },

  saveAccessToken({
    token,
    userId,
    scope = 'full',
    transferLimit = null,
    passkeyName = 'Android Passkey'
  }) {
    db.accessTokens[token] = {
      token,
      userId,
      scope,
      transferLimit: scope === 'limited_transfer' ? (parseInt(transferLimit, 10) || 5000) : null,
      passkeyName,
      expiresAt: Date.now() + 3600 * 1000 // 1 hour
    };
    saveDb();
  },

  getAccessToken(token) {
    const entry = db.accessTokens[token];
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      delete db.accessTokens[token];
      saveDb();
      return null;
    }
    return entry;
  }
};
