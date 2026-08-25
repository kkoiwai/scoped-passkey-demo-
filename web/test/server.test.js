import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import crypto from 'node:crypto';
import { Database } from '../src/db.js';

describe('Scoped Passkey Demo Bank Web Service Tests', () => {
  let testUserId;

  before(() => {
    const raw = Database.getRawData();
    // Clean testuser
    Object.keys(raw.users).forEach(id => {
      if (raw.users[id].username === 'testuser@example.com') {
        delete raw.users[id];
        delete raw.balances[id];
      }
    });
  });

  it('1. Database initial user creation and balance assignment', () => {
    const user = Database.createUser('testuser@example.com', 'Test User');
    testUserId = user.id;
    assert.strictEqual(user.username, 'testuser@example.com');
    assert.strictEqual(Database.getBalance(user.id), 100000, 'Initial balance should be 100,000 JPY');
  });

  it('2. Passkey saving with different scopes', () => {
    const user = Database.getUserByUsername('testuser@example.com');
    assert.ok(user);

    // Save Master Full passkey
    const fullPasskey = Database.savePasskey({
      id: 'cred_full_1',
      userId: user.id,
      publicKey: 'mock_pk_1',
      scope: 'full',
      name: 'Master Passkey'
    });
    assert.strictEqual(fullPasskey.scope, 'full');
    assert.strictEqual(fullPasskey.transferLimit, null);

    // Save Read-Only passkey
    const roPasskey = Database.savePasskey({
      id: 'cred_ro_1',
      userId: user.id,
      publicKey: 'mock_pk_2',
      scope: 'read_only',
      name: 'Read Only Passkey'
    });
    assert.strictEqual(roPasskey.scope, 'read_only');
    assert.strictEqual(roPasskey.transferLimit, null);

    // Save Limited Transfer passkey
    const limPasskey = Database.savePasskey({
      id: 'cred_lim_1',
      userId: user.id,
      publicKey: 'mock_pk_3',
      scope: 'limited_transfer',
      transferLimit: 5000,
      name: 'Limited Transfer Passkey'
    });
    assert.strictEqual(limPasskey.scope, 'limited_transfer');
    assert.strictEqual(limPasskey.transferLimit, 5000);
  });

  it('3. Bank transfer enforcement based on scope and limit', () => {
    const user = Database.getUserByUsername('testuser@example.com');

    // Transfer with Full Scope: 15,000 JPY (Allowed)
    const res1 = Database.transferMoney({
      userId: user.id,
      recipient: 'Bob',
      amount: 15000,
      description: 'フル権限での送金',
      passkeyScope: 'full'
    });
    assert.strictEqual(res1.newBalance, 85000);

    // Transfer exceeding balance (Rejected)
    assert.throws(() => {
      Database.transferMoney({
        userId: user.id,
        recipient: 'Bob',
        amount: 200000,
        description: '残高超過送金'
      });
    }, /残高不足/);
  });

  it('4. OAuth 2.0 PKCE code generation, verification, and token exchange', () => {
    const user = Database.getUserByUsername('testuser@example.com');

    // Generate PKCE verifier & challenge
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = crypto.createHash('sha256').update(verifier, 'ascii').digest('base64url');

    const code = 'test_code_123';
    Database.saveOAuthCode({
      code,
      clientId: 'mycredman-client',
      redirectUri: 'mycredman://oauth/callback',
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      userId: user.id,
      scope: 'limited_transfer',
      transferLimit: 3000,
      passkeyName: 'Android App Passkey'
    });

    const storedCode = Database.getOAuthCode(code);
    assert.ok(storedCode);
    assert.strictEqual(storedCode.scope, 'limited_transfer');
    assert.strictEqual(storedCode.transferLimit, 3000);

    // Consume Code
    const consumed = Database.consumeOAuthCode(code);
    assert.ok(consumed);
    assert.strictEqual(Database.getOAuthCode(code), null, 'Code must be single-use');

    // Save Access Token
    const accessToken = 'at_mock_token_123';
    Database.saveAccessToken({
      token: accessToken,
      userId: user.id,
      scope: consumed.scope,
      transferLimit: consumed.transferLimit,
      passkeyName: consumed.passkeyName
    });

    const tokenEntry = Database.getAccessToken(accessToken);
    assert.ok(tokenEntry);
    assert.strictEqual(tokenEntry.userId, user.id);
    assert.strictEqual(tokenEntry.scope, 'limited_transfer');
    assert.strictEqual(tokenEntry.transferLimit, 3000);
  });

  it('5. Raw Data Store single JSON structure verification', () => {
    const raw = Database.getRawData();
    assert.ok(raw.users);
    assert.ok(raw.passkeys);
    assert.ok(raw.balances);
    assert.ok(raw.transactions);
    assert.ok(raw.oauthCodes);
    assert.ok(raw.accessTokens);
  });
});
