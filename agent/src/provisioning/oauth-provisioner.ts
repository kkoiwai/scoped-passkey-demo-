import crypto from 'node:crypto';
import { Config } from '../config.js';
import { generatePasskeyForOptions, CreationOptionsInput } from '../crypto/passkey-generator.js';
import { passkeyStore, StoredPasskey } from '../storage/passkey-store.js';

export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
}

export class OAuthProvisioner {
  /**
   * Generates a PKCE code_verifier and S256 code_challenge.
   */
  static generatePkcePair(): PkcePair {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest()
      .toString('base64url');
    const state = crypto.randomUUID();
    return { codeVerifier, codeChallenge, state };
  }

  /**
   * Builds the OAuth 2.0 PKCE Authorization URL for the user to authenticate and grant scope.
   */
  /**
   * Builds the OAuth 2.0 PKCE Authorization URL for the user to authenticate and grant scope.
   */
  static async getAuthorizationUrl(
    redirectUri: string = Config.REDIRECT_URI,
    sessionId: string = 'default'
  ): Promise<{ url: string; state: string; codeVerifier: string }> {
    const { codeVerifier, codeChallenge, state } = this.generatePkcePair();

    await passkeyStore.savePkceSession({
      state,
      codeVerifier,
      sessionId,
      createdAt: Date.now()
    });

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: Config.CLIENT_ID,
      redirect_uri: redirectUri,
      scope: 'openid profile passkeys.provision',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });

    const url = `${Config.BANK_BASE_URL}/oauth/authorize?${params.toString()}`;
    return { url, state, codeVerifier };
  }

  /**
   * Exchanges authorization code for access token, fetches creation options,
   * directly generates an EC P-256 keypair, and registers the passkey with the Provisioning API.
   */
  static async exchangeCodeAndProvisionPasskey(
    code: string,
    codeVerifier: string,
    redirectUri: string = Config.REDIRECT_URI,
    sessionId: string = 'default'
  ): Promise<StoredPasskey> {
    console.log('[OAuthProvisioner] 1. Exchanging authorization code for access token...');

    // 1. Token Exchange (POST /oauth/token)
    const tokenRes = await fetch(`${Config.BANK_BASE_URL}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        code_verifier: codeVerifier,
        client_id: Config.CLIENT_ID,
        redirect_uri: redirectUri
      })
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(`Token exchange failed (HTTP ${tokenRes.status}): ${JSON.stringify(tokenData)}`);
    }

    const accessToken = tokenData.access_token;
    const scope = tokenData.scope || 'read_only';
    console.log(`[OAuthProvisioner] Successfully obtained access token (Scope: ${scope})`);

    // 2. Fetch Creation Options (POST /passkeys/creation-options)
    console.log('[OAuthProvisioner] 2. Fetching Creation Options from Provisioning API...');
    const optRes = await fetch(`${Config.BANK_BASE_URL}/passkeys/creation-options`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        authenticatorAttachment: 'platform',
        userVerification: 'required'
      })
    });

    const creationOptions = (await optRes.json()) as CreationOptionsInput;
    if (!optRes.ok || !creationOptions.challenge) {
      throw new Error(`Fetching creation options failed (HTTP ${optRes.status}): ${JSON.stringify(creationOptions)}`);
    }
    console.log(`[OAuthProvisioner] Received options for RP: ${creationOptions.rp.id}, User: ${creationOptions.user.displayName}`);

    // 3. Directly Generate KeyPair and Attestation Object
    console.log('[OAuthProvisioner] 3. Generating EC P-256 KeyPair & WebAuthn registration JSON...');
    const passkey = generatePasskeyForOptions(creationOptions, Config.RP_ORIGIN);

    // 4. Register Passkey (POST /passkeys/register)
    console.log('[OAuthProvisioner] 4. Submitting registration to Passkey Provisioning API...');
    const regRes = await fetch(`${Config.BANK_BASE_URL}/passkeys/register`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(passkey.registrationResponse)
    });

    const regData = await regRes.json();
    if (!regRes.ok || (regData.status !== 'ok' && !regData.success)) {
      throw new Error(`Passkey registration failed (HTTP ${regRes.status}): ${JSON.stringify(regData)}`);
    }
    console.log(`[OAuthProvisioner] Passkey successfully registered! (ID: ${passkey.credentialId})`);

    // 5. Store into Passkey Vault (keyed by isolated sessionId)
    const storedPasskey: StoredPasskey = {
      userId: sessionId,
      credentialId: passkey.credentialId,
      privateKeyDerBase64: passkey.privateKeyDerBase64,
      userHandleBase64Url: creationOptions.user.id,
      rpId: creationOptions.rp.id,
      scope: regData.scope || regData.passkey?.scope || scope,
      transferLimit: regData.transferLimit !== undefined ? regData.transferLimit : regData.passkey?.transferLimit,
      displayName: creationOptions.user.displayName,
      createdAt: new Date().toISOString()
    };

    await passkeyStore.savePasskey(storedPasskey);
    console.log(`[OAuthProvisioner] Stored passkey in vault for session: ${sessionId} (${storedPasskey.displayName})`);

    return storedPasskey;
  }
}
