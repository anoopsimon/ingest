# Ingest

Phone-first magnet intake for qBittorrent. Paste a magnet, pick a language, enter a folder name, and the app queues the torrent into a fixed library path. When the download finishes, Ingest stops seeding, removes the torrent entry, and keeps the downloaded files.
Use the Settings screen to add or edit language-to-path mappings in SQLite, so you can add paths like Telugu without changing `docker-compose.yml`.

## Spin Up

1. Create the host folders:

```bash
mkdir -p /mnt/media/malayalam /mnt/media/english /mnt/media/tamil /mnt/media/hindi
mkdir -p app/data qbittorrent/config
```

2. Copy the sample env file:

```bash
cp .env.example .env
```

3. Start the stack:

```bash
docker compose up -d --build
```

Open:

- App: `http://localhost:3000`
- qBittorrent: `http://localhost:8080`
- Settings: `http://localhost:3000/settings`

## Always On

`docker-compose.yml` uses `restart: always` for both services. If Docker itself starts on boot, the containers come back after a machine restart.

## Logs

```bash
docker compose logs -f app
docker compose logs -f qbittorrent
```

## Update

```bash
docker compose pull
docker compose up -d --build
```

## Stop

```bash
docker compose down
```

## Data

- SQLite: `app/data/app.db`
- qBittorrent config: `qbittorrent/config`
- Media folders: `/mnt/media/malayalam`, `/mnt/media/english`, `/mnt/media/tamil`, `/mnt/media/hindi`

## Permissions

If downloads fail, fix ownership on the host:

```bash
sudo chown -R 1000:1000 /mnt/media app/data qbittorrent/config
```

If your host uses different IDs, set `PUID` and `PGID` in `.env` to match.

## Plex

Point Plex at the same `/mnt/media/...` folders so it sees the files directly.
