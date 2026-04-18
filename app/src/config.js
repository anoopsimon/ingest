const path = require('path');

function readNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const languageOptions = [
  {
    key: 'malayalam',
    label: 'Malayalam',
    env: 'BASE_MALAYALAM',
    basePath: process.env.BASE_MALAYALAM || '/mnt/media/malayalam'
  },
  {
    key: 'english',
    label: 'English',
    env: 'BASE_ENGLISH',
    basePath: process.env.BASE_ENGLISH || '/mnt/media/english'
  },
  {
    key: 'tamil',
    label: 'Tamil',
    env: 'BASE_TAMIL',
    basePath: process.env.BASE_TAMIL || '/mnt/media/tamil'
  },
  {
    key: 'hindi',
    label: 'Hindi',
    env: 'BASE_HINDI',
    basePath: process.env.BASE_HINDI || '/mnt/media/hindi'
  }
];

const languageLookup = new Map();
for (const option of languageOptions) {
  languageLookup.set(option.label.toLowerCase(), option);
  languageLookup.set(option.key.toLowerCase(), option);
}

const config = {
  port: readNumber(process.env.PORT, 3000),
  qbUrl: process.env.QB_URL || 'http://qbittorrent:8080',
  qbUsername: process.env.QB_USERNAME || 'admin',
  qbPassword: process.env.QB_PASSWORD || 'adminadmin',
  qbLogPath: process.env.QB_LOG_PATH || '/qbittorrent-config/qBittorrent/logs/qbittorrent.log',
  dbPath: process.env.DB_PATH || '/app/data/app.db',
  pollIntervalMs: readNumber(process.env.POLL_INTERVAL_MS, 15000),
  languageOptions,
  languageLookup,
  basePaths: Object.fromEntries(languageOptions.map((option) => [option.key, path.resolve(option.basePath)]))
};

function resolveLanguage(input) {
  if (!input) {
    return null;
  }

  const normalized = String(input).trim().toLowerCase();
  return languageLookup.get(normalized) || null;
}

module.exports = {
  config,
  resolveLanguage
};
