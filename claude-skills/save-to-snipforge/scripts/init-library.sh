#!/usr/bin/env bash
# Initialize a SnipForge library folder with a .snipforge.json manifest.
# Usage: init-library.sh <path> <name> [description]

set -euo pipefail

path="${1:?Usage: init-library.sh <path> <name> [description]}"
name="${2:?Usage: init-library.sh <path> <name> [description]}"
description="${3:-}"

manifest="$path/.snipforge.json"

if [ -f "$manifest" ]; then
    echo "ERROR: .snipforge.json already exists at $path" >&2
    exit 1
fi

mkdir -p "$path"

cat > "$manifest" << EOF
{
  "snipforge": "library",
  "name": "$name",
  "description": "$description",
  "format_version": "1.0"
}
EOF

echo "Created SnipForge library '$name' at $path"
