#!/usr/bin/env bash
# with-live-env.sh — run one command with the live Portaldot settings and exactly one burner key.
#
#   scripts/with-live-env.sh <owner|provider-1> -- <command> [args...]
#
# The key is read from the Tier 0 .env (OWNER_KEY or PROVIDER_1_KEY), exported as
# MAKHZAN_PRIVATE_KEY in the child environment, and never printed, written, logged or placed in argv.
# No other variable from the file is exported. The wrapper writes nothing to disk.
#
# WITH_LIVE_ENV_FILE overrides the env file path for tests only; the default is the Tier 0 file.
set -euo pipefail

usage() {
  echo "usage: scripts/with-live-env.sh <owner|provider-1> -- <command> [args...]" >&2
}

if [ "$#" -lt 3 ] || [ "$2" != "--" ]; then
  usage
  exit 2
fi

role=$1
shift 2

case "$role" in
  owner) key_name=OWNER_KEY ;;
  provider-1) key_name=PROVIDER_1_KEY ;;
  *)
    echo "with-live-env: unknown role '$role' (expected owner or provider-1)" >&2
    exit 2
    ;;
esac

env_file=${WITH_LIVE_ENV_FILE:-/home/mohammed_soliman/hackathons/portaldot-hackathon/.env}
if [ ! -r "$env_file" ]; then
  echo "with-live-env: cannot read $env_file" >&2
  exit 2
fi

key=""
while IFS= read -r line || [ -n "$line" ]; do
  line=${line%$'\r'}
  case "$line" in
    ''|'#'*) continue ;;
  esac
  name=${line%%=*}
  [ "$name" = "$key_name" ] || continue
  key=${line#*=}
  # Accept a quoted value, but never eval the file.
  case "$key" in
    \"*\") key=${key#\"}; key=${key%\"} ;;
    \'*\') key=${key#\'}; key=${key%\'} ;;
  esac
done < "$env_file"

if [ -z "$key" ]; then
  echo "with-live-env: $key_name is not set in $env_file" >&2
  exit 2
fi

if [[ ! $key =~ ^0x[0-9a-fA-F]{64}$ ]]; then
  echo "with-live-env: $key_name is not a 32-byte hex key" >&2
  unset key
  exit 2
fi

export MAKHZAN_NETWORK=live
export MAKHZAN_RPC_URL=https://test-evm-rpc-v3.portaldot.dev
export MAKHZAN_CHAIN_ID=420420777
export MAKHZAN_PRIVATE_KEY="$key"
unset key

exec "$@"
