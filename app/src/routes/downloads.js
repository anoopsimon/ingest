const express = require('express');
const { mapTorrentStatus, normalizeHash } = require('../qb');

function createDownloadsRouter({ db, qb }) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const parsed = Number(req.query.limit || 100);
    const limit = Number.isFinite(parsed) ? Math.max(1, Math.min(Math.floor(parsed), 500)) : 100;

    const downloads = db.listDownloads(limit);
    let torrentMap = new Map();

    try {
      const torrents = await qb.listTorrents();
      torrentMap = new Map(
        torrents
          .map((torrent) => [normalizeHash(torrent.hash), torrent])
          .filter(([hash]) => Boolean(hash))
      );
    } catch (error) {
      torrentMap = new Map();
    }

    const liveDownloads = downloads.map((download) => {
      const torrent = download.info_hash ? torrentMap.get(normalizeHash(download.info_hash)) : null;
      const liveProgress = torrent ? Number(torrent.progress || 0) : null;
      const progressPercent = Number.isFinite(liveProgress)
        ? Math.max(0, Math.min(100, Math.round(liveProgress * 100)))
        : download.status === 'completed'
          ? 100
          : 0;

      return {
        ...download,
        live_state: torrent ? mapTorrentStatus(torrent) : null,
        progress_percent: progressPercent,
        torrent_downloaded: torrent ? torrent.downloaded ?? null : null,
        torrent_size: torrent ? torrent.size ?? null : null,
        torrent_eta: torrent ? torrent.eta ?? null : null,
        torrent_speed: torrent ? torrent.dlspeed ?? null : null,
        torrent_state: torrent ? torrent.state ?? null : null,
        has_live_torrent: Boolean(torrent)
      };
    });

    return res.json({ downloads: liveDownloads });
  });

  return router;
}

module.exports = {
  createDownloadsRouter
};
