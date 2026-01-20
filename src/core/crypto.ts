/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/**
 * Crypto utilities for Tauri Updater
 * Handles encryption, decryption, and checksum verification
 */

import forge from 'node-forge';

export interface DecryptedSessionKey {
  iv: Uint8Array;
  aesKey: Uint8Array;
}

function toHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBuffer(bytes: Uint8Array): forge.util.ByteStringBuffer {
  return forge.util.createBuffer(bytes.buffer as ArrayBuffer, 'raw');
}

function binaryStringToBytes(binary: string): Uint8Array {
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export class CryptoManager {
  private publicKey: string | null = null;

  setPublicKey(key: string | null): void {
    this.publicKey = key;
  }

  getPublicKey(): string | null {
    return this.publicKey;
  }

  async calculateFileChecksum(bytes: Uint8Array): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return toHex(hash);
  }

  async calculateBufferChecksum(bytes: Uint8Array): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return toHex(hash);
  }

  async verifyFileChecksum(bytes: Uint8Array, expectedChecksum: string): Promise<boolean> {
    const actualChecksum = await this.calculateFileChecksum(bytes);
    return actualChecksum.toLowerCase() === expectedChecksum.toLowerCase();
  }

  parseSessionKey(sessionKey: string): DecryptedSessionKey | null {
    if (!this.publicKey) {
      console.warn('No public key set for decryption');
      return null;
    }

    try {
      const parts = sessionKey.split(':');
      if (parts.length !== 2) {
        console.error('Invalid session key format: expected IV:encrypted_key');
        return null;
      }

      const ivBytes = base64ToBytes(parts[0]);
      const encryptedAesKey = base64ToBytes(parts[1]);

      const publicKey = forge.pki.publicKeyFromPem(this.publicKey);
      const decryptedAesKey = publicKey.decrypt(
        forge.util.createBuffer(encryptedAesKey.buffer as ArrayBuffer, 'raw').getBytes(),
        'RSAES-PKCS1-V1_5'
      );

      return { iv: ivBytes, aesKey: binaryStringToBytes(decryptedAesKey) };
    } catch (error) {
      console.error('Failed to parse/decrypt session key:', error);
      return null;
    }
  }

  decryptSessionKey(encryptedSessionKey: string): Uint8Array | null {
    const result = this.parseSessionKey(encryptedSessionKey);
    return result ? result.aesKey : null;
  }

  decryptContent(encryptedData: Uint8Array, sessionKey: DecryptedSessionKey): Uint8Array | null {
    try {
      const decipher = forge.cipher.createDecipher('AES-CBC', bytesToBuffer(sessionKey.aesKey));
      decipher.start({ iv: bytesToBuffer(sessionKey.iv) });
      decipher.update(bytesToBuffer(encryptedData));
      const success = decipher.finish();
      if (!success) return null;
      const output = decipher.output.getBytes();
      return binaryStringToBytes(output);
    } catch (error) {
      console.error('Failed to decrypt content:', error);
      return null;
    }
  }

  decryptContentWithKeyIv(
    encryptedData: Uint8Array,
    aesKey: Uint8Array,
    iv: Uint8Array
  ): Uint8Array | null {
    try {
      const decipher = forge.cipher.createDecipher('AES-CBC', bytesToBuffer(aesKey));
      decipher.start({ iv: bytesToBuffer(iv) });
      decipher.update(bytesToBuffer(encryptedData));
      const success = decipher.finish();
      if (!success) return null;
      const output = decipher.output.getBytes();
      return binaryStringToBytes(output);
    } catch (error) {
      console.error('Failed to decrypt content:', error);
      return null;
    }
  }

  async decryptFile(bytes: Uint8Array, sessionKey: string): Promise<Uint8Array | null> {
    try {
      const parsed = this.parseSessionKey(sessionKey);
      if (!parsed) return null;
      return this.decryptContent(bytes, parsed);
    } catch (error) {
      console.error('Failed to decrypt file:', error);
      return null;
    }
  }

  decryptChecksum(encryptedChecksum: string, sessionKey: string): string | null {
    try {
      const parsed = this.parseSessionKey(sessionKey);
      if (!parsed) return null;

      const encryptedData = base64ToBytes(encryptedChecksum);
      const decrypted = this.decryptContent(encryptedData, parsed);
      if (!decrypted) return null;

      return new TextDecoder().decode(decrypted);
    } catch (error) {
      console.error('Failed to decrypt checksum:', error);
      return null;
    }
  }

  async decompressBrotli(compressedData: Uint8Array): Promise<Uint8Array> {
    if (typeof DecompressionStream !== 'undefined') {
      const stream = new DecompressionStream('br');
      const response = new Response(compressedData).body?.pipeThrough(stream);
      if (response) {
        const buffer = await new Response(response).arrayBuffer();
        return new Uint8Array(buffer);
      }
    }

    const { decompress } = await import('brotli-wasm');
    return decompress(compressedData);
  }

  async tryDecompressBrotli(data: Uint8Array): Promise<Uint8Array> {
    try {
      return await this.decompressBrotli(data);
    } catch {
      return data;
    }
  }

  generateUUID(): string {
    return crypto.randomUUID();
  }

  generateBundleId(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return toHex(bytes);
  }
}
