# *arr Stack Deployment Tool

Deployment-Tool for the *arr stack (Sonarr, Radarr, Prowlarr, etc.) as native LXC containers on Proxmox.

## Architecture: Konfigurator + Executor

This project uses a two-stage pipeline:

1. **Konfigurator** (Vite UI) — Configure services, resource allocation, networking, and volumes via a web interface. Export the configuration as `services.json`.
2. **Executor** (GitHub Actions + Bash) — Reads `config/services.json` and deploys LXC containers to a Proxmox host via SSH.

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Vite UI        │────▶│  services.json   │────▶│  Proxmox Host   │
│  (Konfigurator)  │     │  (git repo)      │     │  (LXC deploy)   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
   Export Config           Push triggers           Scripts execute
                           GitHub Actions           via SSH
```

### Supported Services (14)

| Service | VMID | Port | Description |
|---------|------|------|-------------|
| Sonarr | 200 | 8989 | TV series management |
| Radarr | 201 | 7878 | Movie management |
| Prowlarr | 202 | 9696 | Indexer manager |
| Lidarr | 203 | 8686 | Music management |
| Readarr | 204 | 8787 | Book management |
| Bazarr | 205 | 6767 | Subtitle management |
| qBittorrent | 206 | 8080 | Torrent client |
| Overseerr | 207 | 5055 | Media requests |
| Jellyfin | 208 | 8096 | Media server |
| Plex | 209 | 32400 | Media server |
| Tautulli | 210 | 8181 | Plex monitoring |
| FlareSolverr | 211 | 8191 | Cloudflare bypass |
| SABnzbd | 212 | 8085 | Usenet client |
| Mylar3 | 213 | 8090 | Comic management |

## Tech Stack

- **Frontend**: React + Vite
- **WebSocket**: wss:// bridge for live SSH console
- **LXC**: Native binaries & systemd services
- **CI/CD**: GitHub Actions with SSH deployment

## Project Structure

```
proxmoxarr/
├── src/
│   ├── App.jsx              ← React UI (Konfigurator)
│   └── main.jsx
├── config/
│   └── services.json        ← Default service configuration
├── scripts/
│   ├── deploy-service.sh    ← Deploy a single LXC container
│   ├── deploy-all.sh        ← Deploy all enabled services
│   └── destroy-service.sh   ← Destroy a single LXC container
├── .github/
│   └── workflows/
│       └── deploy.yml       ← GitHub Actions workflow
├── arr-ws-bridge.js         ← SSH-over-WebSocket bridge
├── index.html
├── vite.config.js
├── package.json
└── README.md
```

## Setup

### 1. Local Development (Vite UI)

```bash
npm install
npm run dev
```

The UI lets you:
- Enable/disable services
- Configure VMID, ports, resources (cores, memory, disk)
- Set IP addresses and gateways
- Configure Proxmox settings (storage, bridge, template)
- Deploy directly via the WS-Bridge console
- **Export Config** — download `services.json` for the CI/CD pipeline

### 2. GitHub Secrets Setup

To use the GitHub Actions deployment pipeline, configure these repository secrets:

| Secret | Description | Example |
|--------|-------------|---------|
| `PVE_HOST` | Proxmox host IP or hostname | `192.168.1.100` |
| `SSH_PRIVATE_KEY` | SSH private key for root access | Contents of `~/.ssh/id_rsa` |

Go to **Settings > Secrets and variables > Actions > New repository secret** in your GitHub repo.

### 3. GitHub Actions Workflow

The workflow runs in two modes:

#### Manual Dispatch

Go to **Actions > Deploy *arr Service > Run workflow** and select:
- **Service**: Choose a specific service or "all" for all enabled services
- **Action**: `deploy` to create the LXC container, `destroy` to remove it

#### Automatic on Config Push

When `config/services.json` is updated on the `master` branch, the workflow automatically deploys all enabled services.

**Typical workflow:**
1. Configure services in the Vite UI
2. Click **📤 Export Config** to download `services.json`
3. Commit the exported file to `config/services.json` on master
4. GitHub Actions automatically deploys to your Proxmox host

### 4. Export Config (Vite UI)

The **📤 Export Config** button in the header exports the current configuration:
- All service settings (enabled state, ports, resources, IPs)
- Proxmox settings (node, bridge, storage, template)
- Volume paths (config, media, downloads)

The exported JSON matches the `config/services.json` schema expected by the deployment scripts.

## Scripts

All scripts run on the **Proxmox host** (not in the GitHub runner). They require `jq` to be installed.

### deploy-service.sh

```bash
./scripts/deploy-service.sh <service-id> [config-file]
# Example: ./scripts/deploy-service.sh sonarr config/services.json
```

Creates an LXC container with the full deployment sequence:
1. Create config directory on host
2. `pct create` with all options (hostname, resources, networking, mountpoints)
3. Start container and install base dependencies
4. Create service user and directories
5. Run service-specific install commands
6. Create and enable systemd unit file

### deploy-all.sh

```bash
./scripts/deploy-all.sh [config-file]
```

Deploys all services where `enabled: true` in the config.

### destroy-service.sh

```bash
./scripts/destroy-service.sh <service-id> [config-file]
# Example: ./scripts/destroy-service.sh sonarr config/services.json
```

Stops and destroys the LXC container with `pct stop` + `pct destroy --purge`.
