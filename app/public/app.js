(function () {
  const sessionStorageKey = 'ingest.sessionId';
  const messageList = document.getElementById('messageList');
  const actionRow = document.getElementById('actionRow');
  const form = document.getElementById('messageForm');
  const input = document.getElementById('messageInput');
  const sendButton = document.getElementById('sendButton');
  const connectionState = document.getElementById('connectionState');
  const activeDownloadList = document.getElementById('activeDownloadList');
  const activeSummary = document.getElementById('activeSummary');

  const defaultLanguageButtons = [
    { label: 'Malayalam' },
    { label: 'English' },
    { label: 'Tamil' },
    { label: 'Hindi' }
  ];
  let languageButtons = defaultLanguageButtons.slice();

  let sessionId = localStorage.getItem(sessionStorageKey);
  if (!sessionId) {
    sessionId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `ingest-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(sessionStorageKey, sessionId);
  }

  let currentSession = { state: 'idle' };
  let downloadsCache = [];
  let downloadsLoading = false;

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  function statusTextFromState(state) {
    switch (state) {
      case 'waiting_language':
        return 'Waiting for language';
      case 'waiting_folder_name':
        return 'Waiting for folder name';
      case 'queued':
        return 'Queued';
      case 'downloading':
        return 'Downloading';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      default:
        return 'Ready';
    }
  }

  function emptyStateText(session) {
    switch ((session && session.state) || 'idle') {
      case 'waiting_language':
        return 'Choose a language.';
      case 'waiting_folder_name':
        return 'Movie folder name?';
      default:
        return 'Paste a magnet link to begin.';
    }
  }

  function formatBytes(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return '';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit += 1;
    }

    return `${size >= 10 || unit === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
  }

  function formatSpeed(value) {
    const speed = Number(value);
    if (!Number.isFinite(speed) || speed <= 0) {
      return '';
    }
    return `${formatBytes(speed)}/s`;
  }

  function formatEta(value) {
    const eta = Number(value);
    if (!Number.isFinite(eta) || eta <= 0) {
      return '';
    }

    const minutes = Math.floor(eta / 60);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${remainingMinutes}m left`;
    }
    if (minutes > 0) {
      return `${minutes}m left`;
    }
    return `${Math.max(1, Math.round(eta))}s left`;
  }

  function isActiveDownload(download) {
    const status = String(download.status || '').toLowerCase();
    return ['queued', 'downloading', 'stalled'].includes(status);
  }

  function renderMessages(messages, session) {
    messageList.innerHTML = '';
    if (!messages.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = emptyStateText(session);
      messageList.appendChild(empty);
      return;
    }

    for (const message of messages) {
      const bubble = document.createElement('div');
      bubble.className = `message ${message.role}`;
      if (typeof message.content === 'string' && message.content.toLowerCase().includes('failed')) {
        bubble.classList.add('status-danger');
      } else if (
        typeof message.content === 'string' &&
        (message.content.startsWith('Queued') || message.content.startsWith('Download complete'))
      ) {
        bubble.classList.add('status-success');
      }
      bubble.innerHTML = escapeHtml(message.content);
      messageList.appendChild(bubble);
    }

    messageList.scrollTop = messageList.scrollHeight;
  }

  function renderPrompt(session) {
    currentSession = session || { state: 'idle' };
    connectionState.textContent = statusTextFromState(currentSession.state);

    actionRow.innerHTML = '';
    actionRow.hidden = true;

    if (currentSession.state === 'waiting_language') {
      actionRow.hidden = false;
      const buttons = languageButtons.length ? languageButtons : defaultLanguageButtons;
      for (const item of buttons) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'chip';
        button.textContent = item.label;
        button.addEventListener('click', () => submitMessage(item.label, 'language'));
        actionRow.appendChild(button);
      }
      input.placeholder = 'Choose a language or paste a magnet link.';
      return;
    }

    if (currentSession.state === 'waiting_folder_name') {
      input.placeholder = 'Movie folder name?';
      return;
    }

    input.placeholder = 'Paste a magnet link to begin.';
  }

  function renderActiveDownloads(downloads) {
    const active = downloads.filter(isActiveDownload);
    activeSummary.textContent = active.length ? `${active.length} active` : 'Idle';

    activeDownloadList.innerHTML = '';
    if (!active.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No active downloads.';
      activeDownloadList.appendChild(empty);
      return;
    }

    for (const download of active) {
      const title = download.display_name || download.qb_name || download.folder_name || 'Untitled';
      const percent = Number.isFinite(Number(download.progress_percent))
        ? Math.max(0, Math.min(100, Number(download.progress_percent)))
        : 0;
      const status = String(download.live_state || download.status || '').toLowerCase();
      const speed = formatSpeed(download.torrent_speed);
      const eta = formatEta(download.torrent_eta);
      const downloaded = formatBytes(download.torrent_downloaded);
      const total = formatBytes(download.torrent_size);
      const progressText =
        percent >= 100
          ? 'Finishing'
          : status === 'queued'
            ? 'Queued'
            : status === 'stalled'
              ? 'Stalled'
              : 'Downloading';

      const card = document.createElement('article');
      card.className = 'active-download-card';
      card.innerHTML = `
        <div class="active-download-head">
          <div>
            <h3 class="active-download-title">${escapeHtml(title)}</h3>
            <div class="active-download-meta">${escapeHtml(download.language || '')} · ${escapeHtml(download.folder_name || '')}</div>
          </div>
          <span class="status-pill ${escapeHtml(status)}">${escapeHtml(progressText)}</span>
        </div>
        <div class="active-download-stack">
          <div class="progress-shell">
            <div class="progress-track" aria-hidden="true">
              <div class="progress-fill" style="width: ${percent}%"></div>
            </div>
            <div class="progress-foot">
              <span>${escapeHtml(String(percent))}%${downloaded && total ? ` · ${escapeHtml(downloaded)} / ${escapeHtml(total)}` : ''}</span>
              <span>${escapeHtml(speed || eta || '')}</span>
            </div>
          </div>
          <div class="active-download-status">
            <span>${escapeHtml(download.save_path || '')}</span>
          </div>
        </div>
      `;
      activeDownloadList.appendChild(card);
    }
  }

  async function loadLanguageButtons() {
    try {
      const response = await fetch('/api/settings/languages');
      if (!response.ok) {
        throw new Error('Failed to load language mappings');
      }

      const data = await response.json();
      const languages = Array.isArray(data.languages) ? data.languages : [];
      languageButtons = languages
        .filter((language) => Number(language.enabled) === 1)
        .map((language) => ({
          key: language.key,
          label: language.label
        }));
      if (currentSession.state === 'waiting_language') {
        renderPrompt(currentSession);
      }
      return languageButtons;
    } catch (error) {
      languageButtons = defaultLanguageButtons.slice();
      if (currentSession.state === 'waiting_language') {
        renderPrompt(currentSession);
      }
      return languageButtons;
    }
  }

  async function loadDownloads() {
    if (downloadsLoading) {
      return downloadsCache;
    }

    downloadsLoading = true;
    try {
      const response = await fetch('/api/downloads?limit=100');
      if (!response.ok) {
        throw new Error('Failed to load downloads');
      }

      const data = await response.json();
      downloadsCache = data.downloads || [];
      renderActiveDownloads(downloadsCache);
      return downloadsCache;
    } catch (error) {
      downloadsCache = downloadsCache || [];
      renderActiveDownloads(downloadsCache);
      return downloadsCache;
    } finally {
      downloadsLoading = false;
    }
  }

  async function loadHistory() {
    try {
      const response = await fetch(`/api/chat/history?sessionId=${encodeURIComponent(sessionId)}`);
      if (!response.ok) {
        throw new Error('Failed to load history');
      }

      const data = await response.json();
      renderMessages(data.messages || [], data.session || { state: 'idle' });
      renderPrompt(data.session || { state: 'idle' });
    } catch (error) {
      connectionState.textContent = 'Offline';
      renderMessages([], currentSession);
      renderPrompt(currentSession);
    }
  }

  async function refreshView() {
    await Promise.all([loadLanguageButtons(), loadHistory(), loadDownloads()]);
  }

  async function submitMessage(message, inputType) {
    const trimmed = String(message || '').trim();
    if (!trimmed) {
      return;
    }

    sendButton.disabled = true;
    input.disabled = true;

    try {
      const response = await fetch('/api/chat/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId,
          message: trimmed,
          inputType: inputType || 'text'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const data = await response.json();
      input.value = '';
      await Promise.all([loadHistory(), loadDownloads()]);
      renderPrompt(data.session || currentSession);
    } catch (error) {
      const failure = document.createElement('div');
      failure.className = 'message system status-danger';
      failure.textContent = 'Failed to submit message.';
      messageList.appendChild(failure);
      messageList.scrollTop = messageList.scrollHeight;
      renderPrompt(currentSession);
    } finally {
      sendButton.disabled = false;
      input.disabled = false;
      input.focus();
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submitMessage(input.value, 'text');
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  refreshView();
  setInterval(() => {
    loadLanguageButtons().catch(() => {});
    loadDownloads().catch(() => {});
  }, 10000);

  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      loadLanguageButtons().catch(() => {});
    }
  });
})();
