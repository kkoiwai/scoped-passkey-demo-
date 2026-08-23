import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Database } from '../src/db.js';

describe('WebAuthn Data Handling Unit Test', () => {
  it('RegistrationInfo unpacking and saving passkey', () => {
    const user = Database.createUser('webauthn_tester@example.com', 'Tester');

    // Simulate registrationInfo returned by @simplewebauthn/server v10
    const mockRegistrationInfo = {
      fmt: 'none',
      counter: 0,
      aaguid: '00000000-0000-0000-0000-000000000000',
      credentialID: 'mock_cred_id_base64url',
      credentialPublicKey: new Uint8Array([1, 2, 3, 4, 5]),
      credentialType: 'public-key',
      userVerified: true,
      credentialDeviceType: 'singleDevice',
      credentialBackedUp: false
    };

    const regInfo = mockRegistrationInfo;
    const credentialID = regInfo.credentialID || regInfo.credential?.id;
    const credentialPublicKey = regInfo.credentialPublicKey || regInfo.credential?.publicKey;
    const counter = regInfo.counter ?? regInfo.credential?.counter ?? 0;
    const { credentialDeviceType, credentialBackedUp, aaguid } = regInfo;

    const passkey = Database.savePasskey({
      id: credentialID,
      userId: user.id,
      publicKey: Buffer.from(credentialPublicKey).toString('base64url'),
      counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: ['internal'],
      aaguid,
      name: 'マスターパスキー',
      scope: 'full',
      transferLimit: null
    });

    assert.ok(passkey);
    assert.strictEqual(passkey.id, 'mock_cred_id_base64url');
    assert.strictEqual(passkey.scope, 'full');

    const retrieved = Database.getPasskeyById('mock_cred_id_base64url');
    assert.ok(retrieved);
    assert.strictEqual(retrieved.userId, user.id);
  });
});
