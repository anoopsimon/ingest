const express = require('express');

function createHealthRouter({ qb }) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const result = {
      ok: true,
      qb: {
        ok: false,
        error: null
      }
    };

    try {
      const version = await qb.ping();
      result.qb.ok = true;
      result.qb.version = version;
    } catch (error) {
      result.qb.error = error.message;
    }

    return res.json(result);
  });

  return router;
}

module.exports = {
  createHealthRouter
};
