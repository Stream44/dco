#!/usr/bin/env bash
#
# DCO CLI Entry Point
# ====================
# Routes subcommands to the appropriate script.
#
#   dco commit [--signing-key <path>] [--yes] <git commit arguments>
#   dco validate [--verbose] [--enforce-signature-fingerprints]
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Default subcommand is 'commit'
SUBCOMMAND="${1:-commit}"

case "$SUBCOMMAND" in
    commit)
        shift 2>/dev/null || true
        exec "$SCRIPT_DIR/commit.sh" "$@"
        ;;
    validate)
        shift
        exec "$SCRIPT_DIR/validate.sh" "$@"
        ;;
    --help|-h)
        echo "Usage: dco <command> [options]"
        echo ""
        echo "Commands:"
        echo "  commit     Sign the DCO and commit (default)"
        echo "  validate   Validate DCO signatures on commits"
        echo ""
        echo "Commit options:"
        echo "  --signing-key <path>   SSH key for cryptographic signing"
        echo "  --yes-signoff          Auto-agree to DCO terms"
        echo "  <git arguments>        Passed through to git commit"
        echo ""
        echo "Validate options:"
        echo "  --verbose                        Show detailed output"
        echo "  --enforce-signature-fingerprints  Require SSH signature fingerprints"
        exit 0
        ;;
    *)
        echo "Unknown command: $SUBCOMMAND" >&2
        echo "Usage: dco <commit|validate> [options]" >&2
        exit 1
        ;;
esac
