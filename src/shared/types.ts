/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/**
 * Tauri Updater Types
 * 100% feature parity with capacitor-updater
 */

// ============================================================================
// Bundle Types
// ============================================================================

export type BundleStatus = 'pending' | 'downloading' | 'success' | 'error';

export interface BundleInfo {
  /** Unique bundle identifier */
  id: string;
  /** Version name/code */
  version: string;
  /** Download timestamp (ISO string) */
  downloaded: string;
  /** Bundle checksum (SHA256) */
  checksum: string;
  /** Current status */
  status: BundleStatus;
}

export interface BundleId {
  /** Bundle ID to operate on */
  id: string;
}

export interface CurrentBundleResult {
  /** Currently active bundle */
  bundle: BundleInfo;
  /** Builtin bundle version (shipped with app) */
  native: string;
}

export interface BundleListResult {
  /** Array of all locally downloaded bundles */
  bundles: BundleInfo[];
}

export interface ListOptions {
  /** Read from database instead of disk (default: false) */
  raw?: boolean;
}

// ============================================================================
// Download Types
// ============================================================================

export interface DownloadOptions {
  /** Bundle download URL */
  url: string;
  /** Version identifier */
  version: string;
  /** Encryption session key (optional) */
  sessionKey?: string;
  /** SHA256 checksum (optional) */
  checksum?: string;
  /** Array of ManifestEntry for partial updates (optional) */
  manifest?: ManifestEntry[];
}

export interface ManifestEntry {
  /** File name */
  file_name: string | null;
  /** File hash */
  file_hash: string | null;
  /** Download URL */
  download_url: string | null;
}

// ============================================================================
// Update Types
// ============================================================================

export interface LatestVersion {
  /** Latest version identifier */
  version: string;
  /** Download URL */
  url?: string;
  /** Bundle checksum */
  checksum?: string;
  /** Incompatible update flag */
  breaking?: boolean;
  /** @deprecated Use breaking instead */
  major?: boolean;
  /** Optional server message */
  message?: string;
  /** Encryption session key */
  sessionKey?: string;
  /** Error code (e.g., "no_new_version_available") */
  error?: string;
  /** Current version on device */
  old?: string;
  /** File list for partial updates */
  manifest?: ManifestEntry[];
}

export interface GetLatestOptions {
  /** Specific channel to check */
  channel?: string;
}

export interface BuiltinVersion {
  /** Version of bundle shipped with app */
  version: string;
}

export interface AppReadyResult {
  /** Current bundle information */
  bundle: BundleInfo;
}

export interface ResetOptions {
  /** Reset to last successful bundle instead of builtin */
  toLastSuccessful?: boolean;
}

// ============================================================================
// Delay Types
// ============================================================================

export type DelayConditionKind = 'background' | 'kill' | 'date' | 'nativeVersion';

export interface DelayCondition {
  /** Type of delay condition */
  kind: DelayConditionKind;
  /** Value for the condition (milliseconds, ISO date, or version string) */
  value?: string;
}

export interface MultiDelayConditions {
  /** Array of delay conditions (all must be satisfied) */
  delayConditions: DelayCondition[];
}

// ============================================================================
// Channel Types
// ============================================================================

export interface SetChannelOptions {
  /** Channel name */
  channel: string;
  /** Trigger immediate auto-update check */
  triggerAutoUpdate?: boolean;
}

export interface UnsetChannelOptions {
  /** Trigger immediate auto-update check */
  triggerAutoUpdate?: boolean;
}

export interface ChannelRes {
  /** Operation status */
  status: string;
  /** Error message if any */
  error?: string;
  /** Additional message */
  message?: string;
}

export interface GetChannelRes {
  /** Currently assigned channel name */
  channel?: string;
  /** Whether channel allows self-assignment */
  allowSet?: boolean;
  /** Operation status */
  status: string;
  /** Error message if any */
  error?: string;
  /** Additional message */
  message?: string;
}

export interface ChannelInfo {
  /** Channel unique identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Public visibility flag */
  public: boolean;
  /** Self-assignable flag */
  allow_self_set: boolean;
}

export interface ListChannelsResult {
  /** Array of available channels */
  channels: ChannelInfo[];
}

// ============================================================================
// Device Types
// ============================================================================

export interface DeviceId {
  /** Unique device identifier (UUID) */
  deviceId: string;
}

export interface SetCustomIdOptions {
  /** Custom identifier to set (empty string to clear) */
  customId: string;
}

// ============================================================================
// URL Configuration Types
// ============================================================================

export interface UpdateUrl {
  /** Update server URL */
  url: string;
}

export interface StatsUrl {
  /** Statistics URL (empty string to disable) */
  url: string;
}

export interface ChannelUrl {
  /** Channel operations URL */
  url: string;
}

export interface SetAppIdOptions {
  /** App ID for update server */
  appId: string;
}

export interface GetAppIdRes {
  /** Current App ID */
  appId: string;
}

// ============================================================================
// Plugin Info Types
// ============================================================================

export interface PluginVersion {
  /** Plugin version string */
  version: string;
}

export interface AutoUpdateEnabled {
  /** Whether auto-update mode is enabled */
  enabled: boolean;
}

export interface AutoUpdateAvailable {
  /** Whether auto-update is available */
  available: boolean;
}

// ============================================================================
// Debug Types
// ============================================================================

export interface SetDebugMenuOptions {
  /** Enable/disable debug menu */
  enabled: boolean;
}

export interface DebugMenuEnabled {
  /** Current debug menu state */
  enabled: boolean;
}

// ============================================================================
// Event Types
// ============================================================================

export interface DownloadEvent {
  /** Download progress (0-100) */
  percent: number;
  /** Current bundle info */
  bundle: BundleInfo;
}

export interface UpdateAvailableEvent {
  /** Available bundle info */
  bundle: BundleInfo;
}

export interface NoNeedEvent {
  /** Current bundle info */
  bundle: BundleInfo;
}

export interface DownloadCompleteEvent {
  /** Downloaded bundle info */
  bundle: BundleInfo;
}

export interface DownloadFailedEvent {
  /** Failed version identifier */
  version: string;
}

export interface BreakingAvailableEvent {
  /** Breaking version identifier */
  version: string;
}

/** @deprecated Use BreakingAvailableEvent */
export type MajorAvailableEvent = BreakingAvailableEvent;

export interface UpdateFailedEvent {
  /** Failed bundle info */
  bundle: BundleInfo;
}

export interface AppReadyEvent {
  /** Current bundle info */
  bundle: BundleInfo;
  /** Operation status */
  status: string;
}

// ============================================================================
// Listener Types
// ============================================================================

export type UpdaterEventName =
  | 'download'
  | 'updateAvailable'
  | 'noNeedUpdate'
  | 'downloadComplete'
  | 'downloadFailed'
  | 'breakingAvailable'
  | 'majorAvailable'
  | 'updateFailed'
  | 'appReloaded'
  | 'appReady';

export interface ListenerHandle {
  /** Remove this listener */
  remove: () => void;
}

export type UpdaterEventCallback<T> = (event: T) => void;

// ============================================================================
// Configuration Types
// ============================================================================

export type DirectUpdateMode = boolean | 'atInstall' | 'onLaunch' | 'always';

export interface TauriUpdaterConfig {
  // Core Settings
  /** Milliseconds before update considered failed (default: 10000) */
  appReadyTimeout?: number;
  /** Seconds for API request timeout (default: 20) */
  responseTimeout?: number;
  /** Enable automatic updates (default: true) */
  autoUpdate?: boolean;
  /** Auto-delete failed bundles (default: true) */
  autoDeleteFailed?: boolean;
  /** Auto-delete previous bundles (default: true) */
  autoDeletePrevious?: boolean;
  /** Delete old bundles on native update (default: true) */
  resetWhenUpdate?: boolean;

  // Server URLs
  /** Update check endpoint */
  updateUrl?: string;
  /** Channel operations endpoint */
  channelUrl?: string;
  /** Statistics endpoint (empty string to disable) */
  statsUrl?: string;

  // Security
  /** Public key for E2E encryption */
  publicKey?: string;

  // Version Management
  /** Override builtin version */
  version?: string;
  /** App ID for update server */
  appId?: string;

  // Direct Update
  /** When to install updates directly */
  directUpdate?: DirectUpdateMode;

  // Channels
  /** Default channel */
  defaultChannel?: string;

  // Dynamic Config
  /** Allow runtime URL changes (default: false) */
  allowModifyUrl?: boolean;
  /** Allow runtime App ID changes (default: false) */
  allowModifyAppId?: boolean;
  /** Allow setBundleError() in manual mode (default: false) */
  allowManualBundleError?: boolean;
  /** Persist custom ID across restarts (default: false) */
  persistCustomId?: boolean;
  /** Persist URL changes across restarts (default: false) */
  persistModifyUrl?: boolean;

  // UX
  /** Preserve URL path on reload (default: false) */
  keepUrlPathAfterReload?: boolean;
  /** Disable console logging (default: false) */
  disableJSLogging?: boolean;
  /** Enable debug menu (default: false) */
  debugMenu?: boolean;

  // Periodic Updates
  /** Auto-check interval in seconds (0 to disable, min 600) */
  periodCheckDelay?: number;

  // Local Development
  /** Local S3 for testing */
  localS3?: boolean;
  /** Local host for testing */
  localHost?: string;
  /** Local web host */
  localWebHost?: string;
  /** Local Supabase for testing */
  localSupa?: string;
  /** Local Supabase anon key */
  localSupaAnon?: string;
  /** Local API for testing */
  localApi?: string;
  /** Local file API for testing */
  localApiFiles?: string;
}

// ============================================================================
// Internal Types
// ============================================================================

export interface BundleManifest {
  /** All bundles */
  bundles: Record<string, BundleInfo>;
  /** Currently active bundle ID */
  currentBundleId: string;
  /** Next bundle ID to load */
  nextBundleId: string | null;
  /** Last successful bundle ID */
  lastSuccessfulBundleId: string | null;
  /** Failed update info */
  failedUpdate: UpdateFailedEvent | null;
  /** Delay conditions */
  delayConditions: DelayCondition[];
  /** Custom ID */
  customId: string | null;
  /** Current channel */
  channel: string | null;
}

export interface StorageData {
  /** Device UUID */
  deviceId: string;
  /** Bundle manifest */
  manifest: BundleManifest;
  /** Dynamic update URL */
  updateUrl?: string;
  /** Dynamic stats URL */
  statsUrl?: string;
  /** Dynamic channel URL */
  channelUrl?: string;
  /** Dynamic app ID */
  appId?: string;
}
