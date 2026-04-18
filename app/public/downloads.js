(function () {
  const body = document.getElementById('downloadsBody');
  const refreshButton = document.getElementById('refreshButton');
  const downloadsSummary = document.getElementById('downloadsSummary');

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  function formatTime(value) {
    if (!value) {
      return '';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleString();
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

  function statusClass(status) {
    return String(status || '').toLowerCase();
  }

  function renderProgress(download) {
    const percent = Number.isFinite(Number(download.progress_percent))
      ? Math.max(0, Math.min(100, Number(download.progress_percent)))
      : 0;
    const downloaded = formatBytes(download.torrent_downloaded);
    const total = formatBytes(download.torrent_size);
    const speed = formatBytes(download.torrent_speed);
    const eta = Number(download.torrent_eta);
    const etaText = Number.isFinite(eta) && eta > 0 ? `${Math.ceil(eta / 60)}m` : '';
    const extra = [speed ? `${speed}/s` : '', etaText ? `${etaText} left` : ''].filter(Boolean).join(' · ');

    return `
      <div class="progress-shell">
        <div class="progress-track" aria-hidden="true">
          <div class="progress-fill" style="width: ${percent}%"></div>
        </div>
        <div class="progress-foot">
          <span>${escapeHtml(String(percent))}%${downloaded && total ? ` · ${escapeHtml(downloaded)} / ${escapeHtml(total)}` : ''}</span>
          <span>${escapeHtml(extra)}</span>
        </div>
      </div>
    `;
  }

  function renderRows(downloads) {
    body.innerHTML = '';

    const activeCount = downloads.filter((download) =>
      ['queued', 'downloading', 'stalled'].includes(String(download.status || '').toLowerCase())
    ).length;
    downloadsSummary.textContent = downloads.length
      ? `${downloads.length} total · ${activeCount} active`
      : 'No downloads';

    if (!downloads.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state downloads-empty';
      empty.textContent = 'No downloads yet.';
      body.appendChild(empty);
      return;
    }

    for (const download of downloads) {
      const title = download.display_name || download.qb_name || download.folder_name || '';
      const created = formatTime(download.created_at);
      const active = ['queued', 'downloading', 'stalled'].includes(String(download.status || '').toLowerCase());

      const card = document.createElement('article');
      card.className = 'download-card';
      card.innerHTML = `
        <div class="download-card-head">
          <div class="download-card-titlewrap">
            <h2 class="download-card-title">${escapeHtml(title)}</h2>
            <div class="download-card-meta">
              <span>${escapeHtml(download.language || '')}</span>
              <span>•</span>
              <span>${escapeHtml(download.folder_name || '')}</span>
            </div>
          </div>
          <span class="status-pill ${statusClass(download.status)}">${escapeHtml(download.status || '')}</span>
        </div>
        <div class="download-card-body">
          ${renderProgress(download)}
          <div class="download-card-path">${escapeHtml(download.save_path || '')}</div>
          <div class="download-card-footer">
            <span>${active ? 'Live' : 'Stored'}</span>
            <span>${escapeHtml(created)}</span>
          </div>
        </div>
      `;
      body.appendChild(card);
    }
  }

  async function loadDownloads() {
    const response = await fetch('/api/downloads?limit=100');
    if (!response.ok) {
      throw new Error('Failed to load downloads');
    }
    const data = await response.json();
    renderRows(data.downloads || []);
  }

  refreshButton.addEventListener('click', () => {
    loadDownloads().catch(() => {});
  });

  loadDownloads().catch(() => {
    renderRows([]);
  });

  setInterval(() => {
    loadDownloads().catch(() => {});
  }, 10000);
})();
