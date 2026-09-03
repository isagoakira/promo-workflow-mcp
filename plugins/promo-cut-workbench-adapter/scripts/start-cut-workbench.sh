#!/bin/sh
set -eu

workbench_root=${PROMO_CUT_WORKBENCH_ROOT:-}
source_dir=${PROMO_CUT_WORKBENCH_SOURCE_DIR:-}
python_bin=${PROMO_CUT_WORKBENCH_PYTHON:-python}
config_path=${PROMO_CUT_WORKBENCH_CONFIG:-}

if [ -z "$workbench_root" ] || [ -z "$source_dir" ]; then
  echo "Cut Workbench adapter: set PROMO_CUT_WORKBENCH_ROOT and PROMO_CUT_WORKBENCH_SOURCE_DIR." >&2
  exit 1
fi

if [ ! -d "$source_dir" ]; then
  echo "Cut Workbench adapter: source directory does not exist: $source_dir" >&2
  exit 1
fi

if [ -n "${PYTHONPATH:-}" ]; then
  export PYTHONPATH="src:${PYTHONPATH}"
else
  export PYTHONPATH="src"
fi

cd "$source_dir"
if [ -n "$config_path" ]; then
  exec "$python_bin" -m cut_workbench.cli --root "$workbench_root" --config "$config_path" mcp
fi
exec "$python_bin" -m cut_workbench.cli --root "$workbench_root" mcp
