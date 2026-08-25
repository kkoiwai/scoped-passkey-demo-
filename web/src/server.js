import express from 'express';
import cookieSession from 'cookie-session';
import cors from 'cors';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from '@simplewebauthn/server';

import { config } from './config.js';
import { Database } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middlewares
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  cookieSession({
    name: 'scoped_passkey_session',
    keys: [config.sessionSecret],
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax',
    secure: false // Set to true behind HTTPS in production
  })
);

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// -------------------------------------------------------------
// Helper: PKCE Verification (RFC 7636 S256)
// -------------------------------------------------------------
function verifyPkceChallenge(codeVerifier, codeChallenge) {
  const hash = crypto.createHash('sha256').update(codeVerifier, 'ascii').digest('base64url');
  return hash === codeChallenge;
}

// -------------------------------------------------------------
// 1. WebAuthn Authentication Routes
// -------------------------------------------------------------

// Generate Registration Options (New User Signup - Initial Full Passkey)
app.post('/api/auth/register-options', async (req, res) => {
  try {
    const { username, displayName } = req.body;
    if (!username) {
      return res.status(400).json({ error: 'ユーザー名は必須です。' });
    }

    const { rpId, rpName } = config.getRpIdAndOrigin(req);
    const newUserId = `usr_${crypto.randomBytes(12).toString('hex')}`;

    const options = await generateRegistrationOptions({
      rpName,
      rpID: rpId,
      userID: Buffer.from(newUserId, 'utf-8'),
      userName: username,
      userDisplayName: displayName || username.split('@')[0],
      attestationType: 'none',
      excludeCredentials: [],
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'preferred'
      }
    });

    req.session.currentChallenge = options.challenge;
    req.session.pendingUserId = newUserId;
    req.session.pendingUsername = username;
    req.session.pendingDisplayName = displayName || username.split('@')[0];

    res.json(options);
  } catch (err) {
    console.error('[Auth] Register options error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Verify Registration Response (Signup)
app.post('/api/auth/register-verify', async (req, res) => {
  try {
    const { credential, passkeyName } = req.body;
    const challenge = req.session.currentChallenge;
    const username = req.session.pendingUsername;
    const displayName = req.session.pendingDisplayName;
    const pendingUserId = req.session.pendingUserId;

    if (!challenge || !username) {
      return res.status(400).json({ error: 'セッションが切断されました。もう一度お試しください。' });
    }

    const { rpId, origin } = config.getRpIdAndOrigin(req);

    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpId,
      requireUserVerification: false
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'パスキーの登録検証に失敗しました。' });
    }

    const regInfo = verification.registrationInfo;
    const credentialID = regInfo.credentialID || regInfo.credential?.id;
    const credentialPublicKey = regInfo.credentialPublicKey || regInfo.credential?.publicKey;
    const counter = regInfo.counter ?? regInfo.credential?.counter ?? 0;
    const { credentialDeviceType, credentialBackedUp, aaguid } = regInfo;

    // Create a new unique user instance
    const user = Database.createUser(username, displayName, pendingUserId);

    // Save initial passkey with FULL scope
    const passkey = Database.savePasskey({
      id: credentialID,
      userId: user.id,
      publicKey: Buffer.from(credentialPublicKey).toString('base64url'),
      counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: credential.response.transports || ['internal'],
      aaguid: aaguid || '00000000-0000-0000-0000-000000000000',
      name: passkeyName || 'マスターパスキー (登録時作成)',
      scope: 'full',
      transferLimit: null
    });

    // Clear temp session values and set active login
    req.session.currentChallenge = null;
    req.session.pendingUserId = null;
    req.session.pendingUsername = null;
    req.session.pendingDisplayName = null;
    req.session.userId = user.id;
    req.session.activePasskeyId = passkey.id;
    req.session.activeScope = passkey.scope;
    req.session.transferLimit = passkey.transferLimit;

    res.json({
      success: true,
      user,
      passkey,
      balance: Database.getBalance(user.id)
    });
  } catch (err) {
    console.error('[Auth] Register verify error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Generate Login Options (Authentication)
app.post('/api/auth/login-options', async (req, res) => {
  try {
    const { rpId } = config.getRpIdAndOrigin(req);

    const options = await generateAuthenticationOptions({
      rpID: rpId,
      userVerification: 'preferred',
      allowCredentials: [] // Allow resident/discoverable credentials
    });

    req.session.currentChallenge = options.challenge;
    res.json(options);
  } catch (err) {
    console.error('[Auth] Login options error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Verify Login Response
app.post('/api/auth/login-verify', async (req, res) => {
  try {
    const { credential } = req.body;
    const challenge = req.session.currentChallenge;

    if (!challenge) {
      return res.status(400).json({ error: '認証チャレンジが見つかりません。' });
    }

    const { rpId, origin } = config.getRpIdAndOrigin(req);
    const passkey = Database.getPasskeyById(credential.id);

    if (!passkey) {
      return res.status(404).json({ error: 'このパスキーは登録されていません。' });
    }

    const user = Database.getUserById(passkey.userId);
    if (!user) {
      return res.status(404).json({ error: 'ユーザーが見つかりません。' });
    }

    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpId,
      authenticator: {
        credentialID: passkey.id,
        credentialPublicKey: Buffer.from(passkey.publicKey, 'base64url'),
        counter: 0,
        transports: passkey.transports
      },
      requireUserVerification: false
    });

    if (!verification.verified) {
      return res.status(400).json({ error: 'パスキーの検証に失敗しました。' });
    }

    // Update counter
    Database.updatePasskeyCounter(passkey.id, verification.authenticationInfo.newCounter);

    // Save session with active passkey's scope
    req.session.currentChallenge = null;
    req.session.userId = user.id;
    req.session.activePasskeyId = passkey.id;
    req.session.activeScope = passkey.scope;
    req.session.transferLimit = passkey.transferLimit;

    res.json({
      success: true,
      user,
      passkey,
      scope: passkey.scope,
      transferLimit: passkey.transferLimit,
      balance: Database.getBalance(user.id)
    });
  } catch (err) {
    console.error('[Auth] Login verify error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get Current User Session & Scoped State
app.get('/api/session', (req, res) => {
  const userId = req.session.userId;
  if (!userId) {
    return res.json({ loggedIn: false });
  }

  const user = Database.getUserById(userId);
  if (!user) {
    req.session = null;
    return res.json({ loggedIn: false });
  }

  const activePasskey = Database.getPasskeyById(req.session.activePasskeyId);
  const balance = Database.getBalance(userId);
  const transactions = Database.getTransactions(userId);
  const passkeys = Database.getPasskeysByUserId(userId);

  res.json({
    loggedIn: true,
    user,
    activePasskey,
    activeScope: req.session.activeScope || 'full',
    transferLimit: req.session.transferLimit || null,
    balance,
    transactions,
    passkeys
  });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  req.session = null;
  res.json({ success: true });
});

// -------------------------------------------------------------
// 2. Bank Operation Routes (Scoped Permissions Enforced)
// -------------------------------------------------------------

// Transfer Money
app.post('/api/bank/transfer', (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ error: 'ログインしてください。' });
    }

    const activeScope = req.session.activeScope || 'full';
    const transferLimit = req.session.transferLimit;
    const { amount, recipient, description } = req.body;
    const transferAmount = parseInt(amount, 10);

    if (isNaN(transferAmount) || transferAmount <= 0) {
      return res.status(400).json({ error: '有効な金額を入力してください。' });
    }

    // Permission Scope Check: Read Only
    if (activeScope === 'read_only') {
      return res.status(403).json({
        error: '【権限エラー】現在のパスキーは「閲覧専用 (Read Only)」です。送金操作は許可されていません。'
      });
    }

    // Permission Scope Check: Limited Transfer
    if (activeScope === 'limited_transfer') {
      if (transferLimit && transferAmount > transferLimit) {
        return res.status(403).json({
          error: `【権限エラー】現在のパスキーの送金上限額（¥${transferLimit.toLocaleString()}）を超えています（指定額: ¥${transferAmount.toLocaleString()}）。`
        });
      }
    }

    const result = Database.transferMoney({
      userId,
      recipient,
      amount: transferAmount,
      description: description || 'お振込み',
      passkeyId: req.session.activePasskeyId,
      passkeyScope: activeScope
    });

    res.json({
      success: true,
      newBalance: result.newBalance,
      transaction: result.transaction
    });
  } catch (err) {
    console.error('[Bank] Transfer error:', err);
    res.status(400).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 3. Web-based Add Passkey Routes (Scoped Creation)
// -------------------------------------------------------------

// Generate options to add a new passkey from Web
app.post('/api/passkeys/add-options', async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ error: 'ログインしてください。' });
    }

    // Permission Scope Check: Adding passkey requires Full permission
    if (req.session.activeScope !== 'full') {
      return res.status(403).json({
        error: '【権限エラー】パスキーの追加設定は「フル権限」のパスキーでのみ実行可能です。'
      });
    }

    const user = Database.getUserById(userId);
    const { rpId, rpName } = config.getRpIdAndOrigin(req);
    const { scope = 'full', transferLimit } = req.body || {};

    let scopedDisplayName = user.displayName;
    let scopedUsername = user.username;
    if (scope === 'read_only') {
      scopedDisplayName = `${user.displayName} (Read-only)`;
      scopedUsername = user.username.includes('@')
        ? user.username.replace('@', '+readonly@')
        : `${user.username} (Read-only)`;
    } else if (scope === 'limited_transfer') {
      const limit = transferLimit || 5000;
      scopedDisplayName = `${user.displayName} (${limit} yen limit)`;
      scopedUsername = user.username.includes('@')
        ? user.username.replace('@', `+${limit}yen@`)
        : `${user.username} (${limit} yen limit)`;
    } else {
      scopedUsername = user.username.includes('@')
        ? user.username.replace('@', `+sub_${crypto.randomBytes(2).toString('hex')}@`)
        : `${user.username} (Sub)`;
    }

    const subUserId = `${user.id}:sub_${scope}_${crypto.randomBytes(4).toString('hex')}`;

    const options = await generateRegistrationOptions({
      rpName,
      rpID: rpId,
      userID: Buffer.from(subUserId, 'utf-8'),
      userName: scopedUsername,
      userDisplayName: scopedDisplayName,
      attestationType: 'none',
      excludeCredentials: [],
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'preferred'
      }
    });

    req.session.addPasskeyChallenge = options.challenge;
    res.json(options);
  } catch (err) {
    console.error('[Passkey] Add options error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Verify & Save newly created scoped passkey from Web
app.post('/api/passkeys/add-verify', async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ error: 'ログインしてください。' });
    }

    if (req.session.activeScope !== 'full') {
      return res.status(403).json({ error: 'パスキーの追加権限がありません。' });
    }

    const { credential, passkeyName, scope, transferLimit } = req.body;
    const challenge = req.session.addPasskeyChallenge;

    if (!challenge) {
      return res.status(400).json({ error: 'チャレンジが見つかりません。' });
    }

    const { rpId, origin } = config.getRpIdAndOrigin(req);

    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpId,
      requireUserVerification: false
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'パスキー登録の検証に失敗しました。' });
    }

    const regInfo = verification.registrationInfo;
    const credentialID = regInfo.credentialID || regInfo.credential?.id;
    const credentialPublicKey = regInfo.credentialPublicKey || regInfo.credential?.publicKey;
    const counter = regInfo.counter ?? regInfo.credential?.counter ?? 0;
    const { credentialDeviceType, credentialBackedUp, aaguid } = regInfo;

    const savedPasskey = Database.savePasskey({
      id: credentialID,
      userId,
      publicKey: Buffer.from(credentialPublicKey).toString('base64url'),
      counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: credential.response.transports || ['internal'],
      aaguid: aaguid || '00000000-0000-0000-0000-000000000000',
      name: passkeyName || '追加パスキー',
      scope: scope || 'full',
      transferLimit: scope === 'limited_transfer' ? parseInt(transferLimit, 10) : null
    });

    req.session.addPasskeyChallenge = null;

    res.json({
      success: true,
      passkey: savedPasskey,
      passkeys: Database.getPasskeysByUserId(userId)
    });
  } catch (err) {
    console.error('[Passkey] Add verify error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete Passkey
app.delete('/api/passkeys/:id', (req, res) => {
  const userId = req.session.userId;
  if (!userId) {
    return res.status(401).json({ error: 'ログインしてください。' });
  }

  if (req.session.activeScope !== 'full') {
    return res.status(403).json({ error: 'パスキーの削除はフル権限でのみ可能です。' });
  }

  const targetPasskey = Database.getPasskeyById(req.params.id);
  if (!targetPasskey || targetPasskey.userId !== userId) {
    return res.status(404).json({ error: '対象のパスキーが見つかりません。' });
  }

  Database.deletePasskey(req.params.id);
  res.json({ success: true, passkeys: Database.getPasskeysByUserId(userId) });
});

// -------------------------------------------------------------
// 4. OAuth 2.0 & Passkey Provisioning Endpoints (for Android App)
// -------------------------------------------------------------

// GET /oauth/authorize - Auth Tab Web UI Endpoint
app.get('/oauth/authorize', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/oauth-authorize.html'));
});

// POST /oauth/consent - Process Authorization Consent and issue OAuth Code
app.post('/oauth/consent', (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ error: '認可を行うにはまずログインしてください。' });
    }

    // Permission Scope Check: Adding/provisioning passkey requires Full permission
    if (req.session.activeScope !== 'full') {
      return res.status(403).json({
        error: '【権限エラー】パスキーの発行認可は「フル権限」のマスターパスキーでのみ実行可能です。'
      });
    }

    const {
      clientId = 'mycredman-client',
      redirectUri = 'mycredman://oauth/callback',
      codeChallenge,
      codeChallengeMethod = 'S256',
      state,
      scope = 'limited_transfer',
      transferLimit = 5000,
      passkeyName = 'Scoped Passkey'
    } = req.body;

    if (!codeChallenge) {
      return res.status(400).json({ error: 'code_challenge パラメータが不足しています。' });
    }

    const code = `authcode_${crypto.randomBytes(24).toString('base64url')}`;

    Database.saveOAuthCode({
      code,
      clientId,
      redirectUri,
      codeChallenge,
      codeChallengeMethod,
      userId,
      scope,
      transferLimit: scope === 'limited_transfer' ? parseInt(transferLimit, 10) : null,
      passkeyName
    });

    const redirectUrl = `${redirectUri}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state || '')}`;
    res.json({ success: true, redirectUrl });
  } catch (err) {
    console.error('[OAuth] Consent error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /oauth/token - Exchange code for Bearer access token using PKCE
app.post('/oauth/token', (req, res) => {
  try {
    const { grant_type, code, code_verifier, client_id, redirect_uri } = req.body;

    if (grant_type !== 'authorization_code') {
      return res.status(400).json({ error: 'unsupported_grant_type', error_description: 'Only authorization_code is supported' });
    }

    if (!code || !code_verifier) {
      return res.status(400).json({ error: 'invalid_request', error_description: 'code and code_verifier are required' });
    }

    const oauthEntry = Database.consumeOAuthCode(code);
    if (!oauthEntry) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'Authorization code is invalid or expired' });
    }

    // Verify PKCE S256 Challenge
    const isValidPkce = verifyPkceChallenge(code_verifier, oauthEntry.codeChallenge);
    if (!isValidPkce) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE code_verifier verification failed' });
    }

    const accessToken = `at_${crypto.randomBytes(32).toString('base64url')}`;

    Database.saveAccessToken({
      token: accessToken,
      userId: oauthEntry.userId,
      scope: oauthEntry.scope,
      transferLimit: oauthEntry.transferLimit,
      passkeyName: oauthEntry.passkeyName
    });

    res.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: oauthEntry.scope
    });
  } catch (err) {
    console.error('[OAuth] Token exchange error:', err);
    res.status(500).json({ error: 'server_error', error_description: err.message });
  }
});

// POST /passkeys/creation-options - Passkey Provisioning Step 1 (Tim Cappalli Spec)
app.post('/passkeys/creation-options', async (req, res) => {
  try {
    const authHeader = req.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return res.status(401).json({ error: 'unauthorized', error_description: 'Bearer token is required' });
    }

    const tokenEntry = Database.getAccessToken(token);
    if (!tokenEntry) {
      return res.status(401).json({ error: 'invalid_token', error_description: 'Access token is invalid or expired' });
    }

    const user = Database.getUserById(tokenEntry.userId);
    if (!user) {
      return res.status(404).json({ error: 'user_not_found', error_description: 'User associated with token not found' });
    }

    const { rpId, rpName } = config.getRpIdAndOrigin(req);
    const existingPasskeys = Database.getPasskeysByUserId(user.id);

    let displayName = user.displayName;
    let userName = user.username;
    if (tokenEntry.scope === 'read_only') {
      displayName = `${user.displayName} (Read-only)`;
      userName = user.username.includes('@')
        ? user.username.replace('@', '+readonly@')
        : `${user.username} (Read-only)`;
    } else if (tokenEntry.scope === 'limited_transfer') {
      const limit = tokenEntry.transferLimit || 5000;
      displayName = `${user.displayName} (${limit} yen limit)`;
      userName = user.username.includes('@')
        ? user.username.replace('@', `+${limit}yen@`)
        : `${user.username} (${limit} yen limit)`;
    } else {
      userName = user.username.includes('@')
        ? user.username.replace('@', '+agent@')
        : `${user.username} (AI Agent)`;
    }

    const scopedUserId = `${user.id}:prov_${tokenEntry.scope}_${crypto.randomBytes(4).toString('hex')}`;

    const options = await generateRegistrationOptions({
      rpName,
      rpID: rpId,
      userID: Buffer.from(scopedUserId, 'utf-8'),
      userName,
      userDisplayName: displayName,
      attestationType: 'none',
      excludeCredentials: [],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'required',
        userVerification: 'required'
      }
    });

    // Save challenge linked to this access token
    Database.saveChallenge(`provision_${token}`, options.challenge);

    res.json(options);
  } catch (err) {
    console.error('[Provisioning] Creation options error:', err);
    res.status(500).json({ error: 'server_error', error_description: err.message });
  }
});

// POST /passkeys/register - Passkey Provisioning Step 2 (Tim Cappalli Spec)
app.post('/passkeys/register', async (req, res) => {
  try {
    const authHeader = req.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return res.status(401).json({ error: 'unauthorized', error_description: 'Bearer token is required' });
    }

    const tokenEntry = Database.getAccessToken(token);
    if (!tokenEntry) {
      return res.status(401).json({ error: 'invalid_token', error_description: 'Access token is invalid or expired' });
    }

    const challenge = Database.getChallenge(`provision_${token}`);
    if (!challenge) {
      return res.status(400).json({ error: 'invalid_request', error_description: 'Provisioning challenge expired or not found' });
    }

    const credential = req.body;
    const { rpId, origin } = config.getRpIdAndOrigin(req);

    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpId,
      requireUserVerification: false
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'verification_failed', error_description: 'WebAuthn registration verification failed' });
    }

    const regInfo = verification.registrationInfo;
    const credentialID = regInfo.credentialID || regInfo.credential?.id;
    const credentialPublicKey = regInfo.credentialPublicKey || regInfo.credential?.publicKey;
    const counter = regInfo.counter ?? regInfo.credential?.counter ?? 0;
    const { credentialDeviceType, credentialBackedUp, aaguid } = regInfo;

    // Save passkey with scoped permissions attached to access token!
    const passkey = Database.savePasskey({
      id: credentialID,
      userId: tokenEntry.userId,
      publicKey: Buffer.from(credentialPublicKey).toString('base64url'),
      counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: credential.response?.transports || ['internal'],
      aaguid: aaguid || '00000000-0000-0000-0000-000000000000',
      name: tokenEntry.passkeyName || `Scoped Passkey (${tokenEntry.scope})`,
      scope: tokenEntry.scope,
      transferLimit: tokenEntry.transferLimit
    });

    Database.deleteChallenge(`provision_${token}`);

    res.status(201).json({
      status: 'ok',
      message: 'Passkey registered successfully with assigned scope',
      passkeyId: passkey.id,
      scope: passkey.scope,
      transferLimit: passkey.transferLimit
    });
  } catch (err) {
    console.error('[Provisioning] Register error:', err);
    res.status(500).json({ error: 'server_error', error_description: err.message });
  }
});

// -------------------------------------------------------------
// 5. Health Check
// -------------------------------------------------------------
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Start Server
app.listen(config.port, () => {
  console.log(`=================================================`);
  console.log(`🏦 Scoped Passkey Bank Web Service running!`);
  console.log(`📍 Local Port: http://localhost:${config.port}`);
  console.log(`🌐 Target Domain: ${config.defaultOrigin}`);
  console.log(`🔑 RP ID: ${config.defaultRpId}`);
  console.log(`=================================================`);
});
