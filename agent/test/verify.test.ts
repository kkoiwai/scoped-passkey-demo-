import { describe, it } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { generatePasskeyForOptions } from '../src/crypto/passkey-generator.js';

describe('WebAuthn End-to-End Verification Test', () => {
  it('should generate valid registration and matching signature', () => {
    const challenge = crypto.randomBytes(32).toString('base64url');
    const mockOptions = {
      challenge,
      rp: { id: 'sp.exarnp1e.com', name: 'Scoped Passkey Bank' },
      user: { id: 'WVd4cFkyVkFaWGhoYlhCc1pTNWpiMjA', name: 'alice@example.com', displayName: 'Alice (Read-only)' }
    };

    const passkey = generatePasskeyForOptions(mockOptions, 'https://sp.exarnp1e.com');

    assert.ok(passkey.credentialId);
    assert.ok(passkey.privateKeyDerBase64);
    assert.strictEqual(passkey.publicKeyCose.length, 77);

    // Verify EC Private Key can sign and Public Key can verify
    const privKey = crypto.createPrivateKey({
      key: Buffer.from(passkey.privateKeyDerBase64, 'base64'),
      format: 'der',
      type: 'pkcs8'
    });

    const pubKey = crypto.createPublicKey(privKey);

    const testData = Buffer.from('hello webauthn');
    const signature = crypto.sign('sha256', testData, privKey);
    const verified = crypto.verify('sha256', testData, pubKey, signature);

    assert.strictEqual(verified, true, 'EC P-256 signature must be verified by public key');
  });
});
