# *arr Stack Deployment Tool – Projektkontext

## Was ist das?
Ein React-basiertes Deployment-Tool für *arr-Apps (Sonarr, Radarr, Prowlarr etc.)
auf Proxmox VE als native LXC-Container (kein Docker).

## Aktueller Stand
- Tool läuft aktuell als Claude.ai Artifact (React)
- Ziel: Lokal in VSCode/Vite hosten damit WebSocket-Verbindungen funktionieren
- WebSocket-Bridge (`arr-ws-bridge.js`) läuft bereits auf Proxmox-Host

## Infrastruktur
- Proxmox-Host: `netcup.acidhosting.de` (152.53.108.232)
- SSH-User: `root`
- SSH-Port: `22`
- WS-Bridge Port: `2222` (wss://, Let's Encrypt Zertifikat vorhanden)
- WS-Bridge Pfad: `/opt/arr-bridge/arr-ws-bridge.js`
- WS-Bridge systemd-Dienst: `arr-bridge.service` (active/running)
- Let's Encrypt Zertifikat: `/etc/letsencrypt/live/netcup.acidhosting.de/`

## Proxmox Konfiguration
- Node: `pve`
- Bridge: `vmbr0`
- Storage: `local-lvm`
- OS-Template: `debian-12-standard_12.7-1_amd64.tar.zst`
- Default Gateway: `192.168.1.1`
- Nameserver: `1.1.1.1`
- Unprivileged Container: ja
- Start on Boot: ja

## Volume Pfade
- Config: `/opt/arr/config`
- Media: `/mnt/media`
- Downloads: `/mnt/downloads`
- PUID/PGID: `1000/1000`
- Timezone: `Europe/Berlin`

## Services (aktiv)
| Service      | VMID | Port  | RAM   | Cores | Disk |
|--------------|------|-------|-------|-------|------|
| Sonarr       | 200  | 8989  | 512MB | 1     | 4GB  |
| Radarr       | 201  | 7878  | 512MB | 1     | 4GB  |
| Prowlarr     | 202  | 9696  | 256MB | 1     | 2GB  |
| qBittorrent  | 206  | 8080  | 1GB   | 2     | 8GB  |

## Technologie-Stack
- Frontend: React + Vite
- Styling: Inline Styles (kein CSS-Framework)
- State: useState/useReducer
- Persistenz: window.storage (Claude) → auf localStorage umstellen lokal
- WebSocket: wss:// zu arr-ws-bridge.js auf Proxmox
- LXC: native Binaries + systemd (kein Docker)

## Aufgaben für Claude Code
1. `src/App.jsx` mit dem Code aus `App.jsx` befüllen
2. `window.storage` auf `localStorage` umstellen
3. WebSocket-URL auf `wss://netcup.acidhosting.de:2222` hardcoden oder per `.env`
4. `npm run dev` starten und testen
5. Optional: `npm run build` + Nginx-Deployment

## Projektstruktur
```
arr-tool/
├── src/
│   ├── App.jsx        ← Haupt-Komponente (siehe App.jsx Artifact)
│   └── main.jsx       ← Standard Vite React Entry
├── index.html         ← Standard Vite
├── vite.config.js     ← Standard Vite React
├── package.json
└── PROMPT.md          ← Diese Datei
```

## Setup-Befehle
```bash
npm create vite@latest arr-tool -- --template react
cd arr-tool
npm install
# App.jsx einfügen
npm run dev
```
