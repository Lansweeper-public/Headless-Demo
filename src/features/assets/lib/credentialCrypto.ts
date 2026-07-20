// Client-side encryption for Lansweeper discovery credentials.
//
// Each credential's sensitive fields are encrypted per discovery component:
//   1. a fresh 256-bit AES-GCM key encrypts the credential JSON,
//   2. that AES key is wrapped with the component's RSA public key (RSA-OAEP, SHA-512).
// The plaintext secrets never leave the browser un-encrypted.
// See https://developer.lansweeper.com/docs/platform-api/guides/manage-credentials

export interface CipherCredential {
  discoveryComponentId: string;
  key: string;
  message: string;
  nonce: string;
  tag: string;
}

export interface DiscoveryComponent {
  id: string;
  publicKey: string;
}

const NONCE_LENGTH = 12;
const GCM_TAG_LENGTH = 16;

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function toBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Parse a PKCS#1 `RSAPublicKey` (base64 DER: SEQUENCE { INTEGER modulus, INTEGER exponent })
 * into its modulus (n) and exponent (e). Web Crypto can't import PKCS#1 directly, so we
 * extract n/e and import them as a JWK instead (avoids a node-forge dependency).
 */
function parsePkcs1PublicKey(der: Uint8Array): { n: Uint8Array; e: Uint8Array } {
  let pos = 0;
  const readLength = (): number => {
    let len = der[pos++];
    if (len & 0x80) {
      const count = len & 0x7f;
      len = 0;
      for (let i = 0; i < count; i++) len = (len << 8) | der[pos++];
    }
    return len;
  };
  const readInteger = (): Uint8Array => {
    if (der[pos++] !== 0x02) throw new Error('Malformed public key (expected INTEGER).');
    const len = readLength();
    let bytes = der.slice(pos, pos + len);
    pos += len;
    // DER prepends a 0x00 byte when the high bit is set; strip it for the JWK value.
    if (bytes.length > 1 && bytes[0] === 0x00) bytes = bytes.slice(1);
    return bytes;
  };
  if (der[pos++] !== 0x30) throw new Error('Malformed public key (expected SEQUENCE).');
  readLength();
  const n = readInteger();
  const e = readInteger();
  return { n, e };
}

async function importPublicKey(base64Der: string): Promise<CryptoKey> {
  const { n, e } = parsePkcs1PublicKey(base64ToBytes(base64Der.trim()));
  return crypto.subtle.importKey(
    'jwk',
    { kty: 'RSA', n: toBase64Url(n), e: toBase64Url(e), alg: 'RSA-OAEP-512', ext: true, use: 'enc' },
    { name: 'RSA-OAEP', hash: 'SHA-512' },
    false,
    ['encrypt']
  );
}

/** Encrypt one credential payload for a single discovery component. */
async function encryptForComponent(
  payload: Record<string, string>,
  component: DiscoveryComponent
): Promise<CipherCredential> {
  const aesKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const rawAesKey = await crypto.subtle.exportKey('raw', aesKey);

  const rsaKey = await importPublicKey(component.publicKey);
  const wrappedKey = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, rsaKey, rawAesKey);

  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, encoded));

  // AES-GCM output is ciphertext followed by the 16-byte authentication tag.
  const message = encrypted.slice(0, encrypted.length - GCM_TAG_LENGTH);
  const tag = encrypted.slice(encrypted.length - GCM_TAG_LENGTH);

  return {
    discoveryComponentId: component.id,
    key: bytesToBase64(new Uint8Array(wrappedKey)),
    message: bytesToBase64(message),
    nonce: bytesToBase64(nonce),
    tag: bytesToBase64(tag),
  };
}

/** Encrypt a credential payload for every discovery component on the site. */
export async function encryptCredential(
  payload: Record<string, string>,
  components: DiscoveryComponent[]
): Promise<CipherCredential[]> {
  return Promise.all(components.map((c) => encryptForComponent(payload, c)));
}
