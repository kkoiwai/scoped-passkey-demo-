import { describe, it } from 'node:test';
import assert from 'node:assert';
import { generatePasskeyForOptions, CreationOptionsInput } from '../src/crypto/passkey-generator.js';

describe('Agent Crypto & Passkey Generation Tests', () => {
  it('should generate valid EC P-256 keypair and registration response', () => {
    const mockOptions: CreationOptionsInput = {
      challenge: 'N5i4hK1eECUeJk2z6W7ntc4GTVS1IIIsrC_NSZ4u2Aw',
      rp: {
        id: 'sp.exarnp1e.com',
        name: 'Scoped Passkey Bank'
      },
      user: {
        id: 'WVd4cFkyVkFaWGhoYlhCc1pTNWpiMjA',
        name: 'alice@example.com',
        displayName: 'Alice (Read-only)'
      }
    };

    const passkey = generatePasskeyForOptions(mockOptions, 'https://sp.exarnp1e.com');

    // Assert Credential ID
    assert.ok(passkey.credentialId, 'Credential ID should be generated');
    assert.strictEqual(passkey.rawCredentialId.length, 32, 'Credential ID should be 32 bytes');

    // Assert PKCS#8 DER Base64 (needed by CDP Virtual Authenticator)
    assert.ok(passkey.privateKeyDerBase64, 'Private key DER Base64 should be generated');
    const derBuffer = Buffer.from(passkey.privateKeyDerBase64, 'base64');
    assert.ok(derBuffer.length > 50, 'DER private key buffer should be valid');

    // Assert COSE Public Key
    assert.strictEqual(passkey.publicKeyCose.length, 77, 'COSE ES256 key length should be 77 bytes');

    // Assert Registration Response JSON format
    const res = passkey.registrationResponse;
    assert.strictEqual(res.type, 'public-key');
    assert.strictEqual(res.authenticatorAttachment, 'platform');
    assert.strictEqual(res.id, passkey.credentialId);
    assert.strictEqual(res.rawId, passkey.credentialId);

    // Decode and verify clientDataJSON
    const clientDataJsonStr = Buffer.from(res.response.clientDataJSON, 'base64url').toString('utf-8');
    const clientData = JSON.parse(clientDataJsonStr);
    assert.strictEqual(clientData.type, 'webauthn.create');
    assert.strictEqual(clientData.origin, 'https://sp.exarnp1e.com');
    assert.strictEqual(clientData.challenge, mockOptions.challenge);
  });
});
