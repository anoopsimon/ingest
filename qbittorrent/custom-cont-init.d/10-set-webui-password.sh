#!/usr/bin/with-contenv sh
set -eu

CONFIG_FILE="/config/qBittorrent/qBittorrent.conf"
WEBUI_USERNAME="${WEBUI_USERNAME:-${QB_USERNAME:-admin}}"
WEBUI_PASSWORD_HASH='@ByteArray(ARQ77eY1NUZaQsuDHbIMCA==:0WMRkYTUWVT9wVvdDtHAjU9b3b7uB8NR1Gur2hmQCvCDpm39Q+PsJRJPaCU51dEiz+dTzh8qbPsL8WkFljQYFQ==)'

mkdir -p "$(dirname "$CONFIG_FILE")"
touch "$CONFIG_FILE"

if grep -q '^WebUI\\Password_PBKDF2=' "$CONFIG_FILE"; then
  sed -i "s|^WebUI\\\\Password_PBKDF2=.*|WebUI\\\\Password_PBKDF2=${WEBUI_PASSWORD_HASH}|" "$CONFIG_FILE"
else
  printf '\nWebUI\\Password_PBKDF2=%s\n' "$WEBUI_PASSWORD_HASH" >> "$CONFIG_FILE"
fi

if grep -q '^WebUI\\Username=' "$CONFIG_FILE"; then
  sed -i "s|^WebUI\\\\Username=.*|WebUI\\\\Username=${WEBUI_USERNAME}|" "$CONFIG_FILE"
else
  printf 'WebUI\\Username=%s\n' "$WEBUI_USERNAME" >> "$CONFIG_FILE"
fi

