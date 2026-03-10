# *arr Stack Deployment Tool

Deployment-Tool für Arr-Stack 
(Sonarr, Radarr, Prowlarr etc.)
als native LXC-Container.

## Tech-Stack
- Frontend: React + Vite
- WebSocket: wss:// auf Host
- LXC: native binaries & systemd
- Styling:

## Projektstruktur
```
proxmoxarr/
├── src/
│   ├── App.jsx        ← Artifact
│   └── main.jsx
├── ws/
│   └── arr-ws-bridge.js ← SSH over Websocket / docs nötig  
├── index.html         
├── vite.config.js     
├── package.json
├── package-lock.json
└── README.md          ←

## Infrastruktur

## Proxmox Konfiguration

## Volume Pfade


## Technologie-Stack



```

## Setup-Befehle
```bash
npm create vite@latest arr-tool -- --template react
cd arr-tool
npm install
# App.jsx einfügen
npm run dev
```
