import { TauriUpdater } from '@capgo/tauri-updater';

const logEl = document.getElementById('log') as HTMLPreElement;
const checkButton = document.getElementById('check') as HTMLButtonElement;

function log(message: string) {
  logEl.textContent += `${message}\n`;
}

const updater = new TauriUpdater({
  appId: 'com.example.tauriapp',
  autoUpdate: false,
});

await updater.initialize();
await updater.notifyAppReady();

updater.addListener('download', (event) => {
  log(`Download: ${event.percent}%`);
});

checkButton.addEventListener('click', async () => {
  log('Checking for updates...');
  const latest = await updater.getLatest();
  if (latest.error) {
    log(`No update: ${latest.error}`);
    return;
  }

  if (latest.url && latest.version) {
    log(`Downloading ${latest.version}...`);
    const bundle = await updater.download({
      url: latest.url,
      version: latest.version,
      checksum: latest.checksum,
      sessionKey: latest.sessionKey,
      manifest: latest.manifest,
    });

    await updater.next({ id: bundle.id });
    log(`Update queued: ${bundle.id}`);
  }
});
