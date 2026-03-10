# *arr Stack Deployment Tool – Projektkontext

## Was ist das?
Ein React-basiertes Deployment-Tool für *arr-Apps (Sonarr, Radarr, Prowlarr etc.)
auf Proxmox VE als native LXC-Container.

## Aktueller Stand

## Infrastruktur

## Proxmox Konfiguration

## Volume Pfade


## Technologie-Stack
- Frontend: React + Vite
- Styling: Inline Styles
- State: useState/useReducer
- WebSocket: wss:// auf Proxmox
- LXC: native Binaries + systemd

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
