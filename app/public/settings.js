(function () {
  const form = document.getElementById('mappingForm');
  const settingsList = document.getElementById('settingsList');
  const settingsSummary = document.getElementById('settingsSummary');
  const newButton = document.getElementById('newButton');
  const resetButton = document.getElementById('resetButton');

  const keyInput = document.getElementById('mappingKey');
  const labelInput = document.getElementById('mappingLabel');
  const slugInput = document.getElementById('mappingSlug');
  const basePathInput = document.getElementById('mappingBasePath');
  const sortOrderInput = document.getElementById('mappingSortOrder');
  const enabledInput = document.getElementById('mappingEnabled');

  let editingKey = null;
  let languageMappings = [];

  function showError(messageText) {
    const existing = settingsList.querySelector('.settings-error');
    if (existing) {
      existing.remove();
    }

    const message = document.createElement('div');
    message.className = 'message system status-danger settings-error';
    message.textContent = messageText;
    settingsList.prepend(message);
  }

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  function slugify(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-+/g, '-');
  }

  function renderSummary() {
    const active = languageMappings.filter((item) => Number(item.enabled) === 1).length;
    settingsSummary.textContent = languageMappings.length
      ? `${languageMappings.length} total · ${active} enabled`
      : 'No mappings yet';
  }

  function resetForm() {
    editingKey = null;
    keyInput.value = '';
    keyInput.disabled = false;
    labelInput.value = '';
    slugInput.value = '';
    basePathInput.value = '';
    sortOrderInput.value = '0';
    enabledInput.checked = true;
    form.dataset.mode = 'new';
    labelInput.focus();
  }

  function fillForm(mapping) {
    editingKey = mapping.key;
    keyInput.value = mapping.key || '';
    keyInput.disabled = true;
    labelInput.value = mapping.label || '';
    slugInput.value = mapping.key || '';
    basePathInput.value = mapping.base_path || '';
    sortOrderInput.value = String(mapping.sort_order ?? 0);
    enabledInput.checked = Number(mapping.enabled) === 1;
    form.dataset.mode = 'edit';
    labelInput.focus();
  }

  function renderMappings() {
    settingsList.innerHTML = '';

    if (!languageMappings.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No language mappings configured.';
      settingsList.appendChild(empty);
      renderSummary();
      return;
    }

    for (const mapping of languageMappings) {
      const card = document.createElement('article');
      card.className = 'mapping-card';
      const enabled = Number(mapping.enabled) === 1;
      card.innerHTML = `
        <div class="mapping-card-head">
          <div>
            <h2 class="mapping-title">${escapeHtml(mapping.label || '')}</h2>
            <div class="mapping-subtitle">${escapeHtml(mapping.key || '')}</div>
          </div>
          <span class="status-pill ${enabled ? 'completed' : 'stalled'}">${enabled ? 'Enabled' : 'Disabled'}</span>
        </div>
        <div class="mapping-path">${escapeHtml(mapping.base_path || '')}</div>
        <div class="mapping-meta">
          <span>Sort ${escapeHtml(String(mapping.sort_order ?? 0))}</span>
          <span>Updated ${escapeHtml(mapping.updated_at || '')}</span>
        </div>
      <div class="mapping-actions">
          <button class="button" type="button" data-action="edit">Edit</button>
          <button class="button" type="button" data-action="delete">Delete</button>
        </div>
      `;

      card.querySelector('[data-action="edit"]').addEventListener('click', () => fillForm(mapping));
      card.querySelector('[data-action="delete"]').addEventListener('click', () => {
        deleteMapping(mapping.key).catch((error) => showError(error.message || 'Failed to delete mapping'));
      });
      settingsList.appendChild(card);
    }

    renderSummary();
  }

  async function loadMappings() {
    const response = await fetch('/api/settings/languages?all=1');
    if (!response.ok) {
      throw new Error('Failed to load language mappings');
    }

    const data = await response.json();
    languageMappings = Array.isArray(data.languages) ? data.languages : [];
    renderMappings();
  }

  async function saveMapping(event) {
    event.preventDefault();

    const payload = {
      key: slugInput.value.trim() || slugify(labelInput.value),
      label: labelInput.value.trim(),
      basePath: basePathInput.value.trim(),
      sortOrder: Number(sortOrderInput.value || 0),
      enabled: enabledInput.checked
    };

    const url = editingKey
      ? `/api/settings/languages/${encodeURIComponent(editingKey)}`
      : '/api/settings/languages';
    const method = editingKey ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to save mapping');
    }

    await loadMappings();
    resetForm();
  }

  async function deleteMapping(key) {
    if (!key) {
      return;
    }

    const confirmed = window.confirm(`Delete mapping "${key}"?`);
    if (!confirmed) {
      return;
    }

    const response = await fetch(`/api/settings/languages/${encodeURIComponent(key)}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error('Failed to delete mapping');
    }

    await loadMappings();
    if (editingKey === key) {
      resetForm();
    }
  }

  labelInput.addEventListener('input', () => {
    if (editingKey) {
      return;
    }

    if (!slugInput.value.trim()) {
      slugInput.value = slugify(labelInput.value);
    }
  });

  form.addEventListener('submit', (event) => {
    saveMapping(event).catch((error) => {
      showError(error.message || 'Failed to save mapping.');
    });
  });

  newButton.addEventListener('click', resetForm);
  resetButton.addEventListener('click', resetForm);

  loadMappings()
    .catch(() => {
      languageMappings = [];
      renderMappings();
    })
    .finally(() => {
      resetForm();
    });
})();
