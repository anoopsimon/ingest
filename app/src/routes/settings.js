const express = require('express');
const fs = require('fs');
const path = require('path');

function isTruthy(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function createSettingsRouter({ db }) {
  const router = express.Router();

  router.get('/languages', (req, res) => {
    const includeDisabled = isTruthy(req.query.all);
    return res.json({ languages: db.listLanguageMappings(includeDisabled) });
  });

  router.post('/languages', express.json({ limit: '2mb' }), (req, res) => {
    const payload = req.body || {};
    const basePath = String(payload.basePath || payload.base_path || '').trim();

    if (!String(payload.label || '').trim()) {
      return res.status(400).json({ error: 'label is required' });
    }

    if (!basePath) {
      return res.status(400).json({ error: 'basePath is required' });
    }

    if (!path.isAbsolute(basePath)) {
      return res.status(400).json({ error: 'basePath must be absolute' });
    }

    fs.mkdirSync(basePath, { recursive: true });

    const language = db.upsertLanguageMapping({
      key: payload.key,
      label: payload.label,
      basePath,
      enabled: payload.enabled,
      sortOrder: payload.sortOrder
    });

    if (!language) {
      return res.status(400).json({ error: 'invalid language mapping' });
    }

    return res.status(201).json({ language });
  });

  router.put('/languages/:key', express.json({ limit: '2mb' }), (req, res) => {
    const payload = req.body || {};
    const basePath = String(payload.basePath || payload.base_path || '').trim();

    if (!String(payload.label || '').trim()) {
      return res.status(400).json({ error: 'label is required' });
    }

    if (!basePath) {
      return res.status(400).json({ error: 'basePath is required' });
    }

    if (!path.isAbsolute(basePath)) {
      return res.status(400).json({ error: 'basePath must be absolute' });
    }

    fs.mkdirSync(basePath, { recursive: true });

    const language = db.upsertLanguageMapping({
      key: req.params.key,
      label: payload.label,
      basePath,
      enabled: payload.enabled,
      sortOrder: payload.sortOrder
    });

    if (!language) {
      return res.status(400).json({ error: 'invalid language mapping' });
    }

    return res.json({ language });
  });

  router.delete('/languages/:key', (req, res) => {
    const removed = db.deleteLanguageMapping(req.params.key);
    if (!removed) {
      return res.status(404).json({ error: 'Language not found' });
    }

    return res.json({ ok: true });
  });

  return router;
}

module.exports = {
  createSettingsRouter
};
