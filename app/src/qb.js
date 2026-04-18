const fs = require('fs/promises');

function createTimeoutSignal(ms) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('Request timed out')), ms);
  return { controller, timeout };
}

class QbClient {
  constructor({ baseUrl, username, password, logPath }) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.username = username;
    this.password = password;
    this.logPath = logPath || null;
    this.cookie = null;
    this.cookieExpiresAt = 0;
    this.loginInFlight = null;
  }

  async readTemporaryPassword() {
    if (!this.logPath) {
      return null;
    }

    try {
      const contents = await fs.readFile(this.logPath, 'utf8');
      const matches = [...contents.matchAll(/temporary password is provided for this session:\s+([^\s]+)/gi)];
      if (!matches.length) {
        return null;
      }

      return matches[matches.length - 1][1].trim();
    } catch (error) {
      return null;
    }
  }

  async login() {
    if (this.loginInFlight) {
      return this.loginInFlight;
    }

    this.loginInFlight = (async () => {
      const candidates = [];
      const tempPassword = await this.readTemporaryPassword();
      if (tempPassword) {
        candidates.push(tempPassword);
      }
      if (!candidates.includes(this.password)) {
        candidates.push(this.password);
      }

      let lastError = null;
      for (const candidate of candidates) {
        const form = new URLSearchParams({
          username: this.username,
          password: candidate
        });

        const { controller, timeout } = createTimeoutSignal(10000);
        try {
          const response = await fetch(`${this.baseUrl}/api/v2/auth/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: form.toString(),
            signal: controller.signal
          });

          const text = await response.text().catch(() => '');
          if (!response.ok) {
            lastError = new Error(`qBittorrent login failed (${response.status}): ${text || response.statusText}`);
            continue;
          }

          if (String(text).trim().toLowerCase() === 'fails.') {
            lastError = new Error('qBittorrent login failed: invalid credentials');
            continue;
          }

          const setCookie = response.headers.get('set-cookie');
          if (!setCookie) {
            lastError = new Error('qBittorrent did not return a session cookie');
            continue;
          }

          this.cookie = setCookie.split(';')[0];
          this.cookieExpiresAt = Date.now() + 5 * 60 * 1000;
          return true;
        } finally {
          clearTimeout(timeout);
        }
      }

      throw lastError || new Error('qBittorrent login failed');
    })().finally(() => {
      this.loginInFlight = null;
    });

    return this.loginInFlight;
  }

  async request(pathname, options = {}, attempt = 0) {
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json, text/plain, */*');

    if (!this.cookie || Date.now() >= this.cookieExpiresAt) {
      await this.login();
    }

    headers.set('Cookie', this.cookie);

    const { controller, timeout } = createTimeoutSignal(options.timeoutMs || 10000);
    try {
      const response = await fetch(`${this.baseUrl}${pathname}`, {
        method: options.method || 'GET',
        headers,
        body: options.body,
        signal: controller.signal
      });

      if ((response.status === 401 || response.status === 403) && attempt < 1) {
        this.cookie = null;
        this.cookieExpiresAt = 0;
        await this.login();
        return this.request(pathname, options, attempt + 1);
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`qBittorrent request failed (${response.status}): ${text || response.statusText}`);
      }

      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  async ping() {
    const response = await this.request('/api/v2/app/version', { timeoutMs: 5000 });
    return response.text();
  }

  async addMagnet({ magnet, savePath }) {
    const body = new URLSearchParams({
      urls: magnet,
      savepath: savePath,
      paused: 'false',
      autoTMM: 'false',
      contentLayout: 'NoSubfolder'
    });

    await this.request('/api/v2/torrents/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString(),
      timeoutMs: 15000
    });

    return true;
  }

  async removeTorrent({ hashes, deleteFiles = false }) {
    const body = new URLSearchParams({
      hashes: Array.isArray(hashes) ? hashes.join('|') : String(hashes || ''),
      deleteFiles: deleteFiles ? 'true' : 'false'
    });

    await this.request('/api/v2/torrents/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString(),
      timeoutMs: 15000
    });

    return true;
  }

  async listTorrents() {
    const response = await this.request('/api/v2/torrents/info?filter=all', {
      timeoutMs: 10000
    });

    return response.json();
  }
}

function normalizeHash(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : null;
}

function mapTorrentStatus(torrent) {
  if (!torrent) {
    return 'failed';
  }

  const state = String(torrent.state || '').toLowerCase();
  const progress = Number(torrent.progress || 0);

  if (state === 'error' || state === 'missingfiles') {
    return 'failed';
  }

  if (progress >= 1 || state === 'uploading' || state === 'forcedup' || state === 'queuedup' || state === 'stalledup' || state === 'pausedup') {
    return 'completed';
  }

  if (state.includes('stalled') || state.includes('paused')) {
    return 'stalled';
  }

  if (state.includes('queued') || state === 'metadl') {
    return 'queued';
  }

  if (state.includes('downloading') || state.includes('allocating') || state.includes('checking') || state === 'forceddl') {
    return 'downloading';
  }

  return progress > 0 ? 'downloading' : 'queued';
}

module.exports = {
  QbClient,
  normalizeHash,
  mapTorrentStatus
};
