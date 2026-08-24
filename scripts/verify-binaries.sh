#!/usr/bin/env bash
# verify-binaries.sh — assert the five bun-compiled CLI binaries are real,
# correctly targeted, and runnable, before anything ships them.
#
#   scripts/verify-binaries.sh [expected-version]
#
# Called by both pipelines, so CI and the release gate can never drift:
#   ci.yml       every PR/push — catches a stale --target or --icon path at
#                review time instead of at tag time
#   release.yml  with the tag's version — a binary that reports the wrong
#                version, or doesn't start, must never reach a Release
#
# The runner is linux-x64, so only canvas-linux can actually be executed; the
# rest are verified by architecture and size, which is precisely what breaks
# when a bun target flag goes stale (bun silently emits a host-arch binary for
# an unknown --target).
set -euo pipefail

EXPECTED_VERSION="${1:-}"
DIST="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/dist"

cd "$DIST" || { echo "no dist/ — run the build first"; exit 1; }

fail() { echo "FAIL: $*" >&2; exit 1; }

# Smallest observed standalone build is ~64MB (macos-arm); 10MB catches an
# empty/stub output without being brittle as bun's runtime size drifts.
MIN_BYTES=10000000

for f in canvas-linux canvas-linux-arm canvas-macos canvas-macos-arm canvas-windows.exe; do
    [ -f "$f" ] || fail "build produced no $f"
    size=$(stat -c %s "$f" 2>/dev/null || stat -f %z "$f")
    [ "$size" -gt "$MIN_BYTES" ] || fail "$f is only $size bytes — not a bun standalone build"
    printf '  %-20s %10s bytes  %s\n' "$f" "$size" "$(file -b "$f" | cut -c1-52)"
done

check_arch() {
    file -b "$1" | grep -qi -- "$2" || fail "$1 is not $3 (got: $(file -b "$1" | cut -c1-60))"
}
check_arch canvas-linux       'ELF 64-bit.*x86-64'  'an x86-64 ELF'
check_arch canvas-linux-arm   'ELF 64-bit.*aarch64' 'an aarch64 ELF'
check_arch canvas-macos       'Mach-O.*x86_64'      'an x86_64 Mach-O'
check_arch canvas-macos-arm   'Mach-O.*arm64'       'an arm64 Mach-O'
check_arch canvas-windows.exe 'PE32+\|MS Windows'   'a Windows PE binary'

chmod +x canvas-linux
v=$(./canvas-linux --version) || fail "canvas-linux --version exited non-zero"
echo "  canvas-linux --version -> $v"
./canvas-linux --help >/dev/null || fail "canvas-linux --help exited non-zero"

if [ -n "$EXPECTED_VERSION" ]; then
    case "$v" in
        *"$EXPECTED_VERSION"*) echo "  version matches $EXPECTED_VERSION" ;;
        *) fail "binary reports '$v' but the tag says $EXPECTED_VERSION" ;;
    esac
fi

echo "All five binaries verified."
