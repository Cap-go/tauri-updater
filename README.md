# Tauri Updater

<a href="https://capgo.app/"><img src='https://raw.githubusercontent.com/Cap-go/capgo/main/assets/capgo_banner.png' alt='Capgo - Instant updates for capacitor'/></a>

[![Discord](https://badgen.net/badge/icon/discord?icon=discord&label)](https://discord.com/invite/VnYRvBfgA6)
<a href="https://discord.com/invite/VnYRvBfgA6"><img src="https://img.shields.io/discord/912707985829163099?color=%237289DA&label=Discord" alt="Discord"></a>
[![npm](https://img.shields.io/npm/dm/@capgo/tauri-updater)](https://www.npmjs.com/package/@capgo/tauri-updater)
[![GitHub latest commit](https://badgen.net/github/last-commit/Cap-go/tauri-updater/main)](https://GitHub.com/Cap-go/tauri-updater/commit/)
[![https://good-labs.github.io/greater-good-affirmation/assets/images/badge.svg](https://good-labs.github.io/greater-good-affirmation/assets/images/badge.svg)](https://good-labs.github.io/greater-good-affirmation)

<div align="center">
  <h2><a href="https://capgo.app/?ref=plugin_tauri_updater"> Get Instant updates for your App with Capgo</a></h2>
  <h2><a href="https://capgo.app/consulting/?ref=plugin_tauri_updater"> Missing a feature? We'll build the plugin for you</a></h2>
</div>

OTA (Over-The-Air) updates for Tauri applications. 100% feature parity with [@capgo/capacitor-updater](https://github.com/Cap-go/capacitor-updater).

Open-source alternative to Tauri's built-in updater with live update capabilities.

## Features

- 🚀 **Live Updates** - Push updates instantly without app store review
- 🔄 **Auto-Update** - Automatic update checking and installation
- 🛡️ **Rollback Protection** - Automatic rollback if update fails
- 📦 **Bundle Management** - Full control over downloaded bundles
- 🔐 **End-to-End Encryption** - Secure update delivery
- 📊 **Channel System** - Deploy to different user groups
- ⏱️ **Delay Conditions** - Control when updates are applied

## Installation

```bash
npm install @capgo/tauri-updater
```

## Tauri Plugin Requirements

Install and register these Tauri plugins in your app:

- `@tauri-apps/plugin-fs`
- `@tauri-apps/plugin-http`
- `@tauri-apps/plugin-process`

## Quick Start

```typescript
import { TauriUpdater } from '@capgo/tauri-updater';

const updater = new TauriUpdater({
  appId: 'com.example.app',
  autoUpdate: true,
});

await updater.initialize();

// IMPORTANT: Call this on every app launch!
await updater.notifyAppReady();

// Check for updates manually
const latest = await updater.getLatest();
if (latest.url && !latest.error) {
  const bundle = await updater.download({
    url: latest.url,
    version: latest.version,
    checksum: latest.checksum,
  });

  // Queue for next restart
  await updater.next({ id: bundle.id });
}

updater.addListener('download', (event) => {
  console.log(`Download progress: ${event.percent}%`);
});
```

## API Reference

### Core Methods

| Method | Description |
|--------|-------------|
| `notifyAppReady()` | **Must be called on every launch** - Confirms bundle loaded successfully |
| `download(options)` | Download a bundle from URL |
| `next(options)` | Queue bundle for next restart |
| `set(options)` | Immediately switch to bundle and reload |
| `reload()` | Reload the app with current bundle |
| `delete(options)` | Delete a bundle from storage |
| `reset(options)` | Reset to builtin or last successful bundle |

### Bundle Information

| Method | Description |
|--------|-------------|
| `current()` | Get current bundle and native version |
| `list(options)` | List all downloaded bundles |
| `getNextBundle()` | Get bundle queued for next restart |
| `getFailedUpdate()` | Get info about last failed update |
| `getBuiltinVersion()` | Get version shipped with app |

### Update Checking

| Method | Description |
|--------|-------------|
| `getLatest(options)` | Check server for latest version |

### Channel Management

| Method | Description |
|--------|-------------|
| `setChannel(options)` | Assign device to a channel |
| `unsetChannel(options)` | Remove channel assignment |
| `getChannel()` | Get current channel |
| `listChannels()` | List available channels |

### Delay Conditions

| Method | Description |
|--------|-------------|
| `setMultiDelay(options)` | Set conditions before update applies |
| `cancelDelay()` | Clear all delay conditions |

Delay condition types:
- `background` - Wait for app to be backgrounded (with optional duration)
- `kill` - Wait for app to be killed and restarted
- `date` - Wait until specific date/time
- `nativeVersion` - Wait for native app update

### Device Identification

| Method | Description |
|--------|-------------|
| `getDeviceId()` | Get unique device ID |
| `setCustomId(options)` | Set custom identifier |

### Configuration

| Method | Description |
|--------|-------------|
| `setUpdateUrl(options)` | Change update server URL |
| `setStatsUrl(options)` | Change statistics URL |
| `setChannelUrl(options)` | Change channel URL |
| `setAppId(options)` | Change App ID |
| `getAppId()` | Get current App ID |

### Debug

| Method | Description |
|--------|-------------|
| `setDebugMenu(options)` | Enable/disable debug menu |
| `isDebugMenuEnabled()` | Check debug menu state |

## Events

| Event | Description |
|-------|-------------|
| `download` | Download progress updates |
| `updateAvailable` | New update available |
| `noNeedUpdate` | Already up-to-date |
| `downloadComplete` | Download finished |
| `downloadFailed` | Download failed |
| `breakingAvailable` | Incompatible update available |
| `updateFailed` | Update installation failed |
| `appReloaded` | App was reloaded |
| `appReady` | notifyAppReady() was called |

## Configuration Options

```typescript
const updater = new TauriUpdater({
  appId: 'com.example.app',
  version: '1.0.0',
  autoUpdate: true,
  appReadyTimeout: 10000,

  updateUrl: 'https://plugin.capgo.app/updates',
  channelUrl: 'https://plugin.capgo.app/channel_self',
  statsUrl: 'https://plugin.capgo.app/stats',

  publicKey: '...',
  defaultChannel: 'production',

  autoDeleteFailed: true,
  autoDeletePrevious: true,
  resetWhenUpdate: true,

  directUpdate: false,

  allowModifyUrl: false,
  allowModifyAppId: false,
  persistCustomId: false,
  persistModifyUrl: false,

  debugMenu: false,
  disableJSLogging: false,

  periodCheckDelay: 0,
});
```

## Rollback Protection

1. When a new bundle loads, a timer starts (default: 10 seconds)
2. Your app must call `notifyAppReady()` before the timer expires
3. If the timer expires, the update is considered failed
4. The app reloads the last-known good bundle

## Documentation

Full documentation is available at [capgo.app/docs](https://capgo.app/docs/).

## Community

Join the [discord](https://discord.gg/VnYRvBfgA6) to get help.

## License

Mozilla Public License Version 2.0. See [LICENSE](LICENSE) for details.
