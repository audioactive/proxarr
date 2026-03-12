#!/usr/bin/env bash
set -euo pipefail

SERVICE_ID="${1:?Usage: deploy-service.sh <service-id>}"
CONFIG_FILE="${2:-config/services.json}"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "ERROR: Config file not found: $CONFIG_FILE" >&2
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo "ERROR: jq is required but not installed" >&2
  exit 1
fi

# ── Read PVE config ──────────────────────────────────────────────────────────
PVE_NODE=$(jq -r '.pve.node' "$CONFIG_FILE")
PVE_BRIDGE=$(jq -r '.pve.bridge' "$CONFIG_FILE")
PVE_STORAGE=$(jq -r '.pve.storage' "$CONFIG_FILE")
PVE_TEMPLATE=$(jq -r '.pve.osTemplate' "$CONFIG_FILE")
PVE_DEFAULT_GW=$(jq -r '.pve.defaultGw' "$CONFIG_FILE")
PVE_SUBNET_CIDR=$(jq -r '.pve.subnetCidr' "$CONFIG_FILE")
PVE_NAMESERVER=$(jq -r '.pve.nameserver' "$CONFIG_FILE")
PVE_UNPRIVILEGED=$(jq -r '.pve.unprivileged' "$CONFIG_FILE")
PVE_START_ON_BOOT=$(jq -r '.pve.startOnBoot' "$CONFIG_FILE")
PVE_OS_TYPE=$(jq -r '.pve.osType' "$CONFIG_FILE")

# ── Read volumes config ──────────────────────────────────────────────────────
BASE_CONFIG_PATH=$(jq -r '.volumes.baseConfigPath' "$CONFIG_FILE")
BASE_MEDIA_PATH=$(jq -r '.volumes.baseMediaPath' "$CONFIG_FILE")
BASE_DOWNLOAD_PATH=$(jq -r '.volumes.baseDownloadPath' "$CONFIG_FILE")
TZ=$(jq -r '.volumes.tz' "$CONFIG_FILE")

# ── Read service config ──────────────────────────────────────────────────────
SVC_JSON=$(jq -e --arg id "$SERVICE_ID" '.services[] | select(.id == $id)' "$CONFIG_FILE")
if [[ -z "$SVC_JSON" ]]; then
  echo "ERROR: Service '$SERVICE_ID' not found in config" >&2
  exit 1
fi

SVC_NAME=$(echo "$SVC_JSON" | jq -r '.name')
SVC_ENABLED=$(echo "$SVC_JSON" | jq -r '.enabled')
SVC_PORT=$(echo "$SVC_JSON" | jq -r '.port')
SVC_VMID=$(echo "$SVC_JSON" | jq -r '.vmid')
SVC_CORES=$(echo "$SVC_JSON" | jq -r '.cores')
SVC_MEM=$(echo "$SVC_JSON" | jq -r '.mem')
SVC_DISK=$(echo "$SVC_JSON" | jq -r '.disk')
SVC_IP=$(echo "$SVC_JSON" | jq -r '.ip // empty')
SVC_GW=$(echo "$SVC_JSON" | jq -r '.gw // empty')
SVC_MEDIA_PATH=$(echo "$SVC_JSON" | jq -r '.mediaPath // empty')
SVC_DOWNLOAD_PATH=$(echo "$SVC_JSON" | jq -r '.downloadPath // empty')
SVC_START_ON_BOOT=$(echo "$SVC_JSON" | jq -r '.startOnBoot // true')

if [[ "$SVC_ENABLED" != "true" ]]; then
  echo "SKIP: Service '$SERVICE_ID' is disabled in config"
  exit 0
fi

# ── Determine if service has media/download paths ────────────────────────────
HAS_MEDIA=false
if [[ -n "$SVC_MEDIA_PATH" ]]; then
  HAS_MEDIA=true
fi

HAS_DOWNLOAD=false
if [[ "$SERVICE_ID" == "qbittorrent" || "$SERVICE_ID" == "sabnzbd" ]]; then
  HAS_DOWNLOAD=true
fi

# ── Install commands (matches INSTALL_CMDS from App.jsx) ─────────────────────
get_install_cmd() {
  case "$1" in
    sonarr)
      echo 'curl -o /tmp/sonarr.tar.gz -L "https://services.sonarr.tv/v1/download/main/latest?version=4&os=linux&arch=x64" && mkdir -p /opt/sonarr && tar -xzf /tmp/sonarr.tar.gz -C /opt/sonarr --strip-components=1'
      ;;
    radarr)
      echo 'curl -o /tmp/radarr.tar.gz -L "https://radarr.servarr.com/v1/update/master/updatefile?os=linux&runtime=netcore&arch=x64" && mkdir -p /opt/radarr && tar -xzf /tmp/radarr.tar.gz -C /opt/radarr --strip-components=1'
      ;;
    prowlarr)
      echo 'curl -o /tmp/prowlarr.tar.gz -L "https://prowlarr.servarr.com/v1/update/master/updatefile?os=linux&runtime=netcore&arch=x64" && mkdir -p /opt/prowlarr && tar -xzf /tmp/prowlarr.tar.gz -C /opt/prowlarr --strip-components=1'
      ;;
    lidarr)
      echo 'curl -o /tmp/lidarr.tar.gz -L "https://github.com/Lidarr/Lidarr/releases/latest/download/Lidarr.master.linux-core-x64.tar.gz" && mkdir -p /opt/lidarr && tar -xzf /tmp/lidarr.tar.gz -C /opt/lidarr --strip-components=1'
      ;;
    readarr)
      echo 'curl -o /tmp/readarr.tar.gz -L "https://readarr.servarr.com/v1/update/develop/updatefile?os=linux&runtime=netcore&arch=x64" && mkdir -p /opt/readarr && tar -xzf /tmp/readarr.tar.gz -C /opt/readarr --strip-components=1'
      ;;
    bazarr)
      echo 'apt-get install -y python3 python3-pip python3-venv unzip && curl -o /tmp/bazarr.zip -L "https://github.com/morpheus65535/bazarr/releases/latest/download/bazarr.zip" && mkdir -p /opt/bazarr && unzip -q /tmp/bazarr.zip -d /opt/bazarr'
      ;;
    qbittorrent)
      echo 'apt-get install -y qbittorrent-nox'
      ;;
    overseerr)
      echo 'apt-get install -y nodejs npm && npm install -g overseerr'
      ;;
    jellyfin)
      echo 'curl -fsSL https://repo.jellyfin.org/install-debuntu.sh | bash'
      ;;
    plex)
      echo 'curl -o /tmp/plexmediaserver.deb -L "https://downloads.plex.tv/plex-media-server-new/1.40.1.8227-c0dd5a73e/debian/plexmediaserver_1.40.1.8227-c0dd5a73e_amd64.deb" && dpkg -i /tmp/plexmediaserver.deb'
      ;;
    tautulli)
      echo 'apt-get install -y python3 python3-pip && curl -o /tmp/tautulli.tar.gz -L "https://github.com/Tautulli/Tautulli/archive/refs/heads/master.tar.gz" && mkdir -p /opt/tautulli && tar -xzf /tmp/tautulli.tar.gz -C /opt/tautulli --strip-components=1'
      ;;
    flaresolverr)
      echo 'apt-get install -y python3 chromium chromium-driver && curl -o /tmp/flaresolverr.tar.gz -L "https://github.com/FlareSolverr/FlareSolverr/releases/latest/download/flaresolverr_linux_x64.tar.gz" && mkdir -p /opt/flaresolverr && tar -xzf /tmp/flaresolverr.tar.gz -C /opt/flaresolverr --strip-components=1'
      ;;
    sabnzbd)
      echo 'apt-get install -y sabnzbd'
      ;;
    mylar3)
      echo 'apt-get install -y python3 python3-pip && curl -o /tmp/mylar3.tar.gz -L "https://github.com/mylar3/mylar3/archive/refs/heads/master.tar.gz" && mkdir -p /opt/mylar3 && tar -xzf /tmp/mylar3.tar.gz -C /opt/mylar3 --strip-components=1'
      ;;
    *)
      echo "echo 'No installer for $1'"
      ;;
  esac
}

# ── Binary paths (matches BINARY_PATHS from App.jsx) ─────────────────────────
get_exec_start() {
  case "$1" in
    sonarr)       echo "/opt/sonarr/Sonarr -nobrowser -data=/config" ;;
    radarr)       echo "/opt/radarr/Radarr -nobrowser -data=/config" ;;
    prowlarr)     echo "/opt/prowlarr/Prowlarr -nobrowser -data=/config" ;;
    lidarr)       echo "/opt/lidarr/Lidarr -nobrowser -data=/config" ;;
    readarr)      echo "/opt/readarr/Readarr -nobrowser -data=/config" ;;
    bazarr)       echo "python3 /opt/bazarr/bazarr.py" ;;
    qbittorrent)  echo "qbittorrent-nox --webui-port=${SVC_PORT}" ;;
    overseerr)    echo "overseerr start" ;;
    jellyfin)     echo "jellyfin" ;;
    plex)         echo "plexmediaserver" ;;
    tautulli)     echo "python3 /opt/tautulli/Tautulli.py" ;;
    flaresolverr) echo "/opt/flaresolverr/flaresolverr" ;;
    sabnzbd)      echo "sabnzbd" ;;
    mylar3)       echo "python3 /opt/mylar3/Mylar.py" ;;
    *)            echo "/opt/$1/$1" ;;
  esac
}

INSTALL_CMD=$(get_install_cmd "$SERVICE_ID")
EXEC_START=$(get_exec_start "$SERVICE_ID")

# ── IP configuration ─────────────────────────────────────────────────────────
if [[ -n "$SVC_IP" ]]; then
  GW="${SVC_GW:-$PVE_DEFAULT_GW}"
  IP_CONFIG="${SVC_IP}/${PVE_SUBNET_CIDR},gw=${GW}"
else
  IP_CONFIG="dhcp"
fi

# ── onboot value ──────────────────────────────────────────────────────────────
ONBOOT=1
if [[ "$SVC_START_ON_BOOT" == "false" ]]; then
  ONBOOT=0
fi

# ── Build directory list ──────────────────────────────────────────────────────
DIRS="/config"
if [[ "$HAS_MEDIA" == "true" ]]; then
  DIRS="$DIRS /data"
fi
if [[ "$HAS_DOWNLOAD" == "true" ]]; then
  DIRS="$DIRS /downloads"
fi

echo "# ── Deploying LXC for ${SVC_NAME} (VMID ${SVC_VMID}) ──"

# Step 0: If container already exists, stop and destroy it (redeploy)
if pct status "${SVC_VMID}" &>/dev/null; then
  echo "⚠️  CT ${SVC_VMID} already exists — destroying for redeploy..."
  pct stop "${SVC_VMID}" 2>/dev/null || true
  sleep 2
  pct destroy "${SVC_VMID}" --purge 2>/dev/null || true
  sleep 2
  echo "   CT ${SVC_VMID} destroyed."
fi

# Step 1: Create config directory on host
mkdir -p "${BASE_CONFIG_PATH}/${SERVICE_ID}"
chown 100000:100000 "${BASE_CONFIG_PATH}/${SERVICE_ID}"

# Step 2: pct create
PCT_CMD="pct create ${SVC_VMID} ${PVE_TEMPLATE}"
PCT_CMD+=" --hostname ${SERVICE_ID}"
PCT_CMD+=" --cores ${SVC_CORES}"
PCT_CMD+=" --memory ${SVC_MEM}"
PCT_CMD+=" --swap 128"
PCT_CMD+=" --storage ${PVE_STORAGE}"
PCT_CMD+=" --rootfs ${PVE_STORAGE}:${SVC_DISK}"
PCT_CMD+=" --net0 name=eth0,bridge=${PVE_BRIDGE},ip=${IP_CONFIG}"
PCT_CMD+=" --nameserver ${PVE_NAMESERVER}"
PCT_CMD+=" --features nesting=1"
PCT_CMD+=" --unprivileged"
PCT_CMD+=" --start 0"
PCT_CMD+=" --onboot ${ONBOOT}"
PCT_CMD+=" --ostype ${PVE_OS_TYPE}"
PCT_CMD+=" --mp0 ${BASE_CONFIG_PATH}/${SERVICE_ID},mp=/config"

if [[ "$HAS_MEDIA" == "true" ]]; then
  PCT_CMD+=" --mp1 ${BASE_MEDIA_PATH},mp=/data"
fi

if [[ "$HAS_DOWNLOAD" == "true" ]]; then
  PCT_CMD+=" --mp2 ${BASE_DOWNLOAD_PATH},mp=/downloads"
fi

echo "Running: $PCT_CMD"
eval "$PCT_CMD"

# Step 3: Start container
pct start "${SVC_VMID}"

# Step 4: Wait for container to boot
sleep 6

# Step 5: Install base dependencies
pct exec "${SVC_VMID}" -- bash -c 'set -e; apt-get update -qq && apt-get install -y -qq curl ca-certificates libicu-dev'

# Step 6: Create service user
pct exec "${SVC_VMID}" -- bash -c "useradd -r -s /bin/false ${SERVICE_ID} 2>/dev/null || true"

# Step 7: Create directories inside container
pct exec "${SVC_VMID}" -- bash -c "mkdir -p ${DIRS}"

# Step 8: Set ownership of config directory
pct exec "${SVC_VMID}" -- bash -c "chown -R ${SERVICE_ID}:${SERVICE_ID} /config"

# Step 9: Run install command
pct exec "${SVC_VMID}" -- bash -c "${INSTALL_CMD}"

# Step 10: Set ownership of installed files
pct exec "${SVC_VMID}" -- bash -c "chown -R ${SERVICE_ID}:${SERVICE_ID} /opt/${SERVICE_ID} 2>/dev/null || true"

# Step 11: Create systemd unit file
pct exec "${SVC_VMID}" -- bash -c "cat > /etc/systemd/system/${SERVICE_ID}.service << 'UNIT'
[Unit]
Description=${SVC_NAME}
After=network.target

[Service]
Type=simple
User=${SERVICE_ID}
Group=${SERVICE_ID}
Environment=TZ=${TZ}
ExecStart=${EXEC_START}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT"

# Step 12: Enable and start the service
pct exec "${SVC_VMID}" -- bash -c "systemctl daemon-reload && systemctl enable --now ${SERVICE_ID}"

echo "✅ ${SVC_NAME} deployed auf VMID ${SVC_VMID}, Port ${SVC_PORT}"
