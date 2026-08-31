#!/usr/bin/env bash
#
# Deploy this plugin into an Obsidian vault as a plain file copy (not a symlink).
#
# Usage:
#   scripts/deploy.sh                       # deploy to the default (Stonetable) vault
#   scripts/deploy.sh /path/to/Some/Vault   # deploy to another vault
#   scripts/deploy.sh --no-build            # skip the production build first
#
# The Testbed vault stays a symlink for the dev/hot-reload loop; this script is for
# pushing a stable, self-contained copy into a real vault. data.json (per-vault plugin
# settings written by Obsidian) is never touched.

set -euo pipefail

PLUGIN_ID="base-board-dev"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_VAULT="/Users/matthew/Documents/Vaults/Stonetable"

BUILD=1
VAULT=""
for arg in "$@"; do
  case "$arg" in
    --no-build) BUILD=0 ;;
    -h|--help)  sed -n '3,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)          VAULT="$arg" ;;
  esac
done
VAULT="${VAULT:-$DEFAULT_VAULT}"

DEST="$VAULT/.obsidian/plugins/$PLUGIN_ID"
FILES=(main.js manifest.json styles.css versions.json)

if [[ ! -d "$VAULT/.obsidian" ]]; then
  echo "error: '$VAULT' does not look like an Obsidian vault (no .obsidian/)" >&2
  exit 1
fi

if [[ "$BUILD" -eq 1 ]]; then
  echo "==> npm run build"
  ( cd "$REPO_DIR" && npm run build )
fi

for f in main.js manifest.json styles.css; do
  [[ -f "$REPO_DIR/$f" ]] || { echo "error: missing $f — build first or drop --no-build" >&2; exit 1; }
done

if [[ -L "$DEST" ]]; then
  echo "==> removing existing symlink: $DEST -> $(readlink "$DEST")"
  rm "$DEST"
fi

mkdir -p "$DEST"
for f in "${FILES[@]}"; do
  [[ -f "$REPO_DIR/$f" ]] || continue
  cp "$REPO_DIR/$f" "$DEST/$f"
  echo "    $f"
done

echo "==> deployed $PLUGIN_ID v$(node -p 'require("'"$REPO_DIR"'/manifest.json").version' 2>/dev/null || echo '?') to:"
echo "    $DEST"
echo "    (restart Obsidian or toggle the plugin to load the new build)"
