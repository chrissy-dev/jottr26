# Self-hosting Jottr

Jottr normally syncs through Supabase. It can also run entirely on your own
machine or server: one container holds the app and a small sync server, and
your notes are kept in a single SQLite file. Nothing talks to Supabase,
Vercel, or anyone else.

Each device still keeps its own copy of your notes and works offline. The
server is where they meet.

## On your own computer

```bash
docker build -t jottr .
docker run -d --name jottr -p 8080:8080 -v jottr-data:/data -e JOTTR_AUTH=none jottr
```

Open http://localhost:8080. `JOTTR_AUTH=none` means anyone who can reach the
port is you, which is fine on localhost. To be asked for a password instead,
use `-e JOTTR_PASSWORD=…` in place of `-e JOTTR_AUTH=none`.

## On a server with a domain

Point the domain's DNS at the server, open ports 80 and 443, then:

```bash
cp self-host/.env.example self-host/.env   # set JOTTR_DOMAIN and JOTTR_PASSWORD
docker compose -f self-host/compose.yaml up -d
```

Caddy gets a certificate from Let's Encrypt and serves Jottr over HTTPS. HTTPS
is needed for more than privacy: without it, browsers won't install Jottr as
an app or let it work offline.

## On your own network, with Tailscale

Run it as on your own computer, then `tailscale serve --bg 8080` gives it an
HTTPS address on your tailnet that only your devices can reach. Since
Tailscale already decides who gets in, `JOTTR_AUTH=none` is reasonable here.

## Settings

| Variable | Default | |
|---|---|---|
| `JOTTR_AUTH` | `password` | `password`, or `none` to let everyone who can reach it in |
| `JOTTR_PASSWORD` | | Required when `JOTTR_AUTH` is `password` |
| `PORT` | `8080` | |
| `SITE_URL` (build arg) | `http://localhost:8080` | The public address, for robots.txt, the sitemap and link previews |

Changing the password does not sign out devices already signed in.

## Backups

Everything is in `/data/jottr.db`. To take a consistent copy while it runs:

```bash
docker compose -f self-host/compose.yaml exec jottr node --disable-warning=ExperimentalWarning \
  -e "new (require('node:sqlite').DatabaseSync)('/data/jottr.db').exec(\"vacuum into '/data/backup.db'\")"
docker compose -f self-host/compose.yaml cp jottr:/data/backup.db ./jottr-backup.db
docker compose -f self-host/compose.yaml exec jottr rm /data/backup.db
```

(With plain `docker run`, use `docker exec jottr …` and `docker cp`.)

## Updating

```bash
git pull
docker compose -f self-host/compose.yaml up -d --build
```

## Worth knowing

- There is one account. Every device signs in to the same notes.
- Signing out erases the copy on that device, as it does with Supabase.
- To run the server without Docker: build the app with
  `NEXT_PUBLIC_JOTTR_BACKEND=self-hosted JOTTR_STATIC_EXPORT=1 npm run build`,
  then `npm install` and `npm start` in `server/` (Node 23.6 or later).
