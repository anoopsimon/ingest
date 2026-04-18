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
      <div class="progress-inline">
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
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 7;
      cell.className = 'empty-state';
      cell.textContent = 'No downloads yet.';
      row.appendChild(cell);
      body.appendChild(row);
      return;
    }

    for (const download of downloads) {
      const row = document.createElement('tr');
      const title = download.display_name || download.qb_name || download.folder_name || '';
      const created = formatTime(download.created_at);

      row.innerHTML = `
        <td data-label="Title">${escapeHtml(title)}</td>
        <td data-label="Language">${escapeHtml(download.language || '')}</td>
        <td data-label="Folder name">${escapeHtml(download.folder_name || '')}</td>
        <td data-label="Status"><span class="status-pill ${statusClass(download.status)}">${escapeHtml(download.status || '')}</span></td>
        <td data-label="Progress">${renderProgress(download)}</td>
        <td data-label="Save path">${escapeHtml(download.save_path || '')}</td>
        <td data-label="Created">${escapeHtml(created)}</td>
      `;
      body.appendChild(row);
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
