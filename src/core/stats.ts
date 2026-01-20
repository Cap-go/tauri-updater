/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { fetch as httpFetch } from '@tauri-apps/plugin-http';
import type { StorageManager } from './storage';
import { STATS_EVENTS } from '../shared/constants';

export type StatsEventType = (typeof STATS_EVENTS)[keyof typeof STATS_EVENTS];

export interface StatsPayload {
  event: StatsEventType;
  version?: string;
  oldVersion?: string;
  bundleId?: string;
  message?: string;
}

export class StatsManager {
  private storage: StorageManager;
  private statsUrl: string;
  private appId: string;
  private deviceId: string;
  private pluginVersion: string;
  private versionBuild: string;
  private keyId?: string;
  private defaultChannel?: string;
  private platform: string = 'android';
  private timeout: number;
  private enabled: boolean = true;
  private userAgent: string;
  private isProd: boolean;

  constructor(
    storage: StorageManager,
    statsUrl: string,
    appId: string,
    deviceId: string,
    pluginVersion: string,
    versionBuild: string,
    isProd: boolean,
    defaultChannel?: string,
    keyId?: string,
    timeout: number = 20000
  ) {
    this.storage = storage;
    this.statsUrl = statsUrl;
    this.appId = appId;
    this.deviceId = deviceId;
    this.pluginVersion = pluginVersion;
    this.versionBuild = versionBuild;
    this.keyId = keyId;
    this.defaultChannel = defaultChannel;
    this.timeout = timeout;
    this.isProd = isProd;
    this.userAgent = `CapacitorUpdater/${this.pluginVersion} (${this.appId || 'missing-app-id'}) tauri/${navigator.userAgent}`;

    this.enabled = statsUrl.length > 0;
  }

  setStatsUrl(url: string): void {
    this.statsUrl = url;
    this.enabled = url.length > 0;
  }

  setAppId(appId: string): void {
    this.appId = appId;
  }

  async sendEvent(payload: StatsPayload): Promise<void> {
    if (!this.enabled) return;

    try {
      await this.makeRequest(payload);
    } catch (error) {
      console.warn('Failed to send stats:', error);
    }
  }

  async sendDownloadComplete(version: string, bundleId: string): Promise<void> {
    await this.sendEvent({ event: STATS_EVENTS.DOWNLOAD_COMPLETE, version, bundleId });
  }

  async sendDownloadFailed(version: string, message: string): Promise<void> {
    await this.sendEvent({ event: STATS_EVENTS.DOWNLOAD_FAILED, version, message });
  }

  async sendUpdateSuccess(version: string, bundleId: string): Promise<void> {
    await this.sendEvent({ event: STATS_EVENTS.UPDATE_SUCCESS, version, bundleId });
  }

  async sendUpdateFailed(version: string, bundleId: string, message: string): Promise<void> {
    await this.sendEvent({ event: STATS_EVENTS.UPDATE_FAILED, version, bundleId, message });
  }

  private async makeRequest(payload: StatsPayload): Promise<void> {
    const url = new URL(this.statsUrl);
    const channel = this.storage.getChannel();
    const info = this.buildInfoPayload(payload.version ?? this.getCurrentBundleVersion(), channel ?? this.defaultChannel);

    const response = await httpFetch(url.toString(), {
      method: 'POST',
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': this.userAgent,
      },
      body: JSON.stringify({
        ...info,
        action: payload.event,
        version_name: info.version_name,
        old_version_name: payload.oldVersion ?? '',
        bundle_id: payload.bundleId,
        message: payload.message,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  }

  private getCurrentBundleVersion(): string {
    const currentId = this.storage.getCurrentBundleId();
    const bundle = this.storage.getBundle(currentId);
    return bundle?.version ?? '';
  }

  private buildInfoPayload(versionName: string, channel?: string | null) {
    return {
      platform: this.platform,
      device_id: this.deviceId,
      app_id: this.appId,
      custom_id: this.storage.getCustomId() ?? undefined,
      version_build: this.versionBuild,
      version_code: this.versionBuild,
      version_os: navigator.userAgent,
      version_name: versionName,
      plugin_version: this.pluginVersion,
      is_emulator: false,
      is_prod: this.isProd,
      defaultChannel: channel ?? this.defaultChannel,
      key_id: this.keyId,
    };
  }
}
