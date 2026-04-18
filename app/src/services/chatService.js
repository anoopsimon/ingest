const fs = require('fs/promises');
const { buildExactSavePath, parseMagnet, sanitizeFolderName, isValidMagnetLink } = require('./magnet');

function createChatService({ db, qb, config, resolveLanguage }) {
  async function handleMessage({ sessionId, message, inputType }) {
    const session = db.ensureSession(sessionId);
    const trimmed = typeof message === 'string' ? message.trim() : '';
    db.insertMessage(sessionId, 'user', trimmed);
    const responses = [];

    if (session.state === 'idle') {
      const parsed = parseMagnet(trimmed);
      if (!isValidMagnetLink(trimmed) || !parsed.valid) {
        responses.push('That does not look like a valid magnet link.');
        return persistResponses(sessionId, responses);
      }

      db.updateSession(sessionId, {
        state: 'waiting_language',
        pending_magnet: parsed.magnet,
        pending_display_name: parsed.displayName,
        selected_language: null,
        pending_folder_name: null
      });

      responses.push('Magnet received.');
      if (parsed.displayName) {
        responses.push(`Parsed title: ${parsed.displayName}`);
      }
      responses.push('Choose language.');
      return persistResponses(sessionId, responses);
    }

    if (session.state === 'waiting_language') {
      const selected = resolveLanguage(trimmed);
      if (!selected || (inputType === 'language' && !selected)) {
        responses.push('Choose language.');
        return persistResponses(sessionId, responses);
      }

      db.updateSession(sessionId, {
        state: 'waiting_folder_name',
        selected_language: selected.label
      });

      responses.push('Movie folder name?');
      return persistResponses(sessionId, responses);
    }

    if (session.state === 'waiting_folder_name') {
      const folderName = sanitizeFolderName(trimmed);
      if (!folderName) {
        responses.push('Folder name is required.');
        return persistResponses(sessionId, responses);
      }

      const selectedLanguage = resolveLanguage(session.selected_language);
      const basePath = selectedLanguage ? selectedLanguage.basePath : null;
      const savePath = buildExactSavePath(basePath, folderName);
      if (!savePath) {
        responses.push('Folder name is required.');
        return persistResponses(sessionId, responses);
      }

      const pendingMagnet = session.pending_magnet;
      const magnetData = parseMagnet(pendingMagnet);

      try {
        await fs.mkdir(savePath, { recursive: true });

        const queuedDownload = db.createDownload({
          session_id: sessionId,
          info_hash: magnetData.infoHash,
          magnet: pendingMagnet,
          display_name: session.pending_display_name || null,
          language: selectedLanguage ? selectedLanguage.label : session.selected_language,
          folder_name: folderName,
          save_path: savePath,
          status: 'queued',
          qb_name: session.pending_display_name || folderName
        });

        await qb.addMagnet({
          magnet: pendingMagnet,
          savePath
        });

        db.updateDownload(queuedDownload.id, {
          status: 'queued',
          qb_name: session.pending_display_name || folderName,
          save_path: savePath,
          info_hash: magnetData.infoHash,
          display_name: session.pending_display_name || null,
          language: selectedLanguage ? selectedLanguage.label : session.selected_language,
          folder_name: folderName,
          magnet: pendingMagnet
        });

        db.updateSession(sessionId, {
          state: 'idle',
          pending_magnet: null,
          pending_display_name: null,
          selected_language: null,
          pending_folder_name: null
        });

        responses.push('Queued.');
        responses.push(`Saving to ${savePath}`);
        return persistResponses(sessionId, responses);
      } catch (error) {
        console.error('[chat] queue failed:', error.message);
        const existing = db.findDownloadByInfoHash(magnetData.infoHash);
        if (existing) {
          db.updateDownload(existing.id, {
            status: 'failed',
            qb_name: session.pending_display_name || folderName
          });
        } else {
          db.createDownload({
            session_id: sessionId,
            info_hash: magnetData.infoHash,
            magnet: pendingMagnet,
            display_name: session.pending_display_name || null,
            language: selectedLanguage ? selectedLanguage.label : session.selected_language,
            folder_name: folderName,
            save_path: savePath,
            status: 'failed',
            qb_name: session.pending_display_name || folderName
          });
        }

        db.updateSession(sessionId, {
          state: 'idle',
          pending_magnet: null,
          pending_display_name: null,
          selected_language: null,
          pending_folder_name: null
        });

        responses.push('Failed to queue.');
        return persistResponses(sessionId, responses);
      }
    }

    db.updateSession(sessionId, {
      state: 'idle',
      pending_magnet: null,
      pending_display_name: null,
      selected_language: null,
      pending_folder_name: null
    });
    responses.push('Paste a magnet link to begin.');
    return persistResponses(sessionId, responses);
  }

  function persistResponses(sessionId, responses) {
    const inserted = responses.map((content) => db.insertMessage(sessionId, 'system', content));
    const session = db.getSession(sessionId);
    return {
      session,
      messages: inserted,
      sessionState: session?.state || 'idle'
    };
  }

  return {
    handleMessage
  };
}

module.exports = {
  createChatService
};
