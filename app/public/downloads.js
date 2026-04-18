(function () {
  const body = document.getElementById('downloadsBody');
  const refreshButton = document.getElementById('refreshButton');

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

  function statusClass(status) {
    return String(status || '').toLowerCase();
  }

  function renderRows(downloads) {
    body.innerHTML = '';
    if (!downloads.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 6;
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
  }, 15000);
})();
