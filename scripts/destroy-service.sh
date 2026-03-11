#!/usr/bin/env bash
set -euo pipefail

SERVICE_ID="${1:?Usage: destroy-service.sh <service-id>}"
CONFIG_FILE="${2:-config/services.json}"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "ERROR: Config file not found: $CONFIG_FILE" >&2
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo "ERROR: jq is required but not installed" >&2
  exit 1
fi

SVC_JSON=$(jq -e --arg id "$SERVICE_ID" '.services[] | select(.id == $id)' "$CONFIG_FILE")
if [[ -z "$SVC_JSON" ]]; then
  echo "ERROR: Service '$SERVICE_ID' not found in config" >&2
  exit 1
fi

SVC_VMID=$(echo "$SVC_JSON" | jq -r '.vmid')
SVC_NAME=$(echo "$SVC_JSON" | jq -r '.name')

echo "# ── Destroying ${SVC_NAME} (VMID ${SVC_VMID}) ──"

pct stop "$SVC_VMID" 2>/dev/null || true
pct destroy "$SVC_VMID" --purge

echo "🗑 ${SVC_NAME} (VMID ${SVC_VMID}) destroyed"
