/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/**
 * Bundle Manager
 * Handles bundle lifecycle, activation, and rollback
 */

import { appDataDir, join } from '@tauri-apps/api/path';
import type {
  BundleInfo,
  BundleId,
  CurrentBundleResult,
  BundleListResult,
  ListOptions,
  ResetOptions,
  UpdateFailedEvent,
} from '../shared/types';
import type { StorageManager } from './storage';
import type { DownloadManager } from './download-manager';
import { BUILTIN_BUNDLE_ID } from '../shared/constants';

export class BundleManager {
  private storage: StorageManager;
  private downloadManager: DownloadManager;
  private builtinVersion: string;
  private builtinPath: string;
  private autoDeleteFailed: boolean;
  private autoDeletePrevious: boolean;

  constructor(
    storage: StorageManager,
    downloadManager: DownloadManager,
    builtinVersion: string,
    builtinPath: string,
    autoDeleteFailed: boolean = true,
    autoDeletePrevious: boolean = true
  ) {
    this.storage = storage;
    this.downloadManager = downloadManager;
    this.builtinVersion = builtinVersion;
    this.builtinPath = builtinPath;
    this.autoDeleteFailed = autoDeleteFailed;
    this.autoDeletePrevious = autoDeletePrevious;
  }

  getBuiltinBundle(): BundleInfo {
    return {
      id: BUILTIN_BUNDLE_ID,
      version: this.builtinVersion,
      downloaded: '',
      checksum: '',
      status: 'success',
    };
  }

  async current(): Promise<CurrentBundleResult> {
    const currentId = this.storage.getCurrentBundleId();
    let bundle: BundleInfo;

    if (currentId === BUILTIN_BUNDLE_ID) {
      bundle = this.getBuiltinBundle();
    } else {
      bundle = this.storage.getBundle(currentId) ?? this.getBuiltinBundle();
    }

    return {
      bundle,
      native: this.builtinVersion,
    };
  }

  async list(options?: ListOptions): Promise<BundleListResult> {
    const bundles: BundleInfo[] = [];
    bundles.push(this.getBuiltinBundle());

    const storedBundles = this.storage.getAllBundles();

    if (options?.raw) {
      bundles.push(...storedBundles);
    } else {
      for (const bundle of storedBundles) {
        const exists = await this.storage.bundleExists(bundle.id);
        if (exists) {
          bundles.push(bundle);
        }
      }
    }

    return { bundles };
  }

  async getNextBundle(): Promise<BundleInfo | null> {
    const nextId = this.storage.getNextBundleId();
    if (!nextId) return null;
    return this.storage.getBundle(nextId) ?? null;
  }

  async next(options: BundleId): Promise<BundleInfo> {
    const bundle = this.storage.getBundle(options.id);
    if (!bundle) {
      throw new Error(`Bundle ${options.id} not found`);
    }

    if (bundle.status !== 'success') {
      throw new Error(`Bundle ${options.id} is not ready (status: ${bundle.status})`);
    }

    const valid = await this.downloadManager.verifyBundleIntegrity(options.id);
    if (!valid) {
      throw new Error(`Bundle ${options.id} failed integrity check`);
    }

    this.storage.setNextBundleId(options.id);
    await this.storage.save();

    return bundle;
  }

  async set(options: BundleId): Promise<BundleInfo> {
    const bundle = this.storage.getBundle(options.id);
    if (!bundle && options.id !== BUILTIN_BUNDLE_ID) {
      throw new Error(`Bundle ${options.id} not found`);
    }

    if (options.id !== BUILTIN_BUNDLE_ID) {
      const valid = await this.downloadManager.verifyBundleIntegrity(options.id);
      if (!valid) {
        throw new Error(`Bundle ${options.id} failed integrity check`);
      }
    }

    const previousId = this.storage.getCurrentBundleId();
    this.storage.setCurrentBundleId(options.id);
    this.storage.setNextBundleId(null);
    await this.storage.save();

    if (this.autoDeletePrevious && previousId !== BUILTIN_BUNDLE_ID && previousId !== options.id) {
      await this.deleteBundle({ id: previousId }).catch(() => {});
    }

    return bundle ?? this.getBuiltinBundle();
  }

  async deleteBundle(options: BundleId): Promise<void> {
    const currentId = this.storage.getCurrentBundleId();
    const nextId = this.storage.getNextBundleId();

    if (options.id === BUILTIN_BUNDLE_ID) {
      throw new Error('Cannot delete builtin bundle');
    }

    if (options.id === currentId) {
      throw new Error('Cannot delete currently active bundle');
    }

    if (options.id === nextId) {
      throw new Error('Cannot delete bundle set as next');
    }

    await this.storage.deleteBundleFiles(options.id);
    this.storage.deleteBundle(options.id);
    await this.storage.save();
  }

  async setBundleError(options: BundleId, allowManualBundleError: boolean): Promise<BundleInfo> {
    if (!allowManualBundleError) {
      throw new Error('setBundleError is only available when allowManualBundleError is true');
    }

    const bundle = this.storage.getBundle(options.id);
    if (!bundle) {
      throw new Error(`Bundle ${options.id} not found`);
    }

    bundle.status = 'error';
    this.storage.setBundle(options.id, bundle);

    if (this.autoDeleteFailed) {
      await this.deleteBundle(options).catch(() => {});
    }

    await this.storage.save();
    return bundle;
  }

  async reset(options?: ResetOptions): Promise<void> {
    let targetId: string;

    if (options?.toLastSuccessful) {
      targetId = this.storage.getLastSuccessfulBundleId() ?? BUILTIN_BUNDLE_ID;
    } else {
      targetId = BUILTIN_BUNDLE_ID;
    }

    this.storage.setCurrentBundleId(targetId);
    this.storage.setNextBundleId(null);
    await this.storage.save();
  }

  async getCurrentBundlePath(): Promise<string> {
    const currentId = this.storage.getCurrentBundleId();
    if (currentId === BUILTIN_BUNDLE_ID) {
      return this.builtinPath;
    }

    return this.getBundlePath(currentId);
  }

  async getBundlePath(bundleId: string): Promise<string> {
    if (bundleId === BUILTIN_BUNDLE_ID) {
      return this.builtinPath;
    }

    const base = await appDataDir();
    return join(base, this.storage.getBundlePath(bundleId), 'www', 'index.html');
  }

  async applyPendingUpdate(): Promise<{ applied: boolean; bundleId: string }> {
    const nextId = this.storage.getNextBundleId();
    const currentId = this.storage.getCurrentBundleId();

    if (!nextId || nextId === currentId) {
      return { applied: false, bundleId: currentId };
    }

    const bundle = this.storage.getBundle(nextId);
    if (!bundle) {
      this.storage.setNextBundleId(null);
      await this.storage.save();
      return { applied: false, bundleId: currentId };
    }

    const valid = await this.downloadManager.verifyBundleIntegrity(nextId);
    if (!valid) {
      bundle.status = 'error';
      this.storage.setBundle(nextId, bundle);
      this.storage.setNextBundleId(null);
      await this.storage.save();
      return { applied: false, bundleId: currentId };
    }

    const previousId = currentId;
    this.storage.setCurrentBundleId(nextId);
    this.storage.setNextBundleId(null);
    await this.storage.save();

    if (this.autoDeletePrevious && previousId !== BUILTIN_BUNDLE_ID) {
      await this.deleteBundle({ id: previousId }).catch(() => {});
    }

    return { applied: true, bundleId: nextId };
  }

  async markBundleSuccessful(): Promise<void> {
    const currentId = this.storage.getCurrentBundleId();
    this.storage.setLastSuccessfulBundleId(currentId);
    await this.storage.save();
  }

  async rollback(): Promise<BundleInfo> {
    const currentId = this.storage.getCurrentBundleId();
    const lastSuccessfulId = this.storage.getLastSuccessfulBundleId();
    const targetId = lastSuccessfulId ?? BUILTIN_BUNDLE_ID;

    if (currentId === targetId) {
      throw new Error('Already on last successful bundle');
    }

    this.storage.setCurrentBundleId(targetId);
    this.storage.setNextBundleId(null);
    await this.storage.save();

    return targetId === BUILTIN_BUNDLE_ID
      ? this.getBuiltinBundle()
      : (this.storage.getBundle(targetId) ?? this.getBuiltinBundle());
  }

  async getFailedUpdate(): Promise<UpdateFailedEvent | null> {
    return this.storage.getFailedUpdate();
  }
}
