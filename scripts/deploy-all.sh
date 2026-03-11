#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${1:-${SCRIPT_DIR}/../config/services.json}"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "ERROR: Config file not found: $CONFIG_FILE" >&2
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo "ERROR: jq is required but not installed" >&2
  exit 1
fi

echo "# ── Deploying all enabled services ──"

ENABLED_SERVICES=$(jq -r '.services[] | select(.enabled == true) | .id' "$CONFIG_FILE")

if [[ -z "$ENABLED_SERVICES" ]]; then
  echo "No enabled services found in config."
  exit 0
fi

FAILED=0
for SERVICE_ID in $ENABLED_SERVICES; do
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Deploying: ${SERVICE_ID}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  if ! "${SCRIPT_DIR}/deploy-service.sh" "$SERVICE_ID" "$CONFIG_FILE"; then
    echo "❌ Failed to deploy ${SERVICE_ID}" >&2
    FAILED=$((FAILED + 1))
  fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ $FAILED -gt 0 ]]; then
  echo "⚠️  Deployment complete with ${FAILED} failure(s)"
  exit 1
else
  echo "✅ All services deployed successfully"
fi
