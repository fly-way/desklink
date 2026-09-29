'use strict';

const bridge = window.desklink;
// i18n is loaded from i18n.js (in <head>); fall back to passthrough if absent.
const i18n = window.__i18n || { locale: 'zh-CN', t: (k) => k, tl: (k) => k, days: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] };
const t = i18n.t;
const tl = i18n.tl;

// Restored language choice ('auto' follows the OS); applied before the first render.
let langChoice = 'auto';
try { langChoice = localStorage.getItem('desklink.lang') || 'auto'; } catch {}
if (langChoice !== 'auto') i18n.setLocale(langChoice);

const views = {
  overview: { title: t('viewOverview'), render: renderOverview },
  tunnel: { title: t('viewTunnel'), render: renderTunnel },
  providers: { title: t('viewProviders'), render: renderProviders },
  logs: { title: t('viewLogs'), render: renderLogs },
  diagnostics: { title: t('viewDiagnostics'), render: renderDiagnostics },
  settings: { title: t('viewSettings'), render: renderSettings }
};

let phaseText = { idle: t('phaseIdle'), starting: t('phaseStarting'), ready: t('phaseReady'), error: t('phaseError') };

let status = { phase: 'idle', detail: '', toolCount: 0, endpoint: '', commanderVersion: '', commanderLatest: '' };
let tunnel = { installed: false, version: '', running: false, live: false, ready: false, connected: false, controlPlane: { ok: false, detail: '' }, proxy: '', tunnelId: '', hasKey: false, lastError: '', installing: false, message: '' };
let logs = '';
let providers = [];
let diagnosis = null;
let current = 'overview';
/** True while a tunnel action (connect/install/stop) is awaiting a remote response. */
let tunnelBusy = false;
/** Proxy value kept in the Settings view; sent on connect (the tunnel view no longer edits it). */
let proxyDraft = '';
/** Cached DeskLink version, fetched once at startup for the Settings view. */
let appVersion = '';
/** Latest DeskLink release info returned by the main process. */
let appUpdateInfo = null;
/** Live DeskLink updater state pushed by the main process while downloading/installing. */
let appUpdateProgress = null;

function formatBytes(value) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return bytes + ' B';
  const units = ['KB', 'MB', 'GB'];
  let size = bytes / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index++;
  }
  return (size >= 100 ? size.toFixed(0) : size >= 10 ? size.toFixed(1) : size.toFixed(2)) + ' ' + units[index];
}

function isAppUpdateBusy() {
  return ['checking', 'downloading', 'launching'].includes(appUpdateProgress?.phase);
}

function renderAppUpdateProgress() {
  if (!appUpdateProgress) return null;

  const box = el('div', 'app-update-progress');
  const phase = appUpdateProgress.phase;
  const percent = Number.isFinite(appUpdateProgress.percent)
    ? Math.max(0, Math.min(100, Math.round(appUpdateProgress.percent)))
    : null;

  let label = '';
  if (phase === 'checking') label = t('appUpdateProgressChecking');
  else if (phase === 'downloading' && percent !== null) {
    label = tl('appUpdateProgressDownloading', { percent });
  } else if (phase === 'downloading') {
    label = tl('appUpdateProgressDownloadingUnknown', {
      downloaded: formatBytes(appUpdateProgress.downloadedBytes)
    });
  } else if (phase === 'launching') label = t('appUpdateProgressLaunching');
  else if (phase === 'error') {
    label = tl('appUpdateProgressFailed', { message: appUpdateProgress.error || t('failed') });
    box.classList.add('is-error');
  }

  const head = el('div', 'app-update-progress-head');
  head.append(el('span', 'app-update-progress-label', label));
  if (phase === 'downloading' && percent !== null) {
    head.append(el('span', 'app-update-progress-percent', percent + '%'));
  }
  box.append(head);

  if (phase !== 'error') {
    const track = el('div', 'app-update-progress-track');
    const bar = el('div', 'app-update-progress-bar');
    if (percent === null && phase !== 'launching') {
      track.classList.add('is-indeterminate');
    } else {
      bar.style.width = (phase === 'launching' ? 100 : (percent ?? 0)) + '%';
    }
    track.append(bar);
    box.append(track);
  }

  if (phase === 'downloading' && appUpdateProgress.totalBytes > 0) {
    box.append(el('div', 'app-update-progress-meta', tl('appUpdateProgressBytes', {
      downloaded: formatBytes(appUpdateProgress.downloadedBytes),
      total: formatBytes(appUpdateProgress.totalBytes)
    })));
  }

  return box;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function row(label, value, mono) {
  const line = el('div', 'row');
  line.append(el('div', 'row-label', label));
  line.append(el('div', mono ? 'row-value mono' : 'row-value', value));
  return line;
}

function section(title, ...children) {
  const box = el('section', 'section');
  box.append(el('h3', null, title));
  for (const child of children) box.append(child);
  return box;
}

function head(title, subtitle) {
  const box = el('div', 'page-head');
  box.append(el('h2', null, title));
  if (subtitle) box.append(el('p', null, subtitle));
  return box;
}

function setFeedback(text, isError) {
  const content = document.getElementById('content');
  if (!content) return;
  let box = document.getElementById('feedback');
  if (!box) {
    box = el('div', 'note');
    box.id = 'feedback';
    content.prepend(box);
  }
  box.textContent = text;
  box.className = isError ? 'note is-error' : 'note';
}

function button(label, handler, busyLabel) {
  const node = el('button', 'btn', label);
  node.addEventListener('click', async () => {
    const original = node.textContent;
    node.disabled = true;
    if (busyLabel) node.textContent = busyLabel;
    try {
      const result = await handler();
      setFeedback(result ? String(result) : t('done'));
    } catch (error) {
      setFeedback(t('failed') + String(error?.message ?? error), true);
    } finally {
      node.disabled = false;
      node.textContent = original;
    }
  });
  return node;
}

function tunnelText() {
  if (tunnel.installing) return tunnel.message || t('tunInstalling');
  if (tunnel.connected) return t('tunConnected');
  if (tunnel.ready) return t('tunLocalReady');
  if (tunnel.live) return t('tunOnline');
  if (tunnel.running) return t('tunProcess');
  return t('tunDisconnected');
}

/** Localized phase label; only the 'error' phase falls back to the raw, dynamic detail text. */
function phaseLabel(phase) {
  return phaseText[phase] || phase || '';
}

/** Desktop Commander status line: prefer the localized phase over the main-process detail prose. */
function commanderText() {
  if (status.phase === 'error') return status.detail || phaseText.error;
  if (status.phase === 'starting') return status.detail || phaseText.starting;
  return phaseText[status.phase] || status.detail || '';
}

function renderOverview() {
  const wrap = document.createDocumentFragment();
  wrap.append(head(t('viewOverview'), t('ovSubtitle')));

  const rows = el('div', 'rows');
  rows.append(row(t('rowTunnel'), tunnelText()));
  rows.append(row('Desktop Commander', commanderText()));
  rows.append(row(t('rowToolCount'), String(status.toolCount)));
  rows.append(row(t('rowMcpEndpoint'), status.endpoint || '—', true));
  wrap.append(section(t('secStatus'), rows));

  if (status.phase === 'starting') {
    const startup = el('div', 'startup-progress-wrap');
    startup.append(el('div', 'startup-progress-label', commanderText()));
    const track = el('div', 'startup-progress');
    track.append(el('div', 'startup-progress-bar'));
    startup.append(track);
    wrap.append(startup);
  }

  const bar = el('div', 'toolbar');
  bar.append(button(t('btnRestartCommander'), async () => {
    await bridge.restart();
    return t('restartedCommander');
  }, t('restarting')));
  bar.append(el('span', 'spacer'));
  bar.append(el('span', 'muted', t('noteToolsForward')));
  wrap.append(bar);

  const flow = el('div', 'note');
  flow.textContent = t('flowText');
  wrap.append(section(t('secLink'), flow));
  return wrap;
}

function renderTunnel() {
  const wrap = document.createDocumentFragment();
  wrap.append(head(t('viewTunnel'), t('tunSubtitle')));

  const form = el('div');
  const idRow = el('div', 'row');
  idRow.append(el('div', 'row-label', 'Tunnel ID'));
  const idField = el('input', 'field mono');
  idField.id = 'tunnelId';
  idField.placeholder = t('phTunnelId');
  idField.value = tunnel.tunnelId;
  idRow.append(idField);
  form.append(idRow);

  const keyRow = el('div', 'row');
  keyRow.append(el('div', 'row-label', 'Runtime API Key'));
  const keyField = el('input', 'field');
  keyField.id = 'runtimeKey';
  keyField.type = 'password';
  keyField.placeholder = tunnel.hasKey ? t('phKeySaved') : t('phKey');
  keyRow.append(keyField);
  form.append(keyRow);

  const proxyRow = el('div', 'row');
  proxyRow.append(el('div', 'row-label', t('lblProxy')));
  const proxyNote = el('div', 'row-value muted', t('proxyInSettings'));
  proxyRow.append(proxyNote);
  form.append(proxyRow);
  wrap.append(section(t('secCreds'), form));

  // Daemon is up but the control plane has not acknowledged the key yet: keep actions locked
  // for a grace window so a slow/uncertain remote answer can't be disturbed by local edits.
  const waiting = tunnel.running && tunnel.ready && !tunnel.connected && !tunnel.lastError
    && Date.now() - (tunnel.startedAt || 0) < 90000;

  const rows = el('div', 'rows');
  rows.append(row('tunnel-client', tunnel.installed ? tunnel.version || t('installed') : t('notInstalled')));
  rows.append(row(t('rowProcess'), tunnel.running ? t('procRunning') : t('procStopped')));
  rows.append(row(t('rowHealth'), tunnel.live ? t('healthOnline') : '—'));
  const readyRow = el('div', 'row');
  readyRow.append(el('div', 'row-label', t('rowReady')));
  const readyValue = el('div', 'row-value', tunnel.connected ? t('tunConnected') : tunnel.ready ? t('readyWaiting') : '—');
  if (waiting) readyValue.classList.add('waiting-dots');
  readyRow.append(readyValue);
  rows.append(readyRow);
  if (tunnel.running) {
    const cp = tunnel.controlPlane || { ok: false, detail: '' };
    const line = el('div', 'row');
    line.append(el('div', 'row-label', t('rowControlPlane')));
    if (tunnel.ready) {
      const dot = el('span', 'status-dot ' + (cp.ok ? 'is-ready' : 'is-pulsing'));
      line.append(dot);
    }
    line.append(el('div', 'row-value mono', cp.detail || t('probing')));
    rows.append(line);
  }
  rows.append(row(t('rowKey'), tunnel.hasKey ? t('keySaved') : t('keyUnsaved')));
  wrap.append(section(t('secStatus'), rows));

  if (tunnel.installing) wrap.append(el('div', 'note', tunnel.message || t('installingNote')));
  if (tunnel.lastError) {
    const note = el('div', 'note', tunnel.lastError);
    note.id = 'tunnelError';
    wrap.append(note);
  }

  // Locked while an operation is in flight, while installing, or while the control plane has
  // not answered within the grace window — so local actions can't race the remote response.
  const lock = tunnelBusy || tunnel.installing || waiting;

  const bar = el('div', 'toolbar');
  const installBtn = button(tunnel.installed ? t('btnInstallUpdate') : t('btnInstall'), async () => {
    tunnelBusy = true;
    show(current);
    try {
      const result = await bridge.tunnelInstall();
      if (result?.error) throw new Error(result.error);
      tunnel.lastError = '';
      show(current);
      return t('updated');
    } finally {
      tunnelBusy = false;
      show(current);
    }
  }, t('downloading'));
  installBtn.disabled = lock;
  bar.append(installBtn);

  const connect = el('button', 'btn btn-default', t('btnConnectStart'));
  connect.disabled = !tunnel.installed || lock;
  connect.addEventListener('click', async () => {
    const payload = {
      tunnelId: document.getElementById('tunnelId').value.trim(),
      apiKey: document.getElementById('runtimeKey').value.trim(),
      proxy: proxyDraft
    };
    tunnelBusy = true;
    show(current);
    try {
      const result = await bridge.tunnelConnect(payload);
      if (result?.error) tunnel.lastError = result.error;
    } finally {
      tunnelBusy = false;
      show(current);
    }
  });
  bar.append(connect);

  const stop = button(t('btnStop'), async () => {
    tunnelBusy = true;
    show(current);
    try {
      await bridge.tunnelStop();
      return t('stopped');
    } finally {
      tunnelBusy = false;
      show(current);
    }
  });
  stop.disabled = lock;
  bar.append(stop);
  bar.append(el('span', 'spacer'));
  wrap.append(bar);
  return wrap;
}

function closeCapabilityModal() {
  document.getElementById('capabilityModal')?.remove();
}

function syncUnityCapabilityItem(item, capability, core = false) {
  if (!item || !capability) return;
  const effectiveMode = core ? 'on' : (capability.temporary ? 'on' : capability.mode);
  item.querySelectorAll('.capability-modes button').forEach(control => {
    control.classList.toggle('is-active', control.dataset.mode === effectiveMode);
    control.disabled = core;
  });
  const existingSession = item.querySelector('.capability-session');
  if (capability.temporary && !core) {
    if (!existingSession) {
      item.querySelector('.capability-copy')?.append(el('div', 'capability-session', t('unityCapabilityTemporary')));
    }
  } else {
    existingSession?.remove();
  }
}

function syncUnityCapabilityModal(provider) {
  const modal = document.getElementById('capabilityModal');
  if (!modal || modal.dataset.provider !== 'unity' || !provider) return;
  const meta = provider.meta || {};
  const core = Array.isArray(meta.coreCapabilities) ? meta.coreCapabilities : [];
  const optional = Array.isArray(meta.capabilities) ? meta.capabilities : [];
  for (const capability of core) {
    syncUnityCapabilityItem(
      modal.querySelector(`.capability-item[data-capability-id="${capability.id}"]`),
      capability,
      true
    );
  }
  for (const capability of optional) {
    syncUnityCapabilityItem(
      modal.querySelector(`.capability-item[data-capability-id="${capability.id}"]`),
      capability,
      false
    );
  }
}

function unityCapabilityControl(capability, core = false) {
  const modes = el('div', 'segmented capability-modes');
  const effectiveMode = core ? 'on' : (capability.temporary ? 'on' : capability.mode);
  for (const mode of ['on', 'ask', 'off']) {
    const control = el('button', effectiveMode === mode ? 'is-active' : '', t('unityCapability' + mode[0].toUpperCase() + mode.slice(1)));
    control.dataset.mode = mode;
    control.disabled = core;
    if (!core) {
      control.addEventListener('click', async () => {
        try {
          const next = await bridge.unitySetCapabilityMode(capability.id, mode);
          if (next) {
            providers = providers.map(provider => provider.id === 'unity' ? next : provider);
            syncUnityCapabilityModal(next);
          }
        } catch (error) {
          setFeedback(t('failed') + String(error?.message ?? error), true);
        }
      });
    }
    modes.append(control);
  }
  return modes;
}

function unityCapabilityItem(capability, core = false) {
  const item = el('div', 'capability-item');
  item.dataset.capabilityId = capability.id;
  const copy = el('div', 'capability-copy');
  const nameKey = core ? 'unityCoreCapability_' + capability.id : 'unityCapability_' + capability.id;
  const descKey = core ? 'unityCoreCapabilityDesc_' + capability.id : 'unityCapabilityDesc_' + capability.id;
  copy.append(el('div', 'capability-name', t(nameKey)));
  copy.append(el('div', 'capability-description', t(descKey)));
  if (capability.temporary) copy.append(el('div', 'capability-session', t('unityCapabilityTemporary')));
  item.append(copy, unityCapabilityControl(capability, core));
  return item;
}

function openUnityCapabilities() {
  closeCapabilityModal();
  const provider = providers.find(item => item.id === 'unity');
  if (!provider) return;
  const meta = provider.meta || {};
  const core = Array.isArray(meta.coreCapabilities) ? meta.coreCapabilities : [];
  const optional = Array.isArray(meta.capabilities) ? meta.capabilities : [];

  const backdrop = el('div', 'capability-modal-backdrop');
  backdrop.id = 'capabilityModal';
  backdrop.dataset.provider = 'unity';
  backdrop.addEventListener('mousedown', event => { if (event.target === backdrop) closeCapabilityModal(); });

  const panel = el('div', 'capability-modal');
  const header = el('div', 'capability-modal-header');
  const heading = el('div');
  heading.append(el('h2', null, t('unityCapabilitiesTitle')));
  heading.append(el('p', null, t('unityCapabilitiesSubtitle')));
  const close = el('button', 'capability-close', '×');
  close.title = t('winClose');
  close.setAttribute('aria-label', t('winClose'));
  close.addEventListener('click', closeCapabilityModal);
  header.append(heading, close);
  panel.append(header);
  panel.append(el('div', 'note capability-help', t('unityCapabilitiesNote')));

  const body = el('div', 'capability-modal-body');
  const coreSection = el('section', 'capability-group');
  coreSection.append(el('h3', null, t('unityCapabilitiesCore')));
  coreSection.append(el('p', 'capability-group-note', t('unityCapabilitiesCoreNote')));
  const coreList = el('div', 'capability-list');
  for (const capability of core) coreList.append(unityCapabilityItem(capability, true));
  coreSection.append(coreList);
  body.append(coreSection);

  const optionalSection = el('section', 'capability-group');
  optionalSection.append(el('h3', null, t('unityCapabilitiesOptional')));
  optionalSection.append(el('p', 'capability-group-note', t('unityCapabilitiesOptionalNote')));
  const optionalList = el('div', 'capability-list');
  for (const capability of optional) optionalList.append(unityCapabilityItem(capability, false));
  optionalSection.append(optionalList);
  body.append(optionalSection);
  panel.append(body);
  backdrop.append(panel);
  document.body.append(backdrop);
}

function desktopCommanderCapabilityItem(capability) {
  const item = el('div', 'capability-item');
  const copy = el('div', 'capability-copy');
  copy.append(el('div', 'capability-name', t('dcCapability_' + capability.id)));
  copy.append(el('div', 'capability-description', t('dcCapabilityDesc_' + capability.id)));
  item.append(copy);
  item.append(el('div', 'capability-count', tl('dcCapabilityToolCount', { n: capability.toolCount || 0 })));
  return item;
}

function openDesktopCommanderCapabilities() {
  closeCapabilityModal();
  const provider = providers.find(item => item.id === 'desktop-commander');
  if (!provider) return;
  const capabilities = Array.isArray(provider.meta?.capabilities) ? provider.meta.capabilities : [];

  const backdrop = el('div', 'capability-modal-backdrop');
  backdrop.id = 'capabilityModal';
  backdrop.dataset.provider = 'desktop-commander';
  backdrop.addEventListener('mousedown', event => { if (event.target === backdrop) closeCapabilityModal(); });

  const panel = el('div', 'capability-modal');
  const header = el('div', 'capability-modal-header');
  const heading = el('div');
  heading.append(el('h2', null, t('dcCapabilitiesTitle')));
  heading.append(el('p', null, t('dcCapabilitiesSubtitle')));
  const close = el('button', 'capability-close', '×');
  close.title = t('winClose');
  close.setAttribute('aria-label', t('winClose'));
  close.addEventListener('click', closeCapabilityModal);
  header.append(heading, close);
  panel.append(header);
  panel.append(el('div', 'note capability-help', t('dcCapabilitiesNote')));

  const body = el('div', 'capability-modal-body');
  const list = el('div', 'capability-list');
  for (const capability of capabilities) list.append(desktopCommanderCapabilityItem(capability));
  if (!capabilities.length) list.append(el('div', 'empty', t('dcCapabilitiesUnavailable')));
  body.append(list);
  panel.append(body);
  backdrop.append(panel);
  document.body.append(backdrop);
}

function renderDesktopCommanderProvider(provider) {
  const latest = status.commanderLatest || provider.meta?.latestVersion || '';
  const currentVersion = provider.version || status.commanderVersion || '';
  const rows = el('div', 'rows');
  rows.append(row(t('providerState'), phaseLabel(provider.phase)));
  rows.append(row(t('providerMode'), t('providerMode_' + provider.mode)));
  rows.append(row(t('providerTransport'), provider.transport || '—', true));
  rows.append(row(t('rowRunningVersion'), currentVersion || '—', true));
  rows.append(row(t('rowLatestVersion'), latest || t('notChecked'), true));
  rows.append(row(
    t('rowUpdate'),
    !latest ? t('notChecked') : currentVersion === latest ? t('upToDate') : tl('dcUpdateAvailable', { latest })
  ));
  rows.append(row(t('rowToolCount'), String(provider.toolCount || 0)));
  if (provider.detail) rows.append(row(t('providerDetail'), provider.detail));

  const box = section(provider.name, rows);
  const bar = el('div', 'toolbar');
  const capabilities = el('button', 'btn', t('dcManageCapabilities'));
  capabilities.addEventListener('click', openDesktopCommanderCapabilities);
  bar.append(capabilities);
  bar.append(button(t('btnCheckUpdate'), async () => {
    const value = await bridge.checkCommanderUpdate();
    if (value) status.commanderLatest = value;
    show(current);
    return value ? tl('latestAvailable', { latest: value }) : t('checkUpdateFailed');
  }, t('checking')));
  if (latest && currentVersion && latest !== currentVersion) {
    bar.append(button(t('btnUpdateCommander'), async () => {
      await bridge.restart();
      return t('updatedLatest');
    }, t('restarting')));
  }
  box.append(bar);
  return box;
}

function renderUnityProvider(provider) {
  const meta = provider.meta || {};
  const rows = el('div', 'rows');
  rows.append(row(t('providerState'), phaseLabel(provider.phase)));
  rows.append(row(t('unityProject'), meta.projectName || t('unityNoProject')));
  if (meta.projectPath) rows.append(row(t('unityProjectPath'), meta.projectPath, true));
  if (meta.unityVersion) rows.append(row(t('unityVersion'), meta.unityVersion, true));
  const packageText = meta.packageInstalled
    ? tl('unityPackageInstalled', { version: meta.packageVersion || '?' })
    : meta.packageDeclared
      ? (meta.packageResolved ? t('unityPackageResolved') : t('unityPackageResolving'))
      : t('notInstalled');
  rows.append(row(t('unityPackage'), packageText));
  rows.append(row(t('unityIntegration'), meta.integrationInstalled
    ? t('unityIntegrationInstalled')
    : t('unityIntegrationMissing')));
  rows.append(row(t('unityBridge'), meta.bridgeConnected ? t('unityConnected') : '—'));
  rows.append(row(t('providerMode'), t('providerMode_' + (meta.projectMode || 'auto'))));
  rows.append(row(t('providerTransport'), provider.transport || '—', true));
  rows.append(row(t('rowToolCount'), String(provider.toolCount || 0)));
  if (meta.uvAvailable) rows.append(row('uv', meta.uvVersion || t('installed'), true));
  if (provider.detail) rows.append(row(t('providerDetail'), provider.detail));

  const box = section(provider.name, rows);
  const bar = el('div', 'toolbar');
  const projectPath = meta.projectPath || undefined;

  const capabilities = el('button', 'btn', t('unityManageCapabilities'));
  capabilities.addEventListener('click', openUnityCapabilities);
  bar.append(capabilities);
  bar.append(button(t('unityRefresh'), async () => {
    await bridge.unityRefresh();
    return t('done');
  }));

  if (projectPath && (!meta.packageInstalled || !meta.packageCompatible || !meta.integrationInstalled)) {
    const installLabel = !meta.packageInstalled
      ? (meta.packageDeclared && meta.installationApproved ? t('unityRetryResolve') : t('unityInstallEnable'))
      : !meta.packageCompatible
        ? tl('unityUpdateEnable', { version: meta.packageTargetVersion || '?' })
        : t('unityEnableIntegration');
    bar.append(button(
      installLabel,
      async () => { await bridge.unityInstall(projectPath); return t('unityInstallStarted'); },
      t('unityInstalling')
    ));
  }

  let modes = null;
  if (projectPath && meta.packageInstalled && meta.packageCompatible && meta.integrationInstalled) {
    modes = el('div', 'segmented');
    for (const mode of ['auto', 'manual', 'disabled']) {
      const control = el('button', meta.projectMode === mode ? 'is-active' : '', t('providerMode_' + mode));
      control.addEventListener('click', async () => {
        try { await bridge.unitySetMode(mode, projectPath); }
        catch (error) { setFeedback(t('failed') + String(error?.message ?? error), true); }
      });
      modes.append(control);
    }
    if (meta.projectMode === 'manual' && provider.phase !== 'ready') {
      bar.append(button(t('unityStart'), async () => {
        await bridge.unityStart(projectPath);
        return t('unityStarting');
      }, t('unityStarting')));
    }
  }

  bar.append(el('span', 'spacer'));
  if (modes) bar.append(modes);
  box.append(bar);
  return box;
}

function renderProviders() {
  const wrap = document.createDocumentFragment();
  wrap.append(head(t('viewProviders'), t('providersSubtitle')));

  if (!providers.length) {
    wrap.append(el('div', 'empty', t('providersEmpty')));
    return wrap;
  }

  for (const provider of providers) {
    if (provider.id === 'desktop-commander') {
      wrap.append(renderDesktopCommanderProvider(provider));
      continue;
    }
    if (provider.id === 'unity') {
      wrap.append(renderUnityProvider(provider));
      continue;
    }
    const rows = el('div', 'rows');
    rows.append(row(t('providerState'), phaseLabel(provider.phase)));
    rows.append(row(t('providerMode'), t('providerMode_' + provider.mode)));
    rows.append(row(t('providerTransport'), provider.transport || '—', true));
    rows.append(row(t('providerVersion'), provider.version || '—', true));
    rows.append(row(t('rowToolCount'), String(provider.toolCount || 0)));
    if (provider.detail) rows.append(row(t('providerDetail'), provider.detail));
    wrap.append(section(provider.name, rows));
  }
  return wrap;
}

function renderLogs() {
  const wrap = document.createDocumentFragment();
  wrap.append(head(t('viewLogs'), t('logsSubtitle')));
  const view = el('div', 'log-view', logs || t('noLogs') + '\n');
  view.id = 'logView';
  wrap.append(view);
  return wrap;
}

function renderDiagnostics() {
  const wrap = document.createDocumentFragment();
  wrap.append(head(t('viewDiagnostics'), t('diagSubtitle')));

  const rows = el('div', 'rows');
  const add = (label, value, mono) => rows.append(row(label, value, mono));

  if (diagnosis) {
    add(t('diagRuntime'), diagnosis.runtime?.version
      ? `${diagnosis.runtime.version} · ${diagnosis.runtime.source === 'bundled' ? t('sourceBundled') : t('sourceSystem')}${diagnosis.runtime.satisfies ? '' : t('versionLow')}`
      : t('notDetected'), true);
    add('Electron', diagnosis.electron || '—', true);
    add(t('diagCommanderInstalled'), diagnosis.runtime?.commanderInstalled || t('notPreinstalled'), true);
    add('Desktop Commander', diagnosis.commander?.version || phaseLabel(diagnosis.commander?.phase) || '—', true);
    add(t('diagToolCount'), String(diagnosis.commander?.toolCount ?? 0));
    add(t('diagMcpPort'), `${diagnosis.endpoint?.port} · ${diagnosis.endpoint?.reachable ? t('reachable') : t('unreachable')}`, true);
    add('tunnel-client', diagnosis.tunnel?.installed ? diagnosis.tunnel.version || t('installed') : t('notInstalled'));
    add('Runtime API Key', diagnosis.tunnel?.hasKey ? t('keySaved') : t('keyUnsaved'));
    add('Tunnel ID', diagnosis.tunnel?.tunnelId || '—', true);
  } else {
    add('Node.js', bridge.versions?.node ?? '—', true);
    add('Electron', bridge.versions?.electron ?? '—', true);
    add('Desktop Commander', commanderText());
    add(t('rowMcpEndpoint'), status.endpoint || '—', true);
    add('tunnel-client', tunnel.installed ? tunnel.version || t('installed') : t('notInstalled'));
    add(t('hint'), t('clickRunDiag'));
  }
  wrap.append(section(t('secEnv'), rows));

  const bar = el('div', 'toolbar');
  bar.append(button(t('btnRunDiag'), async () => {
    diagnosis = await bridge.diagnostics();
    show('diagnostics');
    return t('diagDone');
  }, t('checking')));
  bar.append(el('span', 'spacer'));
  bar.append(el('span', 'muted', t('noteNodeRequired')));
  wrap.append(bar);

  const runtime = diagnosis?.runtime;
  if (runtime && (!runtime.available || !runtime.satisfies)) {
    const action = el('div', 'toolbar');
    action.append(button(t('btnDownloadNode'), async () => {
      const result = await bridge.nodeInstall();
      if (result?.error) throw new Error(result.error);
      diagnosis = await bridge.diagnostics();
      show('diagnostics');
      return result?.version ? tl('nodeReadyRestart', { version: result.version }) : t('nodeReady');
    }, t('downloading')));
    wrap.append(action);
  }
  return wrap;
}

// Recompute language-dependent strings after a locale switch (titles/phase map are cached at load).
function refreshStrings() {
  views.overview.title = t('viewOverview');
  views.tunnel.title = t('viewTunnel');
  views.providers.title = t('viewProviders');
  views.logs.title = t('viewLogs');
  views.diagnostics.title = t('viewDiagnostics');
  views.settings.title = t('viewSettings');
  phaseText = { idle: t('phaseIdle'), starting: t('phaseStarting'), ready: t('phaseReady'), error: t('phaseError') };
}

async function checkDesklinkUpdate() {
  appUpdateProgress = null;
  const r = await bridge.checkAppUpdate();
  if (r?.error) {
    appUpdateInfo = null;
    show('settings');
    return tl('updateCheckFailedDetail', { message: r.error });
  }
  appUpdateInfo = r;
  show('settings');
  if (!r.available) return tl('updateResultLatest', { version: r.latest || appVersion || '?' });
  return tl('updateAvailableDesklink', { latest: r.latest, current: r.current || appVersion || '?' });
}

async function installDesklinkUpdate() {
  appUpdateProgress = { phase: 'checking', version: appUpdateInfo?.latest || '' };
  if (current === 'settings') show('settings');
  const result = await bridge.installAppUpdate();
  if (result?.error) throw new Error(result.error);
  return tl('appUpdateStarting', { version: result?.version || appUpdateInfo?.latest || '?' });
}

function renderSettings() {
  const wrap = document.createDocumentFragment();
  wrap.append(head(t('viewSettings'), t('settingsSubtitle')));

  // General
  const genRows = el('div', 'rows');
  const langRow = el('div', 'row');
  langRow.append(el('div', 'row-label', t('settingLang')));
  const sel = el('select', 'field');
  sel.id = 'langSelect';
  for (const [val, label] of [['auto', t('langAuto')], ['zh-CN', t('langZh')], ['en-US', t('langEn')]]) {
    const o = el('option');
    o.value = val;
    o.textContent = label;
    sel.append(o);
  }
  sel.value = langChoice;
  sel.addEventListener('change', () => {
    langChoice = sel.value;
    try { localStorage.setItem('desklink.lang', langChoice); } catch {}
    i18n.setLocale(langChoice);
    bridge.setLocale(i18n.locale);
    refreshStrings();
    updateTitleStatus();
    show('settings');
  });
  langRow.append(sel);
  genRows.append(langRow);
  wrap.append(section(t('settingsGeneral'), genRows));

  // Tunnel — proxy (moved out of the Tunnel view)
  const tunRows = el('div', 'rows');
  const proxyRow = el('div', 'row');
  proxyRow.append(el('div', 'row-label', t('lblProxy')));
  const proxyField = el('input', 'field');
  proxyField.id = 'proxy';
  proxyField.placeholder = t('phProxy');
  proxyField.value = proxyDraft || '';
  proxyField.addEventListener('input', () => { proxyDraft = proxyField.value.trim(); });
  proxyRow.append(proxyField);
  tunRows.append(proxyRow);
  wrap.append(section(t('settingsTunnel'), tunRows));

  // About
  const aboutRows = el('div', 'rows');
  aboutRows.append(row(t('desklinkVersion'), appVersion || '—', true));
  if (appUpdateInfo?.latest) {
    aboutRows.append(row(t('desklinkLatestVersion'), appUpdateInfo.latest, true));
    aboutRows.append(row(
      t('rowUpdate'),
      appUpdateInfo.available
        ? tl('updateAvailableDesklink', { latest: appUpdateInfo.latest, current: appUpdateInfo.current || appVersion || '?' })
        : t('upToDate')
    ));
  }
  wrap.append(section(t('aboutDesklink'), aboutRows));

  const bar = el('div', 'toolbar');
  bar.append(button(t('checkAppUpdate'), async () => {
    return await checkDesklinkUpdate();
  }, t('checking')));
  if (appUpdateInfo?.available) {
    const update = button(t('installAppUpdate'), installDesklinkUpdate, t('appUpdateDownloading'));
    update.disabled = !appUpdateInfo.installerName || isAppUpdateBusy();
    bar.append(update);
    if (!appUpdateInfo.installerName) bar.append(el('span', 'muted', t('appUpdateInstallerMissing')));
  }
  wrap.append(bar);
  const updateProgress = renderAppUpdateProgress();
  if (updateProgress) wrap.append(updateProgress);
  return wrap;
}

function captureInputs() {
  const snapshot = [];
  for (const field of document.querySelectorAll('#content input')) {
    snapshot.push({
      id: field.id,
      value: field.value,
      focused: document.activeElement === field,
      caret: field.selectionStart
    });
  }
  return snapshot;
}

function restoreInputs(snapshot) {
  for (const data of snapshot) {
    const field = document.getElementById(data.id);
    if (!field) continue;
    field.value = data.value;
    if (!data.focused) continue;
    field.focus();
    try { field.setSelectionRange(data.caret, data.caret); } catch {}
  }
}

function isTyping() {
  const active = document.activeElement;
  return !!active && active.tagName === 'INPUT' && document.getElementById('content')?.contains(active);
}

function show(view) {
  current = views[view] ? view : 'overview';
  const item = views[current];
  const form = captureInputs();
  document.getElementById('windowTitle').textContent = item.title;
  document.getElementById('content').replaceChildren(item.render());
  restoreInputs(form);
  document.querySelectorAll('.side-item').forEach(node => {
    node.classList.toggle('is-active', node.dataset.view === current);
  });
  if (current === 'logs') {
    const log = document.getElementById('logView');
    if (log) log.scrollTop = log.scrollHeight;
  }
}

function updateTitleStatus() {
  const dot = document.getElementById('titleStatus');
  const text = document.getElementById('titleStatusText');
  const ready = status.phase === 'ready' && tunnel.connected;
  const connecting = status.phase === 'ready' && tunnel.running && !tunnel.connected && tunnel.ready;
  dot.className = 'status-dot' + (ready ? ' is-ready' : connecting ? ' is-live is-pulsing' : status.phase === 'ready' || tunnel.live ? ' is-live' : status.phase === 'error' ? ' is-error' : '');
  text.classList.toggle('waiting-dots', connecting || status.phase === 'starting');
  text.textContent = ready ? t('titleReady') : connecting ? t('titleConnecting') : tunnel.connected ? t('titleTunnelReady') : commanderText();
}

(function enableDragging() {
  const bars = [document.querySelector('.titlebar')].filter(Boolean);
  const THRESHOLD = 4;
  let dragging = false;
  let moved = false;
  let origin = { x: 0, y: 0 };

  for (const bar of bars) {
    bar.addEventListener('mousedown', event => {
      if (event.button !== 0 || event.target.closest('button, input, select, textarea, a')) return;
      dragging = true;
      moved = false;
      origin = { x: event.screenX, y: event.screenY };
      bridge.dragStart(event.screenX, event.screenY);
    });
  }

  window.addEventListener('mousemove', event => {
    if (!dragging) return;
    // Ignore jitter so a plain click never turns into a move.
    if (!moved && Math.abs(event.screenX - origin.x) < THRESHOLD && Math.abs(event.screenY - origin.y) < THRESHOLD) return;
    moved = true;
    bridge.dragMove(event.screenX, event.screenY);
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    if (moved) bridge.dragEnd();
  });

})();

window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.getElementById('capabilityModal')) closeCapabilityModal();
});

document.querySelectorAll('.side-item').forEach(node => {
  node.addEventListener('click', () => show(node.dataset.view));
});
document.querySelectorAll('.win-btn').forEach(node => {
  node.addEventListener('click', () => bridge.windowAction(node.dataset.action));
});

bridge.onStatus(next => {
  status = next;
  updateTitleStatus();
  if (isTyping()) return;
  show(current);
});
bridge.onProviders(next => {
  const modal = document.getElementById('capabilityModal');
  const modalProvider = modal?.dataset.provider || '';
  const scrollTop = document.querySelector('.capability-modal-body')?.scrollTop || 0;
  providers = next;
  if (current === 'providers') show(current);
  if (modalProvider === 'unity') {
    syncUnityCapabilityModal(next.find(provider => provider.id === 'unity'));
  } else if (modalProvider === 'desktop-commander') {
    openDesktopCommanderCapabilities();
    const body = document.querySelector('.capability-modal-body');
    if (body) body.scrollTop = scrollTop;
  }
});
bridge.onTunnel(next => {
  tunnel = next;
  updateTitleStatus();
  if (isTyping()) return;
  if (current === 'tunnel' || current === 'overview' || current === 'diagnostics') show(current);
});
bridge.onAppUpdateProgress?.(next => {
  appUpdateProgress = next;
  if (current === 'settings') show('settings');
});
bridge.onLog(line => {
  logs += line;
  if (current === 'logs') {
    const view = document.getElementById('logView');
    if (view) {
      view.textContent = logs;
      view.scrollTop = view.scrollHeight;
    }
  }
});

(async () => {
  try {
    const initial = await bridge.tunnelStatus();
    if (initial) tunnel = initial;
  } catch {}
  if (!proxyDraft) proxyDraft = tunnel.proxy || '';
  try { appVersion = await bridge.appVersion(); } catch {}
  try { providers = await bridge.getProviders(); } catch { providers = []; }
  updateTitleStatus();
})();

// Keep main-process messages (logs, errors) in the same language as the UI.
bridge.setLocale(i18n.locale);
updateTitleStatus();
show('overview');
