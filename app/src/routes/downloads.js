const express = require('express');

function createDownloadsRouter({ db }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const parsed = Number(req.query.limit || 100);
    const limit = Number.isFinite(parsed) ? Math.max(1, Math.min(Math.floor(parsed), 500)) : 100;
    const downloads = db.listDownloads(limit);
    return res.json({ downloads });
  });

  return router;
}

module.exports = {
  createDownloadsRouter
};
