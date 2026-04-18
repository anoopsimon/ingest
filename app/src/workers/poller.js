const { mapTorrentStatus, normalizeHash } = require('../qb');

function createPoller({ db, qb }) {
  let interval = null;
  let running = false;

  async function pollOnce() {
    if (running) {
      return;
    }

    running = true;
    try {
      const torrents = await qb.listTorrents();
      const torrentMap = new Map();
      for (const torrent of torrents) {
        const hash = normalizeHash(torrent.hash);
        if (hash) {
          torrentMap.set(hash, torrent);
        }
      }

      const activeDownloads = db.listActiveDownloads();
      for (const download of activeDownloads) {
        const torrent = download.info_hash ? torrentMap.get(normalizeHash(download.info_hash)) : null;
        if (!torrent) {
          if (download.status === 'completed' && !download.completion_notified_at) {
            const completionText = `Download complete: ${download.folder_name}`;
            if (!db.messageExists(download.session_id, completionText)) {
              db.insertMessage(download.session_id, 'system', completionText);
            }
            db.updateDownload(download.id, {
              completion_notified_at: db.now(),
              torrent_removed_at: db.now(),
              status: 'completed'
            });
          } else if (download.status === 'completed' && !download.torrent_removed_at) {
            db.updateDownload(download.id, {
              torrent_removed_at: db.now(),
              status: 'completed'
            });
          }
          continue;
        }

        const nextStatus = mapTorrentStatus(torrent);
        const changedName = torrent.name && torrent.name !== download.qb_name ? torrent.name : null;
        const changedStatus = nextStatus !== download.status;
        const patch = {
          status: nextStatus,
          qb_name: changedName || download.qb_name,
          updated_at: db.now()
        };

        if (changedStatus || changedName) {
          db.updateDownload(download.id, patch);
        }

        if (nextStatus === 'completed') {
          const completionText = `Download complete: ${download.folder_name}`;
          if (!download.completed_at) {
            db.updateDownload(download.id, {
              status: 'completed',
              completed_at: db.now(),
              qb_name: changedName || download.qb_name
            });
          }

          if (!download.completion_notified_at && !db.messageExists(download.session_id, completionText)) {
            const notifiedAt = db.now();
            db.insertMessage(download.session_id, 'system', completionText);
            db.updateDownload(download.id, {
              status: 'completed',
              completion_notified_at: notifiedAt,
              completed_at: download.completed_at || notifiedAt,
              qb_name: changedName || download.qb_name
            });
          }

          if (!download.torrent_removed_at) {
            try {
              await qb.removeTorrent({
                hashes: download.info_hash,
                deleteFiles: false
              });
              db.updateDownload(download.id, {
                status: 'completed',
                torrent_removed_at: db.now(),
                qb_name: changedName || download.qb_name
              });
            } catch (error) {
              console.error('[poller] failed to remove completed torrent:', error.message);
            }
          }
        }

        if (nextStatus === 'failed' && download.status !== 'failed') {
          db.updateDownload(download.id, {
            status: 'failed',
            qb_name: changedName || download.qb_name
          });
        }
      }
    } catch (error) {
      console.error('[poller] qBittorrent polling failed:', error.message);
    } finally {
      running = false;
    }
  }

  function start(intervalMs) {
    stop();
    pollOnce().catch((error) => {
      console.error('[poller] initial poll failed:', error.message);
    });
    interval = setInterval(() => {
      pollOnce().catch((error) => {
        console.error('[poller] poll failed:', error.message);
      });
    }, intervalMs);
  }

  function stop() {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  }

  return {
    pollOnce,
    start,
    stop
  };
}

module.exports = {
  createPoller
};
