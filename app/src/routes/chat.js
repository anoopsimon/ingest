const express = require('express');

function createChatRouter({ db, chatService }) {
  const router = express.Router();

  router.get('/history', (req, res) => {
    const sessionId = String(req.query.sessionId || '').trim();
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const session = db.ensureSession(sessionId);
    const messages = db.getMessages(sessionId);
    return res.json({ session, messages });
  });

  router.post('/message', express.json({ limit: '2mb' }), async (req, res) => {
    const sessionId = String(req.body?.sessionId || '').trim();
    const message = String(req.body?.message || '').trim();
    const inputType = String(req.body?.inputType || 'text').trim();

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    try {
      const result = await chatService.handleMessage({
        sessionId,
        message,
        inputType
      });

      return res.json({
        session: result.session,
        messages: result.messages
      });
    } catch (error) {
      console.error('[chat] message handling failed:', error);
      return res.status(500).json({ error: 'Failed to process message' });
    }
  });

  return router;
}

module.exports = {
  createChatRouter
};

