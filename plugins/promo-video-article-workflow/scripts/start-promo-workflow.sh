#!/bin/sh
set -eu

repo_root=${PROMO_WORKFLOW_ROOT:-}
if [ -z "$repo_root" ]; then
  source_candidate=$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)
  if [ -f "$source_candidate/packages/promo-mcp/dist/index.js" ]; then
    repo_root=$source_candidate
  fi
fi

if [ -z "$repo_root" ] || [ ! -f "$repo_root/packages/promo-mcp/dist/index.js" ]; then
  echo "promo-workflow: set PROMO_WORKFLOW_ROOT to the promo-workflow repository root (with packages/promo-mcp/dist/index.js)" >&2
  exit 1
fi

node_bin=${PROMO_WORKFLOW_NODE:-}
if [ -z "$node_bin" ] && [ -x "/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node" ]; then
  node_bin="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node"
fi
if [ -z "$node_bin" ]; then
  node_bin=$(command -v node 2>/dev/null || true)
fi
if [ -z "$node_bin" ] || [ ! -x "$node_bin" ]; then
  echo "promo-workflow: set PROMO_WORKFLOW_NODE to a usable Node.js 20+ executable" >&2
  exit 1
fi

exec "$node_bin" "$repo_root/packages/promo-mcp/dist/index.js"
