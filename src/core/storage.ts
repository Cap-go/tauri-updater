/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/**
 * Storage Manager
 * Handles persistent storage for bundles and configuration
 */

import {
  BaseDirectory,
  exists,
  mkdir,
  readTextFile,
  writeTextFile,
  remove,
} from '@tauri-apps/plugin-fs';
import type {
  StorageData,
  BundleManifest,
  BundleInfo,
  DelayCondition,
  UpdateFailedEvent,
} from '../shared/types';
import { BUNDLES_DIR, STORAGE_FILE, BUILTIN_BUNDLE_ID } from '../shared/constants';

const BASE_DIR = BaseDirectory.AppLocalData;
const ROOT_DIR = 'capgo-updater';

export class StorageManager {
  private data: StorageData | null = null;

  async initialize(): Promise<void> {
    await this.ensureDirectories();
    this.data = await this.loadStorage();
  }

  private async ensureDirectories(): Promise<void> {
    await mkdir(ROOT_DIR, { baseDir: BASE_DIR, recursive: true });
    await mkdir(this.getBundlesPath(), { baseDir: BASE_DIR, recursive: true });
  }

  private async loadStorage(): Promise<StorageData> {
    try {
      if (await exists(this.getStoragePath(), { baseDir: BASE_DIR })) {
        const rawData = await readTextFile(this.getStoragePath(), { baseDir: BASE_DIR });
        const data = JSON.parse(rawData) as StorageData;
        return data;
      }
    } catch (error) {
      console.error('Failed to load storage:', error);
    }

    return this.createDefaultStorage();
  }

  private createDefaultStorage(): StorageData {
    const deviceId = crypto.randomUUID();
    return {
      deviceId,
      manifest: this.createDefaultManifest(),
    };
  }

  private createDefaultManifest(): BundleManifest {
    return {
      bundles: {},
      currentBundleId: BUILTIN_BUNDLE_ID,
      nextBundleId: null,
      lastSuccessfulBundleId: null,
      failedUpdate: null,
      delayConditions: [],
      customId: null,
      channel: null,
    };
  }

  private getStoragePath(): string {
    return `${ROOT_DIR}/${STORAGE_FILE}`;
  }

  getBundlesPath(): string {
    return `${ROOT_DIR}/${BUNDLES_DIR}`;
  }

  getBundlePath(bundleId: string): string {
    return `${this.getBundlesPath()}/${bundleId}`;
  }

  async save(): Promise<void> {
    if (!this.data) return;
    await writeTextFile(this.getStoragePath(), JSON.stringify(this.data, null, 2), {
      baseDir: BASE_DIR,
    });
  }

  // Device ID
  getDeviceId(): string {
    return this.data?.deviceId ?? '';
  }

  // Bundle Management
  getManifest(): BundleManifest {
    return this.data?.manifest ?? this.createDefaultManifest();
  }

  setManifest(manifest: BundleManifest): void {
    if (this.data) {
      this.data.manifest = manifest;
    }
  }

  getBundle(bundleId: string): BundleInfo | null {
    return this.data?.manifest.bundles[bundleId] ?? null;
  }

  setBundle(bundleId: string, bundle: BundleInfo): void {
    if (this.data) {
      this.data.manifest.bundles[bundleId] = bundle;
    }
  }

  deleteBundle(bundleId: string): void {
    if (this.data) {
      delete this.data.manifest.bundles[bundleId];
    }
  }

  getAllBundles(): BundleInfo[] {
    return Object.values(this.data?.manifest.bundles ?? {});
  }

  async bundleExists(bundleId: string): Promise<boolean> {
    const wwwPath = `${this.getBundlePath(bundleId)}/www/index.html`;
    return exists(wwwPath, { baseDir: BASE_DIR });
  }

  async deleteBundleFiles(bundleId: string): Promise<void> {
    const bundlePath = this.getBundlePath(bundleId);
    await remove(bundlePath, { baseDir: BASE_DIR, recursive: true });
  }

  // Current Bundle
  getCurrentBundleId(): string {
    return this.data?.manifest.currentBundleId ?? BUILTIN_BUNDLE_ID;
  }

  setCurrentBundleId(bundleId: string): void {
    if (this.data) {
      this.data.manifest.currentBundleId = bundleId;
    }
  }

  // Next Bundle
  getNextBundleId(): string | null {
    return this.data?.manifest.nextBundleId ?? null;
  }

  setNextBundleId(bundleId: string | null): void {
    if (this.data) {
      this.data.manifest.nextBundleId = bundleId;
    }
  }

  // Last Successful Bundle
  getLastSuccessfulBundleId(): string | null {
    return this.data?.manifest.lastSuccessfulBundleId ?? null;
  }

  setLastSuccessfulBundleId(bundleId: string | null): void {
    if (this.data) {
      this.data.manifest.lastSuccessfulBundleId = bundleId;
    }
  }

  // Failed Update
  getFailedUpdate(): UpdateFailedEvent | null {
    return this.data?.manifest.failedUpdate ?? null;
  }

  setFailedUpdate(update: UpdateFailedEvent | null): void {
    if (this.data) {
      this.data.manifest.failedUpdate = update;
    }
  }

  clearFailedUpdate(): UpdateFailedEvent | null {
    const failed = this.getFailedUpdate();
    this.setFailedUpdate(null);
    return failed;
  }

  // Delay Conditions
  getDelayConditions(): DelayCondition[] {
    return this.data?.manifest.delayConditions ?? [];
  }

  setDelayConditions(conditions: DelayCondition[]): void {
    if (this.data) {
      this.data.manifest.delayConditions = conditions;
    }
  }

  clearDelayConditions(): void {
    if (this.data) {
      this.data.manifest.delayConditions = [];
    }
  }

  // Custom ID
  getCustomId(): string | null {
    return this.data?.manifest.customId ?? null;
  }

  setCustomId(customId: string | null): void {
    if (this.data) {
      this.data.manifest.customId = customId;
    }
  }

  // Channel
  getChannel(): string | null {
    return this.data?.manifest.channel ?? null;
  }

  setChannel(channel: string | null): void {
    if (this.data) {
      this.data.manifest.channel = channel;
    }
  }

  // Dynamic URLs & App ID
  getUpdateUrl(): string | undefined {
    return this.data?.updateUrl;
  }

  setUpdateUrl(url: string): void {
    if (this.data) {
      this.data.updateUrl = url;
    }
  }

  getStatsUrl(): string | undefined {
    return this.data?.statsUrl;
  }

  setStatsUrl(url: string): void {
    if (this.data) {
      this.data.statsUrl = url;
    }
  }

  getChannelUrl(): string | undefined {
    return this.data?.channelUrl;
  }

  setChannelUrl(url: string): void {
    if (this.data) {
      this.data.channelUrl = url;
    }
  }

  getAppId(): string | undefined {
    return this.data?.appId;
  }

  setAppId(appId: string): void {
    if (this.data) {
      this.data.appId = appId;
    }
  }
}
