/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/**
 * Download Manager
 * Handles downloading and extracting bundles with security checks
 */

import { BaseDirectory, exists, mkdir, readFile, writeFile } from '@tauri-apps/plugin-fs';
import { fetch as httpFetch } from '@tauri-apps/plugin-http';
import { unzipSync } from 'fflate';
import type { DownloadOptions, BundleInfo, ManifestEntry, DownloadEvent } from '../shared/types';
import type { StorageManager } from './storage';
import type { CryptoManager } from './crypto';

export interface DownloadProgress {
  percent: number;
  bytesDownloaded: number;
  totalBytes: number;
}

export type ProgressCallback = (progress: DownloadProgress) => void;

const BASE_DIR = BaseDirectory.AppLocalData;

export class DownloadManager {
  private storage: StorageManager;
  private crypto: CryptoManager;
  private timeout: number;

  constructor(storage: StorageManager, crypto: CryptoManager, timeout: number = 20000) {
    this.storage = storage;
    this.crypto = crypto;
    this.timeout = timeout;
  }

  setTimeout(timeout: number): void {
    this.timeout = timeout;
  }

  private isPathSafe(relativePath: string): boolean {
    const normalized = relativePath.replace(/\\/g, '/');
    if (normalized.startsWith('/') || normalized.startsWith('../') || normalized.includes('/../')) {
      return false;
    }
    if (/^[a-zA-Z]:\//.test(normalized)) {
      return false;
    }
    return !normalized.includes('..');
  }

  async downloadBundle(options: DownloadOptions, onProgress?: (event: DownloadEvent) => void): Promise<BundleInfo> {
    const bundleId = this.crypto.generateBundleId();
    const bundlePath = this.storage.getBundlePath(bundleId);
    const extractPath = `${bundlePath}/www`;

    await mkdir(bundlePath, { baseDir: BASE_DIR, recursive: true });

    const bundleInfo: BundleInfo = {
      id: bundleId,
      version: options.version,
      downloaded: new Date().toISOString(),
      checksum: options.checksum ?? '',
      status: 'downloading',
    };

    this.storage.setBundle(bundleId, bundleInfo);
    await this.storage.save();

    try {
      const zipBytes = await this.downloadToBytes(options.url, (progress) => {
        if (onProgress) {
          onProgress({ percent: progress.percent, bundle: bundleInfo });
        }
      });

      let expectedChecksum = options.checksum;
      if (expectedChecksum && options.sessionKey) {
        const decryptedChecksum = this.crypto.decryptChecksum(expectedChecksum, options.sessionKey);
        if (decryptedChecksum) {
          expectedChecksum = decryptedChecksum;
        }
      }

      if (expectedChecksum) {
        const valid = await this.crypto.verifyFileChecksum(zipBytes, expectedChecksum);
        if (!valid) {
          throw new Error('Checksum verification failed');
        }
        bundleInfo.checksum = expectedChecksum;
      } else {
        bundleInfo.checksum = await this.crypto.calculateFileChecksum(zipBytes);
      }

      let payload = zipBytes;
      if (options.sessionKey) {
        const decrypted = await this.crypto.decryptFile(zipBytes, options.sessionKey);
        if (!decrypted) {
          throw new Error('Failed to decrypt bundle');
        }
        payload = decrypted;
      }

      await this.extractZipSecurely(payload, extractPath);

      if (options.manifest && options.manifest.length > 0) {
        await this.downloadManifestFiles(
          options.manifest,
          extractPath,
          options.sessionKey,
          onProgress ? (progress) => onProgress({ percent: progress.percent, bundle: bundleInfo }) : undefined
        );
      }

      bundleInfo.status = 'success';
      this.storage.setBundle(bundleId, bundleInfo);
      await this.storage.save();

      return bundleInfo;
    } catch (error) {
      bundleInfo.status = 'error';
      this.storage.setBundle(bundleId, bundleInfo);
      await this.storage.save();

      try {
        await this.storage.deleteBundleFiles(bundleId);
        this.storage.deleteBundle(bundleId);
        await this.storage.save();
      } catch {
        // ignore cleanup errors
      }

      throw error;
    }
  }

  private async extractZipSecurely(zipBytes: Uint8Array, extractPath: string): Promise<void> {
    await mkdir(extractPath, { baseDir: BASE_DIR, recursive: true });

    const entries = unzipSync(zipBytes);
    for (const [fileName, data] of Object.entries(entries)) {
      if (!this.isPathSafe(fileName)) {
        throw new Error(`Zip entry has invalid path: ${fileName}`);
      }

      const targetPath = `${extractPath}/${fileName}`.replace(/\\/g, '/');
      const lastSlash = targetPath.lastIndexOf('/');
      if (lastSlash > 0) {
        const dirPath = targetPath.slice(0, lastSlash);
        await mkdir(dirPath, { baseDir: BASE_DIR, recursive: true });
      }

      await writeFile(targetPath, data, { baseDir: BASE_DIR });
    }
  }

  private async downloadToBytes(url: string, onProgress?: ProgressCallback): Promise<Uint8Array> {
    const response = await httpFetch(url, { method: 'GET', timeout: this.timeout });

    if (!response.ok) {
      throw new Error(`Download failed with status ${response.status}`);
    }

    const contentLengthHeader =
      typeof response.headers?.get === 'function'
        ? response.headers.get('content-length')
        : (response.headers as Record<string, string> | undefined)?.['content-length'];
    const totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;

    if (response.body && 'getReader' in response.body) {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          received += value.length;
          if (onProgress && totalBytes > 0) {
            onProgress({
              percent: Math.round((received / totalBytes) * 100),
              bytesDownloaded: received,
              totalBytes,
            });
          }
        }
      }

      const merged = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }

      if (onProgress && totalBytes === 0) {
        onProgress({ percent: 100, bytesDownloaded: received, totalBytes: received });
      }

      return merged;
    }

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    if (onProgress) {
      onProgress({ percent: 100, bytesDownloaded: bytes.length, totalBytes: bytes.length });
    }

    return bytes;
  }

  private async downloadManifestFiles(
    manifest: ManifestEntry[],
    destPath: string,
    sessionKey?: string,
    onProgress?: ProgressCallback
  ): Promise<void> {
    const total = manifest.length;
    let completed = 0;

    for (const entry of manifest) {
      if (!entry.file_name || !entry.download_url) continue;

      if (!this.isPathSafe(entry.file_name)) {
        throw new Error(`Manifest entry has invalid path: ${entry.file_name}`);
      }

      const filePath = `${destPath}/${entry.file_name}`.replace(/\\/g, '/');
      const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
      if (dirPath) {
        await mkdir(dirPath, { baseDir: BASE_DIR, recursive: true });
      }

      const existingFile = await this.checkFileInCache(filePath, entry.file_hash ?? undefined);
      if (existingFile) {
        completed++;
        if (onProgress) {
          onProgress({
            percent: Math.round((completed / total) * 100),
            bytesDownloaded: completed,
            totalBytes: total,
          });
        }
        continue;
      }

      let fileData = await this.downloadToBytes(entry.download_url);

      fileData = await this.crypto.tryDecompressBrotli(fileData);

      if (sessionKey) {
        const decrypted = await this.crypto.decryptFile(fileData, sessionKey);
        if (decrypted) {
          fileData = decrypted;
        }
      }

      await writeFile(filePath, fileData, { baseDir: BASE_DIR });

      if (entry.file_hash) {
        const valid = await this.crypto.verifyFileChecksum(fileData, entry.file_hash);
        if (!valid) {
          throw new Error(`Hash verification failed for ${entry.file_name}`);
        }
      }

      completed++;
      if (onProgress) {
        onProgress({
          percent: Math.round((completed / total) * 100),
          bytesDownloaded: completed,
          totalBytes: total,
        });
      }
    }
  }

  private async checkFileInCache(filePath: string, expectedHash?: string): Promise<boolean> {
    try {
      if (!(await exists(filePath, { baseDir: BASE_DIR }))) {
        return false;
      }

      if (!expectedHash) {
        return true;
      }

      const bytes = await readFile(filePath, { baseDir: BASE_DIR });
      const valid = await this.crypto.verifyFileChecksum(bytes, expectedHash);
      return valid;
    } catch {
      return false;
    }
  }

  async verifyBundleIntegrity(bundleId: string): Promise<boolean> {
    const wwwPath = `${this.storage.getBundlePath(bundleId)}/www/index.html`;

    try {
      return await exists(wwwPath, { baseDir: BASE_DIR });
    } catch {
      return false;
    }
  }
}
