import crypto from 'node:crypto';

export interface GeneratedPasskey {
  credentialId: string; // Base64URL
  rawCredentialId: Buffer;
  privateKeyDerBase64: string; // PKCS#8 DER Base64 (for CDP Virtual Authenticator)
  publicKeyCose: Buffer;
  publicKeyJwk: {
    kty: string;
    crv: string;
    x: string;
    y: string;
  };
  registrationResponse: {
    id: string;
    rawId: string;
    response: {
      clientDataJSON: string;
      attestationObject: string;
      transports: string[];
    };
    type: string;
    authenticatorAttachment: string;
    clientExtensionResults: Record<string, unknown>;
  };
}

export interface CreationOptionsInput {
  challenge: string; // Base64URL
  rp: {
    id: string;
    name: string;
  };
  user: {
    id: string; // Base64URL
    name: string;
    displayName: string;
  };
}

/**
 * Converts a base64url string to Buffer.
 */
export function base64UrlToBuffer(b64url: string): Buffer {
  const padding = '='.repeat((4 - (b64url.length % 4)) % 4);
  const base64 = (b64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64');
}

/**
 * Converts a Buffer to Base64URL string.
 */
export function bufferToBase64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Builds a COSE EC P-256 public key buffer from X and Y coordinates (ES256, alg -7).
 */
export function buildCosePublicKey(x: Buffer, y: Buffer): Buffer {
  // CBOR Map with 5 elements (RFC 9052 / RFC 8152):
  // 1 (kty): 2 (EC2)
  // 3 (alg): -7 (ES256)
  // -1 (crv): 1 (P-256)
  // -2 (x): 32 bytes
  // -3 (y): 32 bytes
  const header = Buffer.from('A5010203262001215820', 'hex');
  const mid = Buffer.from('225820', 'hex');
  return Buffer.concat([header, x, mid, y]);
}

/**
 * Builds a standard WebAuthn AuthenticatorData buffer.
 */
export function buildAuthenticatorData(
  rpId: string,
  credentialId: Buffer,
  cosePublicKey: Buffer,
  flags: number = 0x5d // UP (0x01) + UV (0x04) + AT (0x40) + BE (0x08) + BS (0x10)
): Buffer {
  const rpIdHash = crypto.createHash('sha256').update(rpId).digest();
  const flagBuf = Buffer.from([flags]);
  const signCount = Buffer.from([0, 0, 0, 0]);
  const aaguid = Buffer.alloc(16, 0); // 16 bytes zero AAGUID
  const credIdLen = Buffer.alloc(2);
  credIdLen.writeUInt16BE(credentialId.length, 0);

  return Buffer.concat([
    rpIdHash,
    flagBuf,
    signCount,
    aaguid,
    credIdLen,
    credentialId,
    cosePublicKey
  ]);
}

/**
 * Builds a standard WebAuthn AttestationObject buffer with "none" attestation statement.
 */
export function buildAttestationObject(authData: Buffer): Buffer {
  // CBOR Map with 3 keys: fmt: "none", attStmt: {}, authData: <bytes>
  // A3                                         # map(3)
  //   63 666D74                                # text(3) "fmt"
  //   64 6E6F6E65                              # text(4) "none"
  //   67 61747453746D74                        # text(7) "attStmt"
  //   A0                                       # map(0)
  //   68 6175746844617461                      # text(8) "authData"
  //   58 <len> <authData>                      # bytes(len)
  const header = Buffer.from('A363666D74646E6F6E656761747453746D74A068617574684461746158', 'hex');
  const lenBuf = Buffer.from([authData.length]);
  return Buffer.concat([header, lenBuf, authData]);
}

/**
 * Directly generates an EC P-256 keypair and constructs the complete
 * WebAuthn registration response for Passkey Provisioning.
 */
export function generatePasskeyForOptions(
  options: CreationOptionsInput,
  origin: string = 'https://sp.exarnp1e.com'
): GeneratedPasskey {
  // 1. Generate 32-byte Credential ID
  const rawCredentialId = crypto.randomBytes(32);
  const credentialId = bufferToBase64Url(rawCredentialId);

  // 2. Generate EC P-256 Key Pair
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1'
  });

  // Export private key in PKCS#8 DER Base64 (for CDP Virtual Authenticator)
  const privateKeyDer = privateKey.export({ type: 'pkcs8', format: 'der' });
  const privateKeyDerBase64 = privateKeyDer.toString('base64');

  // Export public key coordinates
  const jwk = publicKey.export({ format: 'jwk' }) as { kty: string; crv: string; x: string; y: string };
  const xBuf = base64UrlToBuffer(jwk.x);
  const yBuf = base64UrlToBuffer(jwk.y);
  const cosePublicKey = buildCosePublicKey(xBuf, yBuf);

  // 3. Construct AuthenticatorData & AttestationObject
  const authData = buildAuthenticatorData(options.rp.id, rawCredentialId, cosePublicKey);
  const attestationObject = buildAttestationObject(authData);
  const attestationObjectBase64Url = bufferToBase64Url(attestationObject);

  // 4. Construct clientDataJSON
  const clientData = {
    type: 'webauthn.create',
    challenge: options.challenge,
    origin,
    crossOrigin: false
  };
  const clientDataJSON = Buffer.from(JSON.stringify(clientData), 'utf-8');
  const clientDataJSONBase64Url = bufferToBase64Url(clientDataJSON);

  // 5. Construct full registration response JSON
  const registrationResponse = {
    id: credentialId,
    rawId: credentialId,
    response: {
      clientDataJSON: clientDataJSONBase64Url,
      attestationObject: attestationObjectBase64Url,
      transports: ['internal']
    },
    type: 'public-key',
    authenticatorAttachment: 'platform',
    clientExtensionResults: {}
  };

  return {
    credentialId,
    rawCredentialId,
    privateKeyDerBase64,
    publicKeyCose: cosePublicKey,
    publicKeyJwk: jwk,
    registrationResponse
  };
}
