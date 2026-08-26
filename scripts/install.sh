#!/usr/bin/env bash
# Canvas CLI installer (Linux / macOS)
#
#   curl -fsSL https://raw.githubusercontent.com/canvas-ui/canvas/main/apps/cli/scripts/install.sh | bash
#
# Downloads the single-file binary from the latest `cli-v*` GitHub Release,
# verifies it against SHA256SUMS, installs it as `canvas` plus the shortcut
# wrappers, and (optionally) wires the prompt integration into your shell rc.
#
# Windows: use scripts/install.ps1.

set -euo pipefail

REPO="canvas-ui/canvas"
INSTALL_DIR="${CANVAS_INSTALL_DIR:-$HOME/.local/bin}"
CANVAS_HOME="${CANVAS_USER_HOME:-$HOME/.canvas}"
BINARY_NAME="canvas"
RAW_BASE="https://raw.githubusercontent.com/${REPO}/main/apps/cli"

# Shortcut wrapper -> canvas module
SHORTCUTS=("ws:workspace" "ctx:context" "context:context" "dot:dot" "agent:agent" "ag:agent" "hi:agent")

RED=''; GREEN=''; YELLOW=''; BLUE=''; NC=''
if [ -t 1 ]; then
    RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; BLUE=$'\033[0;34m'; NC=$'\033[0m'
fi
log()     { echo "${BLUE}[info]${NC} $1"; }
success() { echo "${GREEN}[ ok ]${NC} $1"; }
warning() { echo "${YELLOW}[warn]${NC} $1" >&2; }
error()   { echo "${RED}[fail]${NC} $1" >&2; exit 1; }

VERSION=""           # cli-v<x.y.z>, resolved from the API when empty
PROMPT_MODE="ask"    # ask | yes | no
WITH_SHORTCUTS=true
LOCAL_INSTALL=false
LOCAL_DIR=""
TMP_DIR=""            # cleaned up by the EXIT trap

cleanup() { [ -n "$TMP_DIR" ] && rm -rf "$TMP_DIR"; return 0; }
trap cleanup EXIT

show_help() {
    cat <<EOF
Canvas CLI installer

USAGE
    install.sh [OPTIONS]
    curl -fsSL ${RAW_BASE}/scripts/install.sh | bash
    curl -fsSL ${RAW_BASE}/scripts/install.sh | bash -s -- --prompt

OPTIONS
    -h, --help          Show this help
    --version <ver>     Install a specific release (2.1.11 or cli-v2.1.11)
    --dir <path>        Install directory (default: \$HOME/.local/bin)
    --prompt            Install the prompt integration and wire it into ~/.bashrc / ~/.zshrc
    --no-prompt         Skip the prompt integration entirely
    --no-shortcuts      Install only \`canvas\`, no ws/ctx/context/dot/agent/hi wrappers
    --local [dir]       Dev install: wrappers around a source checkout instead of a binary
                        (dir defaults to the CLI package root containing this script)

ENVIRONMENT
    CANVAS_INSTALL_DIR  Same as --dir
    CANVAS_USER_HOME    Canvas home (default: \$HOME/.canvas)
EOF
}

while [ $# -gt 0 ]; do
    case "$1" in
        -h|--help) show_help; exit 0 ;;
        --version) VERSION="${2:-}"; [ -n "$VERSION" ] || error "--version needs a value"; shift 2 ;;
        --dir)     INSTALL_DIR="${2:-}"; [ -n "$INSTALL_DIR" ] || error "--dir needs a value"; shift 2 ;;
        --prompt)  PROMPT_MODE="yes"; shift ;;
        --no-prompt) PROMPT_MODE="no"; shift ;;
        --no-shortcuts) WITH_SHORTCUTS=false; shift ;;
        --local)
            LOCAL_INSTALL=true
            if [ -n "${2:-}" ] && [ "${2#--}" = "${2}" ]; then LOCAL_DIR="$2"; shift; fi
            shift ;;
        *) error "Unknown option: $1 (try --help)" ;;
    esac
done

have() { command -v "$1" >/dev/null 2>&1; }

fetch() {
    # fetch <url> [outfile]
    local url="$1" out="${2:-}"
    if have curl; then
        if [ -n "$out" ]; then curl -fsSL -o "$out" "$url"; else curl -fsSL "$url"; fi
    elif have wget; then
        if [ -n "$out" ]; then wget -qO "$out" "$url"; else wget -qO- "$url"; fi
    else
        error "curl or wget is required"
    fi
}

detect_asset() {
    local os arch
    case "$(uname -s)" in
        Linux*)  os="linux" ;;
        Darwin*) os="macos" ;;
        CYGWIN*|MINGW*|MSYS*) error "Windows detected — use scripts/install.ps1" ;;
        *) error "Unsupported operating system: $(uname -s)" ;;
    esac
    case "$(uname -m)" in
        x86_64|amd64)  arch="" ;;
        arm64|aarch64) arch="-arm" ;;
        *) error "Unsupported architecture: $(uname -m)" ;;
    esac
    echo "canvas-${os}${arch}"
}

resolve_version() {
    # The repository is a monorepo: one release feed carries cli-v*, web-v*,
    # extension-v* and desktop-v* tags, so /releases/latest is NOT necessarily
    # a CLI release. Take the newest cli-v* tag instead.
    local tag
    tag=$(fetch "https://api.github.com/repos/${REPO}/releases?per_page=50" \
        | grep '"tag_name":' \
        | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/' \
        | grep '^cli-v' \
        | head -n1) || true
    [ -n "$tag" ] || error "Could not resolve the latest cli-v* release from GitHub"
    echo "$tag"
}

sha256_of() {
    if have sha256sum; then sha256sum "$1" | awk '{print $1}'
    elif have shasum; then shasum -a 256 "$1" | awk '{print $1}'
    else echo ""; fi
}

install_binary() {
    local asset tag base tmp expected actual
    asset=$(detect_asset)

    if [ -n "$VERSION" ]; then
        case "$VERSION" in cli-v*) tag="$VERSION" ;; v*) tag="cli-${VERSION}" ;; *) tag="cli-v${VERSION}" ;; esac
    else
        log "Resolving latest release..."
        tag=$(resolve_version)
    fi
    base="https://github.com/${REPO}/releases/download/${tag}"

    log "Release:  ${tag}"
    log "Binary:   ${asset}"
    log "Target:   ${INSTALL_DIR}/${BINARY_NAME}"

    TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/canvas-install.XXXXXX")"
    tmp="$TMP_DIR"

    log "Downloading..."
    fetch "${base}/${asset}" "${tmp}/${asset}" || error "Download failed: ${base}/${asset}"
    [ -s "${tmp}/${asset}" ] || error "Downloaded file is empty: ${asset}"

    # Checksum — SHA256SUMS covers every asset of the release
    if fetch "${base}/SHA256SUMS" "${tmp}/SHA256SUMS" 2>/dev/null; then
        expected=$(grep -E "[ *]${asset}\$" "${tmp}/SHA256SUMS" | awk '{print $1}' | head -n1)
        actual=$(sha256_of "${tmp}/${asset}")
        if [ -z "$actual" ]; then
            warning "No sha256sum/shasum available — skipping checksum verification"
        elif [ -z "$expected" ]; then
            warning "${asset} not listed in SHA256SUMS — skipping checksum verification"
        elif [ "$expected" != "$actual" ]; then
            error "Checksum mismatch for ${asset} (expected ${expected}, got ${actual})"
        else
            success "Checksum verified"
        fi
    else
        warning "SHA256SUMS not available for ${tag} — skipping checksum verification"
    fi

    chmod +x "${tmp}/${asset}"
    "${tmp}/${asset}" --version >/dev/null 2>&1 || error "Downloaded binary does not run"

    mkdir -p "$INSTALL_DIR" || error "Cannot create ${INSTALL_DIR}"
    mv -f "${tmp}/${asset}" "${INSTALL_DIR}/${BINARY_NAME}" || error "Cannot install to ${INSTALL_DIR}"
    success "Installed $("${INSTALL_DIR}/${BINARY_NAME}" --version 2>/dev/null | head -n1)"
}

write_wrapper() {
    # write_wrapper <path> <command line...>
    local target="$1"; shift
    rm -f "$target"
    {
        echo '#!/usr/bin/env bash'
        echo "exec $* \"\$@\""
    } >"$target"
    chmod +x "$target"
}

install_shortcuts() {
    [ "$WITH_SHORTCUTS" = true ] || return 0
    local created=() entry name module
    for entry in "${SHORTCUTS[@]}"; do
        name="${entry%%:*}"; module="${entry##*:}"
        write_wrapper "${INSTALL_DIR}/${name}" "\"${INSTALL_DIR}/${BINARY_NAME}\"" "${module}"
        created+=("$name")
    done
    success "Shortcuts: ${created[*]}"
}

install_local() {
    local cli_dir="$1" runtime="$2" entry name module bin_file created=()
    [ -f "$cli_dir/src/index.js" ] || [ -f "$cli_dir/bin/canvas.js" ] || error "Not a canvas-cli source dir: $cli_dir"

    log "Local install from: $cli_dir (runtime: $runtime)"
    mkdir -p "$INSTALL_DIR" || error "Cannot create ${INSTALL_DIR}"

    write_wrapper "${INSTALL_DIR}/${BINARY_NAME}" "$runtime" "\"$cli_dir/bin/canvas.js\""
    success "Installed: ${INSTALL_DIR}/${BINARY_NAME}"

    if [ "$WITH_SHORTCUTS" = true ]; then
        for entry in "${SHORTCUTS[@]}"; do
            name="${entry%%:*}"; module="${entry##*:}"
            bin_file="$cli_dir/bin/${name}.js"
            # ws.js/ctx.js/... exist as their own entry points; fall back to the module dispatch
            if [ -f "$bin_file" ]; then
                write_wrapper "${INSTALL_DIR}/${name}" "$runtime" "\"$bin_file\""
            else
                write_wrapper "${INSTALL_DIR}/${name}" "\"${INSTALL_DIR}/${BINARY_NAME}\"" "$module"
            fi
            created+=("$name")
        done
        success "Shortcuts: ${created[*]}"
    fi
}

detect_runtime() {
    if have bun; then echo "bun"
    elif have node; then echo "node"
    else error "No JS runtime found — install bun or node"; fi
}

ask_yes_no() {
    # Reads from the terminal, so this also works under `curl | bash`.
    local question="$1" answer
    if [ -t 0 ]; then
        read -r -p "$question [y/N] " answer || return 1
    else
        # Under `curl | bash` stdin is the script, so ask the terminal directly.
        # No terminal (CI, a nested pipe) means "no".
        { exec 3</dev/tty; } 2>/dev/null || return 1
        read -r -u 3 -p "$question [y/N] " answer || { exec 3<&-; return 1; }
        exec 3<&-
    fi
    case "$answer" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}

install_prompt_integration() {
    [ "$PROMPT_MODE" != "no" ] || return 0

    local script_dir="${CANVAS_HOME}/scripts"
    local script="${script_dir}/update-prompt.sh"
    local source_local="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/update-prompt.sh"

    mkdir -p "$script_dir" || { warning "Cannot create ${script_dir}"; return 0; }
    if [ -f "$source_local" ]; then
        cp "$source_local" "$script"
    elif ! fetch "${RAW_BASE}/scripts/update-prompt.sh" "$script"; then
        warning "Could not fetch update-prompt.sh — skipping prompt integration"
        return 0
    fi
    chmod +x "$script"
    success "Prompt script: ${script}"

    have jq || warning "jq is not installed — the prompt integration needs jq (and curl) to show context"

    if [ "$PROMPT_MODE" = "ask" ]; then
        ask_yes_no "Add the Canvas prompt (PS1) integration to your shell rc?" || {
            log "Skipped rc wiring. To enable later, add to your rc file:"
            echo "  [ -f \"\$HOME/.canvas/scripts/update-prompt.sh\" ] && . \"\$HOME/.canvas/scripts/update-prompt.sh\""
            return 0
        }
    fi

    local rc
    case "$(basename "${SHELL:-bash}")" in
        zsh) rc="$HOME/.zshrc" ;;
        *)   rc="$HOME/.bashrc" ;;
    esac

    if [ -f "$rc" ] && grep -q 'update-prompt.sh' "$rc"; then
        log "Already wired into ${rc}"
        return 0
    fi

    {
        echo ''
        echo '# canvas-cli prompt integration'
        if [ "$CANVAS_HOME" = "$HOME/.canvas" ]; then
            echo '[ -f "$HOME/.canvas/scripts/update-prompt.sh" ] && . "$HOME/.canvas/scripts/update-prompt.sh"'
        else
            echo "[ -f \"${script}\" ] && . \"${script}\""
        fi
    } >>"$rc"
    success "Wired into ${rc} — run: source ${rc}"
}

# --- main -------------------------------------------------------------------

log "Canvas CLI installer"

if [ "$LOCAL_INSTALL" = true ]; then
    if [ -z "$LOCAL_DIR" ]; then
        LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    fi
    install_local "$LOCAL_DIR" "$(detect_runtime)"
else
    install_binary
    install_shortcuts
fi

install_prompt_integration

case ":$PATH:" in
    *":$INSTALL_DIR:"*) ;;
    *)
        echo
        warning "${INSTALL_DIR} is not in your PATH"
        echo "  echo 'export PATH=\"${INSTALL_DIR}:\$PATH\"' >> ~/.bashrc && source ~/.bashrc"
        ;;
esac

echo
log "Quick start:"
echo "  canvas --help"
echo "  canvas remote add user@home http://127.0.0.1:8001   # prompts for login"
echo "  canvas remote bind user@home"
echo "  canvas contexts"
echo "  hi lucy \"what's on my plate today?\""
