const express = require('express');
const fs = require('fs');
const path = require('path');
const { config, resolveLanguage } = require('./config');
const { openDatabase } = require('./db');
const { QbClient } = require('./qb');
const { createChatService } = require('./services/chatService');
const { createChatRouter } = require('./routes/chat');
const { createDownloadsRouter } = require('./routes/downloads');
const { createHealthRouter } = require('./routes/health');
const { createPoller } = require('./workers/poller');

function ensureDirectories() {
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  for (const option of config.languageOptions) {
    fs.mkdirSync(option.basePath, { recursive: true });
  }
}

async function main() {
  ensureDirectories();

  const db = openDatabase(config.dbPath);
  const qb = new QbClient({
    baseUrl: config.qbUrl,
    username: config.qbUsername,
    password: config.qbPassword,
    logPath: config.qbLogPath
  });
  const chatService = createChatService({
    db,
    qb,
    config,
    resolveLanguage
  });
  const poller = createPoller({ db, qb });

  const app = express();
  const publicDir = path.join(__dirname, '..', 'public');

  app.disable('x-powered-by');
  app.use('/assets', express.static(publicDir));
  app.use(express.static(publicDir));

  app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  app.get('/downloads', (req, res) => {
    res.sendFile(path.join(publicDir, 'downloads.html'));
  });

  app.use('/api/chat', createChatRouter({ db, chatService }));
  app.use('/api/downloads', createDownloadsRouter({ db, qb }));
  app.use('/api/health', createHealthRouter({ qb }));

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err, req, res, next) => {
    console.error('[server] unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  const server = app.listen(config.port, () => {
    console.log(`Ingest listening on port ${config.port}`);
  });

  poller.start(config.pollIntervalMs);

  async function shutdown(signal) {
    console.log(`[server] received ${signal}, shutting down`);
    poller.stop();
    server.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  }

  process.on('SIGINT', () => {
    shutdown('SIGINT').catch((error) => {
      console.error('[server] shutdown error:', error);
      process.exit(1);
    });
  });

  process.on('SIGTERM', () => {
    shutdown('SIGTERM').catch((error) => {
      console.error('[server] shutdown error:', error);
      process.exit(1);
    });
  });
}

main().catch((error) => {
  console.error('[server] startup failed:', error);
  process.exit(1);
});
