const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

function now() {
  return new Date().toISOString();
}

function normalizeLanguageKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function openDatabase(dbPath, options = {}) {
  const seedLanguageOptions = Array.isArray(options.seedLanguageOptions) ? options.seedLanguageOptions : [];
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      state TEXT NOT NULL DEFAULT 'idle',
      pending_magnet TEXT,
      pending_display_name TEXT,
      selected_language TEXT,
      selected_language_key TEXT,
      pending_folder_name TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'system')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS downloads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      info_hash TEXT,
      magnet TEXT NOT NULL,
      display_name TEXT,
      language TEXT NOT NULL,
      folder_name TEXT NOT NULL,
      save_path TEXT NOT NULL,
      status TEXT NOT NULL,
      qb_name TEXT,
      completed_at TEXT,
      completion_notified_at TEXT,
      torrent_removed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS language_mappings (
      key TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      base_path TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session_created ON messages(session_id, id);
    CREATE INDEX IF NOT EXISTS idx_downloads_status_created ON downloads(status, id);
    CREATE INDEX IF NOT EXISTS idx_downloads_hash ON downloads(info_hash);
  `);

  const downloadColumns = new Set(
    db.prepare(`PRAGMA table_info(downloads)`).all().map((row) => row.name)
  );
  if (!downloadColumns.has('completion_notified_at')) {
    db.exec(`ALTER TABLE downloads ADD COLUMN completion_notified_at TEXT`);
  }
  if (!downloadColumns.has('torrent_removed_at')) {
    db.exec(`ALTER TABLE downloads ADD COLUMN torrent_removed_at TEXT`);
  }

  const sessionColumns = new Set(
    db.prepare(`PRAGMA table_info(sessions)`).all().map((row) => row.name)
  );
  if (!sessionColumns.has('selected_language_key')) {
    db.exec(`ALTER TABLE sessions ADD COLUMN selected_language_key TEXT`);
  }

  const ensureSessionStmt = db.prepare(`
    INSERT INTO sessions (id, state, created_at, updated_at)
    VALUES (@id, 'idle', @created_at, @updated_at)
    ON CONFLICT(id) DO NOTHING
  `);

  const getSessionStmt = db.prepare(`SELECT * FROM sessions WHERE id = ?`);
  const updateSessionStmt = db.prepare(`
    UPDATE sessions
    SET state = @state,
        pending_magnet = @pending_magnet,
        pending_display_name = @pending_display_name,
        selected_language = @selected_language,
        selected_language_key = @selected_language_key,
        pending_folder_name = @pending_folder_name,
        updated_at = @updated_at
    WHERE id = @id
  `);

  const insertMessageStmt = db.prepare(`
    INSERT INTO messages (session_id, role, content, created_at)
    VALUES (@session_id, @role, @content, @created_at)
  `);

  const messageExistsStmt = db.prepare(`
    SELECT 1
    FROM messages
    WHERE session_id = ? AND role = 'system' AND content = ?
    LIMIT 1
  `);

  const listMessagesStmt = db.prepare(`
    SELECT id, session_id, role, content, created_at
    FROM messages
    WHERE session_id = ?
    ORDER BY id ASC
  `);
  const deleteMessagesForSessionStmt = db.prepare(`
    DELETE FROM messages
    WHERE session_id = ?
  `);

  const insertDownloadStmt = db.prepare(`
    INSERT INTO downloads (
      session_id, info_hash, magnet, display_name, language, folder_name, save_path, status, qb_name, completed_at, completion_notified_at, torrent_removed_at, created_at, updated_at
    ) VALUES (
      @session_id, @info_hash, @magnet, @display_name, @language, @folder_name, @save_path, @status, @qb_name, @completed_at, @completion_notified_at, @torrent_removed_at, @created_at, @updated_at
    )
  `);

  const updateDownloadStmt = db.prepare(`
    UPDATE downloads
    SET info_hash = COALESCE(@info_hash, info_hash),
        magnet = COALESCE(@magnet, magnet),
        display_name = COALESCE(@display_name, display_name),
        language = COALESCE(@language, language),
        folder_name = COALESCE(@folder_name, folder_name),
        save_path = COALESCE(@save_path, save_path),
        status = COALESCE(@status, status),
        qb_name = COALESCE(@qb_name, qb_name),
        completed_at = COALESCE(@completed_at, completed_at),
        completion_notified_at = COALESCE(@completion_notified_at, completion_notified_at),
        torrent_removed_at = COALESCE(@torrent_removed_at, torrent_removed_at),
        updated_at = @updated_at
    WHERE id = @id
  `);

  const getDownloadByIdStmt = db.prepare(`SELECT * FROM downloads WHERE id = ?`);
  const getDownloadByHashStmt = db.prepare(`
    SELECT * FROM downloads
    WHERE info_hash = ?
    ORDER BY id DESC
    LIMIT 1
  `);
  const listDownloadsStmt = db.prepare(`
    SELECT * FROM downloads
    ORDER BY id DESC
    LIMIT ?
  `);
  const deleteDownloadsStmt = db.prepare(`
    DELETE FROM downloads
    WHERE status IN ('completed', 'failed')
       OR torrent_removed_at IS NOT NULL
  `);
  const listActiveDownloadsStmt = db.prepare(`
    SELECT * FROM downloads
    WHERE status IN ('queued', 'downloading', 'stalled', 'completed')
      AND (status != 'completed' OR torrent_removed_at IS NULL)
    ORDER BY id ASC
  `);

  const listLanguageMappingsStmt = db.prepare(`
    SELECT * FROM language_mappings
    WHERE enabled = 1
    ORDER BY sort_order ASC, label ASC
  `);
  const listAllLanguageMappingsStmt = db.prepare(`
    SELECT * FROM language_mappings
    ORDER BY sort_order ASC, label ASC
  `);
  const getLanguageMappingByKeyStmt = db.prepare(`
    SELECT * FROM language_mappings
    WHERE lower(key) = lower(?)
    LIMIT 1
  `);
  const getLanguageMappingByLabelStmt = db.prepare(`
    SELECT * FROM language_mappings
    WHERE lower(label) = lower(?)
    LIMIT 1
  `);
  const upsertLanguageMappingStmt = db.prepare(`
    INSERT INTO language_mappings (key, label, base_path, enabled, sort_order, created_at, updated_at)
    VALUES (@key, @label, @base_path, @enabled, @sort_order, @created_at, @updated_at)
    ON CONFLICT(key) DO UPDATE SET
      label = excluded.label,
      base_path = excluded.base_path,
      enabled = excluded.enabled,
      sort_order = excluded.sort_order,
      updated_at = excluded.updated_at
  `);
  const deleteLanguageMappingStmt = db.prepare(`DELETE FROM language_mappings WHERE lower(key) = lower(?)`);

  function ensureSession(id) {
    const timestamp = now();
    ensureSessionStmt.run({ id, created_at: timestamp, updated_at: timestamp });
    return getSessionStmt.get(id);
  }

  function getSession(id) {
    return getSessionStmt.get(id) || null;
  }

  function updateSession(id, patch) {
    const current = getSession(id);
    if (!current) {
      return null;
    }

    const row = {
      id,
      state: patch.state || current.state,
      pending_magnet: Object.prototype.hasOwnProperty.call(patch, 'pending_magnet') ? patch.pending_magnet : current.pending_magnet,
      pending_display_name: Object.prototype.hasOwnProperty.call(patch, 'pending_display_name') ? patch.pending_display_name : current.pending_display_name,
      selected_language: Object.prototype.hasOwnProperty.call(patch, 'selected_language') ? patch.selected_language : current.selected_language,
      selected_language_key: Object.prototype.hasOwnProperty.call(patch, 'selected_language_key') ? patch.selected_language_key : current.selected_language_key,
      pending_folder_name: Object.prototype.hasOwnProperty.call(patch, 'pending_folder_name') ? patch.pending_folder_name : current.pending_folder_name,
      updated_at: now()
    };

    updateSessionStmt.run(row);
    return getSessionStmt.get(id);
  }

  function insertMessage(sessionId, role, content) {
    const row = {
      session_id: sessionId,
      role,
      content,
      created_at: now()
    };
    insertMessageStmt.run(row);
    return row;
  }

  function getMessages(sessionId) {
    return listMessagesStmt.all(sessionId);
  }

  function clearChatHistory(sessionId) {
    const timestamp = now();
    ensureSessionStmt.run({ id: sessionId, created_at: timestamp, updated_at: timestamp });
    deleteMessagesForSessionStmt.run(sessionId);
    updateSessionStmt.run({
      id: sessionId,
      state: 'idle',
      pending_magnet: null,
      pending_display_name: null,
      selected_language: null,
      selected_language_key: null,
      pending_folder_name: null,
      updated_at: timestamp
    });
    return getSessionStmt.get(sessionId) || null;
  }

  function createDownload(payload) {
    const row = {
      session_id: payload.session_id,
      info_hash: payload.info_hash || null,
      magnet: payload.magnet,
      display_name: payload.display_name || null,
      language: payload.language,
      folder_name: payload.folder_name,
      save_path: payload.save_path,
      status: payload.status,
      qb_name: payload.qb_name || null,
      completed_at: payload.completed_at || null,
      completion_notified_at: payload.completion_notified_at || null,
      torrent_removed_at: payload.torrent_removed_at || null,
      created_at: payload.created_at || now(),
      updated_at: payload.updated_at || now()
    };

    const result = insertDownloadStmt.run(row);
    return getDownloadByIdStmt.get(result.lastInsertRowid);
  }

  function updateDownload(id, patch) {
    const current = getDownloadByIdStmt.get(id);
    if (!current) {
      return null;
    }

    updateDownloadStmt.run({
      id,
      info_hash: Object.prototype.hasOwnProperty.call(patch, 'info_hash') ? patch.info_hash : null,
      magnet: Object.prototype.hasOwnProperty.call(patch, 'magnet') ? patch.magnet : null,
      display_name: Object.prototype.hasOwnProperty.call(patch, 'display_name') ? patch.display_name : null,
      language: Object.prototype.hasOwnProperty.call(patch, 'language') ? patch.language : null,
      folder_name: Object.prototype.hasOwnProperty.call(patch, 'folder_name') ? patch.folder_name : null,
      save_path: Object.prototype.hasOwnProperty.call(patch, 'save_path') ? patch.save_path : null,
      status: Object.prototype.hasOwnProperty.call(patch, 'status') ? patch.status : null,
      qb_name: Object.prototype.hasOwnProperty.call(patch, 'qb_name') ? patch.qb_name : null,
      completed_at: Object.prototype.hasOwnProperty.call(patch, 'completed_at') ? patch.completed_at : null,
      completion_notified_at: Object.prototype.hasOwnProperty.call(patch, 'completion_notified_at') ? patch.completion_notified_at : null,
      torrent_removed_at: Object.prototype.hasOwnProperty.call(patch, 'torrent_removed_at') ? patch.torrent_removed_at : null,
      updated_at: now()
    });

    return getDownloadByIdStmt.get(id);
  }

  function findDownloadByInfoHash(infoHash) {
    if (!infoHash) {
      return null;
    }

    return getDownloadByHashStmt.get(String(infoHash).toLowerCase()) || null;
  }

  function listDownloads(limit = 100) {
    return listDownloadsStmt.all(limit);
  }

  function listActiveDownloads() {
    return listActiveDownloadsStmt.all();
  }

  function clearDownloads() {
    const result = deleteDownloadsStmt.run();
    return result.changes;
  }

  function seedLanguageMappings(defaultMappings = seedLanguageOptions) {
    const existing = new Set(
      listAllLanguageMappingsStmt.all().map((row) => String(row.key || '').toLowerCase())
    );

    for (const option of defaultMappings) {
      const key = normalizeLanguageKey(option.key || option.label);
      if (!key || existing.has(key)) {
        continue;
      }

      upsertLanguageMapping({
        key,
        label: option.label,
        base_path: option.basePath,
        enabled: true,
        sort_order: option.sortOrder || 0
      });
    }
  }

  function listLanguageMappings(includeDisabled = false) {
    return includeDisabled ? listAllLanguageMappingsStmt.all() : listLanguageMappingsStmt.all();
  }

  function resolveLanguage(input, fallbackMappings = []) {
    if (!input) {
      return null;
    }

    const value = String(input).trim();
    if (!value) {
      return null;
    }

    const fromDb =
      getLanguageMappingByKeyStmt.get(value) ||
      getLanguageMappingByLabelStmt.get(value) ||
      null;

    if (fromDb) {
      if (Number(fromDb.enabled) !== 1) {
        return null;
      }

      return {
        key: fromDb.key,
        label: fromDb.label,
        basePath: fromDb.base_path,
        enabled: true
      };
    }

    const normalized = value.toLowerCase();
    for (const option of fallbackMappings) {
      if (
        String(option.key || '').trim().toLowerCase() === normalized ||
        String(option.label || '').trim().toLowerCase() === normalized
      ) {
        return {
          key: option.key,
          label: option.label,
          basePath: option.basePath,
          enabled: true
        };
      }
    }

    return null;
  }

  function upsertLanguageMapping(payload) {
    const label = String(payload.label || '').trim();
    const basePath = String(payload.base_path || payload.basePath || '').trim();
    const key = normalizeLanguageKey(payload.key || label);

    if (!key || !label || !basePath) {
      return null;
    }

    const row = {
      key,
      label,
      base_path: basePath,
      enabled: Object.prototype.hasOwnProperty.call(payload, 'enabled') ? (payload.enabled ? 1 : 0) : 1,
      sort_order: Number.isFinite(Number(payload.sort_order ?? payload.sortOrder))
        ? Number(payload.sort_order ?? payload.sortOrder)
        : 0,
      created_at: now(),
      updated_at: now()
    };

    upsertLanguageMappingStmt.run(row);
    return getLanguageMappingByKeyStmt.get(key);
  }

  function deleteLanguageMapping(key) {
    const normalized = normalizeLanguageKey(key);
    if (!normalized) {
      return false;
    }

    const result = deleteLanguageMappingStmt.run(normalized);
    return result.changes > 0;
  }

  function messageExists(sessionId, content) {
    return Boolean(messageExistsStmt.get(sessionId, content));
  }

  function completeDownload(id) {
    const current = getDownloadByIdStmt.get(id);
    if (!current) {
      return null;
    }

    const timestamp = now();
    updateDownloadStmt.run({
      id,
      info_hash: null,
      magnet: null,
      display_name: null,
      language: null,
      folder_name: null,
      save_path: null,
      status: 'completed',
      qb_name: null,
      completed_at: timestamp,
      updated_at: timestamp
    });

    return getDownloadByIdStmt.get(id);
  }

  return {
    ensureSession,
    getSession,
    updateSession,
    insertMessage,
    getMessages,
    clearChatHistory,
    messageExists,
    createDownload,
    updateDownload,
    findDownloadByInfoHash,
    listDownloads,
    listActiveDownloads,
    clearDownloads,
    seedLanguageMappings,
    listLanguageMappings,
    resolveLanguage,
    upsertLanguageMapping,
    deleteLanguageMapping,
    completeDownload,
    now
  };
}

module.exports = {
  openDatabase,
  now
};
