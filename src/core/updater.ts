/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/**
 * Tauri Updater
 * Main class that coordinates all update functionality
 */

import { getVersion } from '@tauri-apps/api/app';
import { convertFileSrc } from '@tauri-apps/api/core';
import { fetch as httpFetch } from '@tauri-apps/plugin-http';
import {
  DEFAULT_CONFIG,
  PLUGIN_VERSION,
  MIN_PERIOD_CHECK_DELAY,
} from '../shared/constants';
import type {
  TauriUpdaterConfig,
  BundleInfo,
  BundleId,
  CurrentBundleResult,
  BundleListResult,
  ListOptions,
  ResetOptions,
  DownloadOptions,
  LatestVersion,
  GetLatestOptions,
  BuiltinVersion,
  AppReadyResult,
  MultiDelayConditions,
  SetChannelOptions,
  UnsetChannelOptions,
  ChannelRes,
  GetChannelRes,
  ListChannelsResult,
  DeviceId,
  SetCustomIdOptions,
  PluginVersion,
  AutoUpdateEnabled,
  AutoUpdateAvailable,
  UpdateUrl,
  StatsUrl,
  ChannelUrl,
  SetAppIdOptions,
  GetAppIdRes,
  SetDebugMenuOptions,
  DebugMenuEnabled,
  UpdateFailedEvent,
  UpdaterEventName,
  UpdaterEventCallback,
  ListenerHandle,
  DownloadEvent,
} from '../shared/types';
import { UpdaterEventEmitter } from '../shared/events';
import { StorageManager } from './storage';
import { CryptoManager } from './crypto';
import { DownloadManager } from './download-manager';
import { BundleManager } from './bundle-manager';
import { DelayManager } from './delay-manager';
import { ChannelManager } from './channel-manager';
import { StatsManager } from './stats';
import { DeviceManager } from './device';
import { DebugMenu } from './debug-menu';

const KEY_ID_LENGTH = 20;

interface LatestRequestPayload {
  platform: string;
  device_id: string;
  app_id: string;
  custom_id?: string | null;
  version_build: string;
  version_code: string;
  version_os: string;
  version_name: string;
  plugin_version: string;
  is_emulator: boolean;
  is_prod: boolean;
  defaultChannel?: string;
  key_id?: string;
}

export class TauriUpdater {
  private config: Required<TauriUpdaterConfig>;
  private storage!: StorageManager;
  private crypto!: CryptoManager;
  private downloadManager!: DownloadManager;
  private bundleManager!: BundleManager;
  private delayManager!: DelayManager;
  private channelManager!: ChannelManager;
  private statsManager!: StatsManager;
  private deviceManager!: DeviceManager;
  private debugMenu!: DebugMenu;
  private eventEmitter: UpdaterEventEmitter;

  private initialized: boolean = false;
  private appReadyReceived: boolean = false;
  private appReadyTimeout: number | null = null;
  private periodCheckInterval: number | null = null;
  private builtinPath: string = '';

  constructor(config: TauriUpdaterConfig = {}) {
    this.config = this.mergeConfig(config);
    this.eventEmitter = new UpdaterEventEmitter();
  }

  private mergeConfig(config: TauriUpdaterConfig): Required<TauriUpdaterConfig> {
    return {
      appReadyTimeout: config.appReadyTimeout ?? DEFAULT_CONFIG.appReadyTimeout,
      responseTimeout: config.responseTimeout ?? DEFAULT_CONFIG.responseTimeout,
      autoUpdate: config.autoUpdate ?? DEFAULT_CONFIG.autoUpdate,
      autoDeleteFailed: config.autoDeleteFailed ?? DEFAULT_CONFIG.autoDeleteFailed,
      autoDeletePrevious: config.autoDeletePrevious ?? DEFAULT_CONFIG.autoDeletePrevious,
      resetWhenUpdate: config.resetWhenUpdate ?? DEFAULT_CONFIG.resetWhenUpdate,
      updateUrl: config.updateUrl ?? DEFAULT_CONFIG.updateUrl,
      channelUrl: config.channelUrl ?? DEFAULT_CONFIG.channelUrl,
      statsUrl: config.statsUrl ?? DEFAULT_CONFIG.statsUrl,
      publicKey: config.publicKey ?? '',
      version: config.version ?? '0.0.0',
      appId: config.appId ?? '',
      directUpdate: config.directUpdate ?? DEFAULT_CONFIG.directUpdate,
      defaultChannel: config.defaultChannel ?? '',
      allowModifyUrl: config.allowModifyUrl ?? DEFAULT_CONFIG.allowModifyUrl,
      allowModifyAppId: config.allowModifyAppId ?? DEFAULT_CONFIG.allowModifyAppId,
      allowManualBundleError: config.allowManualBundleError ?? DEFAULT_CONFIG.allowManualBundleError,
      persistCustomId: config.persistCustomId ?? DEFAULT_CONFIG.persistCustomId,
      persistModifyUrl: config.persistModifyUrl ?? DEFAULT_CONFIG.persistModifyUrl,
      keepUrlPathAfterReload: config.keepUrlPathAfterReload ?? DEFAULT_CONFIG.keepUrlPathAfterReload,
      disableJSLogging: config.disableJSLogging ?? DEFAULT_CONFIG.disableJSLogging,
      debugMenu: config.debugMenu ?? DEFAULT_CONFIG.debugMenu,
      periodCheckDelay: config.periodCheckDelay ?? DEFAULT_CONFIG.periodCheckDelay,
      localS3: config.localS3 ?? false,
      localHost: config.localHost ?? '',
      localWebHost: config.localWebHost ?? '',
      localSupa: config.localSupa ?? '',
      localSupaAnon: config.localSupaAnon ?? '',
      localApi: config.localApi ?? '',
      localApiFiles: config.localApiFiles ?? '',
    };
  }

  async initialize(builtinPath?: string): Promise<void> {
    if (this.initialized) return;

    this.builtinPath = builtinPath ?? window.location.href;

    this.storage = new StorageManager();
    await this.storage.initialize();

    if (this.config.persistModifyUrl) {
      const savedUpdateUrl = this.storage.getUpdateUrl();
      const savedStatsUrl = this.storage.getStatsUrl();
      const savedChannelUrl = this.storage.getChannelUrl();
      const savedAppId = this.storage.getAppId();

      if (savedUpdateUrl) this.config.updateUrl = savedUpdateUrl;
      if (savedStatsUrl !== undefined) this.config.statsUrl = savedStatsUrl;
      if (savedChannelUrl) this.config.channelUrl = savedChannelUrl;
      if (savedAppId) this.config.appId = savedAppId;
    }

    this.crypto = new CryptoManager();
    if (this.config.publicKey) {
      this.crypto.setPublicKey(this.config.publicKey);
    }

    const appVersion = await getVersion();
    if (!this.config.version || this.config.version === '0.0.0') {
      this.config.version = appVersion;
    }

    this.downloadManager = new DownloadManager(
      this.storage,
      this.crypto,
      this.config.responseTimeout * 1000
    );

    this.bundleManager = new BundleManager(
      this.storage,
      this.downloadManager,
      this.config.version,
      this.builtinPath,
      this.config.autoDeleteFailed,
      this.config.autoDeletePrevious
    );

    this.delayManager = new DelayManager(this.storage, this.config.version);
    this.delayManager.onAppStart();

    const keyId = this.generateKeyId(this.crypto.getPublicKey());
    const isProd = Boolean((import.meta as unknown as { env?: { PROD?: boolean } }).env?.PROD ?? true);

    this.channelManager = new ChannelManager(
      this.storage,
      this.config.channelUrl,
      this.config.appId,
      this.storage.getDeviceId(),
      PLUGIN_VERSION,
      this.config.version,
      this.config.defaultChannel,
      keyId,
      this.config.responseTimeout * 1000
    );

    this.statsManager = new StatsManager(
      this.storage,
      this.config.statsUrl,
      this.config.appId,
      this.storage.getDeviceId(),
      PLUGIN_VERSION,
      this.config.version,
      isProd,
      this.config.defaultChannel,
      keyId,
      this.config.responseTimeout * 1000
    );

    this.deviceManager = new DeviceManager(this.storage, this.config.persistCustomId);

    this.debugMenu = new DebugMenu(this.config.debugMenu);

    this.setupWindowListeners();
    this.startPeriodicChecks();

    this.initialized = true;

    if (!this.config.disableJSLogging) {
      console.log('[TauriUpdater] Initialized');
    }
  }

  addListener(event: UpdaterEventName, callback: UpdaterEventCallback<unknown>): ListenerHandle {
    return this.eventEmitter.addListener(event, callback);
  }

  removeAllListeners(): void {
    this.eventEmitter.removeAllListeners();
  }

  private setupWindowListeners(): void {
    window.addEventListener('blur', () => {
      this.delayManager.onBackground();
      this.checkAndApplyPendingUpdate();
    });

    window.addEventListener('focus', () => {
      this.delayManager.onForeground();
    });
  }

  private async checkAndApplyPendingUpdate(): Promise<void> {
    const nextBundle = await this.bundleManager.getNextBundle();
    if (!nextBundle) return;

    if (this.delayManager.areConditionsSatisfied()) {
      const result = await this.bundleManager.applyPendingUpdate();
      if (result.applied) {
        this.delayManager.resetKillState();
        await this.storage.save();
        this.eventEmitter.emit('appReloaded', undefined);
        await this.reload();
      }
    }
  }

  private startPeriodicChecks(): void {
    if (this.periodCheckInterval) {
      clearInterval(this.periodCheckInterval);
    }

    if (this.config.periodCheckDelay >= MIN_PERIOD_CHECK_DELAY && this.config.autoUpdate) {
      this.periodCheckInterval = window.setInterval(
        () => this.checkForUpdates(),
        this.config.periodCheckDelay * 1000
      );
    }
  }

  private async checkForUpdates(): Promise<void> {
    if (!this.config.autoUpdate) return;

    try {
      const latest = await this.getLatest();

      if (latest.error === 'no_new_version_available') {
        const current = await this.current();
        this.eventEmitter.emit('noNeedUpdate', { bundle: current.bundle });
        return;
      }

      if (latest.url && latest.version) {
        this.eventEmitter.emit('updateAvailable', {
          bundle: {
            id: '',
            version: latest.version,
            downloaded: '',
            checksum: latest.checksum ?? '',
            status: 'pending',
          },
        });

        if (latest.breaking) {
          this.eventEmitter.emit('breakingAvailable', { version: latest.version });
          this.eventEmitter.emit('majorAvailable', { version: latest.version });
        }

        const bundle = await this.download({
          url: latest.url,
          version: latest.version,
          checksum: latest.checksum,
          sessionKey: latest.sessionKey,
          manifest: latest.manifest,
        });

        if (this.shouldDirectUpdate()) {
          await this.set({ id: bundle.id });
        } else {
          await this.next({ id: bundle.id });
        }
      }
    } catch (error) {
      if (!this.config.disableJSLogging) {
        console.error('[TauriUpdater] Auto-update check failed:', error);
      }
    }
  }

  private shouldDirectUpdate(): boolean {
    if (this.config.directUpdate === true || this.config.directUpdate === 'always') {
      return true;
    }
    return false;
  }

  // ==========================================================================
  // Core Methods
  // ==========================================================================

  async notifyAppReady(): Promise<AppReadyResult> {
    if (this.appReadyTimeout) {
      clearTimeout(this.appReadyTimeout);
      this.appReadyTimeout = null;
    }

    this.appReadyReceived = true;
    await this.bundleManager.markBundleSuccessful();

    const current = await this.current();
    await this.statsManager.sendUpdateSuccess(current.bundle.version, current.bundle.id);

    this.eventEmitter.emit('appReady', { bundle: current.bundle, status: 'ok' });

    return { bundle: current.bundle };
  }

  async download(options: DownloadOptions): Promise<BundleInfo> {
    try {
      const bundle = await this.downloadManager.downloadBundle(options, (event: DownloadEvent) => {
        this.eventEmitter.emit('download', event);
      });

      await this.statsManager.sendDownloadComplete(options.version, bundle.id);
      return bundle;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await this.statsManager.sendDownloadFailed(options.version, message);
      this.eventEmitter.emit('downloadFailed', { version: options.version });
      throw error;
    }
  }

  async next(options: BundleId): Promise<BundleInfo> {
    return this.bundleManager.next(options);
  }

  async set(options: BundleId): Promise<void> {
    await this.bundleManager.set(options);
    await this.reload();
  }

  async reload(): Promise<void> {
    const bundlePath = await this.bundleManager.getCurrentBundlePath();

    this.appReadyReceived = false;
    this.appReadyTimeout = window.setTimeout(async () => {
      if (!this.appReadyReceived) {
        if (!this.config.disableJSLogging) {
          console.warn('[TauriUpdater] App ready timeout - rolling back');
        }

        const current = await this.current();
        await this.statsManager.sendUpdateFailed(
          current.bundle.version,
          current.bundle.id,
          'App ready timeout'
        );

        this.eventEmitter.emit('updateFailed', { bundle: current.bundle });

        const newPath = await this.bundleManager.getCurrentBundlePath();
        window.location.href = this.toFileUrl(newPath);
      }
    }, this.config.appReadyTimeout);

    this.eventEmitter.emit('appReloaded', undefined);

    if (this.config.keepUrlPathAfterReload) {
      const currentPath = window.location.pathname + window.location.search + window.location.hash;
      const nextPath = this.toFileUrl(bundlePath);
      window.location.href = `${nextPath}${currentPath}`;
    } else {
      window.location.href = this.toFileUrl(bundlePath);
    }
  }

  async delete(options: BundleId): Promise<void> {
    return this.bundleManager.deleteBundle(options);
  }

  async setBundleError(options: BundleId): Promise<BundleInfo> {
    return this.bundleManager.setBundleError(options, this.config.allowManualBundleError);
  }

  async current(): Promise<CurrentBundleResult> {
    return this.bundleManager.current();
  }

  async list(options?: ListOptions): Promise<BundleListResult> {
    return this.bundleManager.list(options);
  }

  async getNextBundle(): Promise<BundleInfo | null> {
    return this.bundleManager.getNextBundle();
  }

  async getFailedUpdate(): Promise<UpdateFailedEvent | null> {
    return this.bundleManager.getFailedUpdate();
  }

  async reset(options?: ResetOptions): Promise<void> {
    await this.bundleManager.reset(options);
    await this.reload();
  }

  async getLatest(options?: GetLatestOptions): Promise<LatestVersion> {
    const current = await this.current();
    const channel = options?.channel ?? this.channelManager.getEffectiveChannel();

    const url = new URL(this.config.updateUrl);
    const customId = this.storage.getCustomId();
    const publicKey = this.crypto.getPublicKey();
    const keyId = this.generateKeyId(publicKey);

    const appVersion = await getVersion();

    const payload: LatestRequestPayload = {
      platform: 'tauri',
      device_id: this.storage.getDeviceId(),
      app_id: this.config.appId,
      custom_id: customId,
      version_build: this.config.version,
      version_code: appVersion,
      version_os: navigator.userAgent,
      version_name: current.bundle.version,
      plugin_version: PLUGIN_VERSION,
      is_emulator: false,
      is_prod: Boolean((import.meta as unknown as { env?: { PROD?: boolean } }).env?.PROD ?? true),
      defaultChannel: channel ?? this.config.defaultChannel,
      key_id: keyId,
    };

    try {
      const response = await httpFetch(url.toString(), {
        method: 'POST',
        timeout: this.config.responseTimeout * 1000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': this.buildUserAgent(),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return (await response.json()) as LatestVersion;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { version: '', error: message };
    }
  }

  private generateKeyId(publicKey: string | null): string | undefined {
    if (!publicKey) return undefined;

    const cleaned = publicKey
      .replace(/-----BEGIN [^-]+-----/g, '')
      .replace(/-----END [^-]+-----/g, '')
      .replace(/\s+/g, '');

    if (!cleaned.length) return undefined;

    return cleaned.slice(0, KEY_ID_LENGTH);
  }

  private buildUserAgent(): string {
    const appId = this.config.appId || 'missing-app-id';
    return `CapacitorUpdater/${PLUGIN_VERSION} (${appId}) tauri/${navigator.userAgent}`;
  }

  async getBuiltinVersion(): Promise<BuiltinVersion> {
    return { version: this.config.version };
  }

  async setMultiDelay(options: MultiDelayConditions): Promise<void> {
    return this.delayManager.setMultiDelay(options);
  }

  async cancelDelay(): Promise<void> {
    return this.delayManager.cancelDelay();
  }

  async setChannel(options: SetChannelOptions): Promise<ChannelRes> {
    const result = await this.channelManager.setChannel(options);

    if (options.triggerAutoUpdate && this.config.autoUpdate) {
      this.checkForUpdates();
    }

    return result;
  }

  async unsetChannel(options?: UnsetChannelOptions): Promise<void> {
    await this.channelManager.unsetChannel(options);

    if (options?.triggerAutoUpdate && this.config.autoUpdate) {
      this.checkForUpdates();
    }
  }

  async getChannel(): Promise<GetChannelRes> {
    return this.channelManager.getChannel();
  }

  async listChannels(): Promise<ListChannelsResult> {
    return this.channelManager.listChannels();
  }

  async getDeviceId(): Promise<DeviceId> {
    return this.deviceManager.getDeviceId();
  }

  async setCustomId(options: SetCustomIdOptions): Promise<void> {
    return this.deviceManager.setCustomId(options);
  }

  async getPluginVersion(): Promise<PluginVersion> {
    return { version: PLUGIN_VERSION };
  }

  async isAutoUpdateEnabled(): Promise<AutoUpdateEnabled> {
    return { enabled: this.config.autoUpdate };
  }

  async isAutoUpdateAvailable(): Promise<AutoUpdateAvailable> {
    return { available: this.config.updateUrl === DEFAULT_CONFIG.updateUrl };
  }

  async setUpdateUrl(options: UpdateUrl): Promise<void> {
    if (!this.config.allowModifyUrl) {
      throw new Error('URL modification not allowed');
    }

    this.config.updateUrl = options.url;

    if (this.config.persistModifyUrl) {
      this.storage.setUpdateUrl(options.url);
      await this.storage.save();
    }
  }

  async setStatsUrl(options: StatsUrl): Promise<void> {
    if (!this.config.allowModifyUrl) {
      throw new Error('URL modification not allowed');
    }

    this.config.statsUrl = options.url;
    this.statsManager.setStatsUrl(options.url);

    if (this.config.persistModifyUrl) {
      this.storage.setStatsUrl(options.url);
      await this.storage.save();
    }
  }

  async setChannelUrl(options: ChannelUrl): Promise<void> {
    if (!this.config.allowModifyUrl) {
      throw new Error('URL modification not allowed');
    }

    this.config.channelUrl = options.url;
    this.channelManager.setChannelUrl(options.url);

    if (this.config.persistModifyUrl) {
      this.storage.setChannelUrl(options.url);
      await this.storage.save();
    }
  }

  async setAppId(options: SetAppIdOptions): Promise<void> {
    if (!this.config.allowModifyAppId) {
      throw new Error('App ID modification not allowed');
    }

    this.config.appId = options.appId;
    this.channelManager.setAppId(options.appId);
    this.statsManager.setAppId(options.appId);

    if (this.config.persistModifyUrl) {
      this.storage.setAppId(options.appId);
      await this.storage.save();
    }
  }

  async getAppId(): Promise<GetAppIdRes> {
    return { appId: this.config.appId };
  }

  async setDebugMenu(options: SetDebugMenuOptions): Promise<void> {
    this.debugMenu.setEnabled(options.enabled);
  }

  async isDebugMenuEnabled(): Promise<DebugMenuEnabled> {
    return { enabled: this.debugMenu.isEnabled() };
  }

  private toFileUrl(path: string): string {
    if (path.startsWith('http') || path.startsWith('app://')) {
      return path;
    }

    try {
      return convertFileSrc(path);
    } catch {
      return `file://${path}`;
    }
  }
}
