#!/bin/bash
# Sync local haulvisor-core into node_modules for development.
# Run after editing haulvisor-core: cd ../haulvisor-core && npm run build && cd ../haulvisor && ./scripts/sync-core.sh
set -e
CORE_DIR="$(dirname "$0")/../../haulvisor-core"
TARGET="$(dirname "$0")/../node_modules/@mwbhtx/haulvisor-core"

if [ ! -d "$CORE_DIR/dist" ]; then
  echo "Error: $CORE_DIR/dist not found. Run 'npm run build' in haulvisor-core first."
  exit 1
fi

rm -rf "$TARGET"
cp -R "$CORE_DIR" "$TARGET"
echo "✓ Synced haulvisor-core into node_modules"
