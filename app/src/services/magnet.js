const path = require('path');

function isValidMagnetLink(value) {
  return typeof value === 'string' && value.trim().startsWith('magnet:?xt=urn:btih:');
}

function parseMagnet(value) {
  if (!isValidMagnetLink(value)) {
    return {
      valid: false,
      infoHash: null,
      displayName: null,
      magnet: typeof value === 'string' ? value.trim() : ''
    };
  }

  try {
    const magnet = value.trim();
    const url = new URL(magnet);
    const xt = url.searchParams.get('xt') || '';
    const displayName = url.searchParams.get('dn') ? url.searchParams.get('dn') : null;
    const infoHash = extractInfoHash(xt);

    return {
      valid: Boolean(infoHash),
      infoHash,
      displayName,
      magnet
    };
  } catch (error) {
    return {
      valid: false,
      infoHash: null,
      displayName: null,
      magnet: typeof value === 'string' ? value.trim() : ''
    };
  }
}

function extractInfoHash(xtValue) {
  const prefix = 'urn:btih:';
  if (!xtValue || !xtValue.toLowerCase().startsWith(prefix)) {
    return null;
  }

  const raw = xtValue.slice(prefix.length).trim();
  if (/^[a-fA-F0-9]{40}$/.test(raw)) {
    return raw.toLowerCase();
  }

  if (/^[A-Z2-7]{32}$/i.test(raw)) {
    return base32ToHex(raw);
  }

  return null;
}

function base32ToHex(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let buffer = 0;
  const bytes = [];

  for (const char of value.toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index < 0) {
      return null;
    }

    buffer = (buffer << 5) | index;
    bits += 5;

    while (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }

  return Buffer.from(bytes).toString('hex');
}

function sanitizeFolderName(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const cleaned = value
    .replace(/[\/\\:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned || cleaned === '.' || cleaned === '..') {
    return null;
  }

  return cleaned;
}

function buildExactSavePath(basePath, folderName) {
  if (!basePath || !folderName) {
    return null;
  }

  const normalizedBase = path.resolve(basePath);
  const targetPath = path.resolve(normalizedBase, folderName);
  const relative = path.relative(normalizedBase, targetPath);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }

  return targetPath;
}

module.exports = {
  isValidMagnetLink,
  parseMagnet,
  sanitizeFolderName,
  buildExactSavePath
};
