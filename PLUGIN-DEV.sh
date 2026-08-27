#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_ROOT="${XDG_CONFIG_HOME:-$HOME/.config}/ywd-hotspot-plugins"
CONFIG_FILE="$CONFIG_ROOT/build.json"
DEFAULT_CORE="$(cd "$ROOT/.." && pwd)/ywd-hotspot"
DIST="$ROOT/dist"

banner() {
  printf '\n============================================================\n'
  printf ' YWD-Hotspot Plugin Development\n'
  printf '============================================================\n'
}

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"; }

cfg_get() {
  local key="$1" default="${2:-}"
  python3 - "$CONFIG_FILE" "$key" "$default" <<'PY'
import json, pathlib, sys
p=pathlib.Path(sys.argv[1]); key=sys.argv[2]; default=sys.argv[3]
try: d=json.loads(p.read_text())
except Exception: d={}
print(d.get(key, default) if isinstance(d, dict) else default)
PY
}

cfg_set() {
  local key="$1" value="$2"
  mkdir -p "$CONFIG_ROOT"; chmod 700 "$CONFIG_ROOT"
  python3 - "$CONFIG_FILE" "$key" "$value" <<'PY'
import json, os, pathlib, sys
p=pathlib.Path(sys.argv[1]); key=sys.argv[2]; value=sys.argv[3]
try: d=json.loads(p.read_text())
except Exception: d={}
if not isinstance(d,dict): d={}
d[key]=value
tmp=p.with_suffix('.tmp'); tmp.write_text(json.dumps(d,indent=2,sort_keys=True)+'\n')
os.chmod(tmp,0o600); os.replace(tmp,p)
PY
}

core_path() { cfg_get core_path "$DEFAULT_CORE"; }

ensure_core() {
  local core answer
  core="$(core_path)"
  if [[ ! -f "$core/tools/ywdplugin-build.py" || ! -d "$core/lib" ]]; then
    printf 'Canonical YWD-Hotspot checkout was not found at:\n  %s\n' "$core" >&2
    read -r -p "Core checkout path [$DEFAULT_CORE]: " answer
    core="${answer:-$DEFAULT_CORE}"
    [[ -f "$core/tools/ywdplugin-build.py" && -d "$core/lib" ]] || die "YWD-Hotspot core checkout is invalid"
    core="$(cd "$core" && pwd)"; cfg_set core_path "$core"
  fi
  printf '%s\n' "$core"
}

plugin_ids() {
  python3 - "$ROOT/plugins" <<'PY'
import json, pathlib, sys
root=pathlib.Path(sys.argv[1])
for p in sorted(root.glob('*/plugin.json')):
    try: d=json.loads(p.read_text())
    except Exception: continue
    ident=str(d.get('id') or '')
    if ident and p.parent.name == ident: print(ident)
PY
}

plugin_meta() {
  python3 - "$ROOT/plugins/$1/plugin.json" <<'PY'
import json, pathlib, sys
d=json.loads(pathlib.Path(sys.argv[1]).read_text())
for key in ('id','version','kind','name'): print(str(d.get(key) or ''))
PY
}

selected_plugin() {
  local requested="${1:-}" id
  id="${requested:-$(cfg_get selected_plugin '')}"
  if [[ -n "$id" && -f "$ROOT/plugins/$id/plugin.json" ]]; then printf '%s\n' "$id"; return; fi
  [[ -z "$requested" ]] || die "Unknown plugin: $requested"
  id="$(plugin_ids | head -n1 || true)"
  [[ -n "$id" ]] || die "No plugins found under $ROOT/plugins"
  cfg_set selected_plugin "$id"; printf '%s\n' "$id"
}

select_plugin_interactive() {
  local choice i
  mapfile -t ids < <(plugin_ids); ((${#ids[@]})) || die "No plugins found"
  printf '\nAvailable plugins:\n'
  for i in "${!ids[@]}"; do printf ' %2d) %s\n' "$((i+1))" "${ids[$i]}"; done
  read -r -p "Select plugin: " choice
  [[ "$choice" =~ ^[0-9]+$ ]] || die "Invalid selection"
  ((choice >= 1 && choice <= ${#ids[@]})) || die "Invalid selection"
  cfg_set selected_plugin "${ids[$((choice-1))]}"
  printf 'Selected: %s\n' "${ids[$((choice-1))]}"
}

validate_plugin() {
  local id core src
  id="$(selected_plugin "${1:-}")"; core="$(ensure_core)"; src="$ROOT/plugins/$id/plugin.json"
  PYTHONPATH="$core/lib" python3 - "$src" <<'PY'
import json, pathlib, sys
path=pathlib.Path(sys.argv[1]); raw=json.loads(path.read_text()); kind=str(raw.get('kind') or '')
if kind == 'declarative': import plugin_manager as manager
elif kind == 'service': import plugin_service_manager as manager
elif kind == 'ui': import plugin_ui_manager as manager
else: raise SystemExit(f'unsupported plugin kind: {kind or "?"}')
out=manager.validate_manifest(path)
print(f"VALID: {out['id']} v{out['version']} ({out['kind']})")
print('Capabilities: '+(', '.join(out.get('capabilities') or []) or 'none'))
PY
}

key_paths_ok() {
  need realpath
  local core root_real core_real private_real public_real
  core="$(ensure_core)"; root_real="$(realpath -m "$ROOT")"; core_real="$(realpath -m "$core")"
  private_real="$(realpath -m "$1")"; public_real="$(realpath -m "$2")"
  case "$private_real/" in "$root_real/"*|"$core_real/"*) die "Refusing to keep a private signing key inside a Git repository";; esac
  case "$public_real/" in "$root_real/"*|"$core_real/"*) die "Key setup target must be outside the Git repositories";; esac
}

setup_keys() {
  need openssl
  local key_id publisher key_dir private public answer
  key_id="$(cfg_get key_id 'kj6ywd-official-1')"; publisher="$(cfg_get publisher 'KJ6YWD')"
  read -r -p "Key ID [$key_id]: " answer; key_id="${answer:-$key_id}"
  [[ "$key_id" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$ ]] || die "Invalid key ID"
  read -r -p "Publisher [$publisher]: " answer; publisher="${answer:-$publisher}"
  key_dir="$CONFIG_ROOT/keys/$key_id"; private="$key_dir/private.pem"; public="$key_dir/public.pem"
  key_paths_ok "$private" "$public"
  if [[ -e "$private" || -e "$public" ]]; then
    read -r -p "Key files already exist. Replace them? [y/N]: " answer
    [[ "$answer" =~ ^[Yy]$ ]] || { printf 'Canceled.\n'; return; }
  fi
  mkdir -p "$key_dir"; chmod 700 "$key_dir"
  openssl genpkey -algorithm Ed25519 -out "$private"
  openssl pkey -in "$private" -pubout -out "$public"
  chmod 600 "$private"; chmod 644 "$public"
  cfg_set key_id "$key_id"; cfg_set publisher "$publisher"; cfg_set private_key "$private"; cfg_set public_key "$public"
  printf '\nPublisher key created.\nKey ID:  %s\nPrivate: %s  (DO NOT COPY TO HOTSPOT)\nPublic:  %s\n' "$key_id" "$private" "$public"
}

output_for() {
  local id="$1" version
  mapfile -t info < <(plugin_meta "$id"); version="${info[1]}"
  printf '%s/%s-%s.ywdplugin\n' "$DIST" "$id" "$version"
}

inspect_package() {
  local package="${1:-}"
  [[ -n "$package" ]] || package="$(output_for "$(selected_plugin)")"
  [[ -f "$package" ]] || die "Package not found: $package"
  python3 - "$package" <<'PY'
import hashlib,json,pathlib,sys,zipfile
p=pathlib.Path(sys.argv[1]); raw=p.read_bytes()
with zipfile.ZipFile(p) as z:
    infos=z.infolist(); pkg=json.loads(z.read('ywdplugin.json')); plug=json.loads(z.read('plugin.json'))
    total=sum(i.file_size for i in infos); largest=max(infos,key=lambda i:i.file_size)
sig=pkg.get('signature') or {}
print('\nBUILD / PACKAGE INSPECTION')
print(f"Plugin:      {plug.get('id')} v{plug.get('version')}")
print(f"Kind:        {plug.get('kind')}")
print(f"Publisher:   {pkg.get('publisher') or 'not set'}")
print(f"Signature:   {sig.get('algorithm','UNSIGNED')}" + (f" / {sig.get('key_id')}" if sig else ''))
print(f"Entries:     {len(infos)} / 32")
print(f"Largest:     {largest.filename} · {largest.file_size} bytes")
print(f"Expanded:    {total} bytes / 2097152")
print(f"Archive:     {len(raw)} bytes / 1048576")
print(f"SHA256:      {hashlib.sha256(raw).hexdigest()}")
print(f"Output:      {p}")
PY
}

build_plugin() {
  local id mode core src out publisher key_id private public kind
  id="$(selected_plugin "${1:-}")"; mode="${2:-unsigned}"; core="$(ensure_core)"; src="$ROOT/plugins/$id"; out="$(output_for "$id")"
  mapfile -t info < <(plugin_meta "$id"); kind="${info[2]}"
  validate_plugin "$id"; mkdir -p "$DIST"; publisher="$(cfg_get publisher 'KJ6YWD')"
  if [[ "$mode" == unsigned ]]; then
    [[ "$kind" == declarative ]] || die "$kind plugins require a signature; use Build + Sign"
    python3 "$core/tools/ywdplugin-build.py" "$src" "$out" --publisher "$publisher"
  else
    key_id="$(cfg_get key_id '')"; private="$(cfg_get private_key '')"; public="$(cfg_get public_key '')"
    [[ -n "$key_id" && -f "$private" && -f "$public" ]] || die "Signing key is not configured. Run Signing Key Setup first."
    key_paths_ok "$private" "$public"
    python3 "$core/tools/ywdplugin-build.py" "$src" "$out" --publisher "$publisher" --sign-key "$private" --key-id "$key_id"
  fi
  inspect_package "$out"
}

verify_package() {
  need openssl
  local package="${1:-}" public
  [[ -n "$package" ]] || package="$(output_for "$(selected_plugin)")"
  [[ -f "$package" ]] || die "Package not found: $package"
  public="$(cfg_get public_key '')"; [[ -f "$public" ]] || die "Configured public key not found; run Signing Key Setup"
  python3 - "$package" "$public" <<'PY'
import base64,json,pathlib,subprocess,sys,tempfile,zipfile
package=pathlib.Path(sys.argv[1]); public=pathlib.Path(sys.argv[2])
with zipfile.ZipFile(package) as z:
    manifest=z.read('ywdplugin.json'); doc=json.loads(manifest); sigdoc=doc.get('signature')
    if not sigdoc: raise SystemExit('Package is unsigned')
    sig=base64.b64decode(z.read('signature.ed25519').strip(), validate=True)
with tempfile.TemporaryDirectory(prefix='ywd-plugin-verify-') as td:
    td=pathlib.Path(td); m=td/'manifest'; s=td/'signature'; m.write_bytes(manifest); s.write_bytes(sig)
    p=subprocess.run(['openssl','pkeyutl','-verify','-pubin','-inkey',str(public),'-rawin','-in',str(m),'-sigfile',str(s)],capture_output=True,text=True)
    if p.returncode: raise SystemExit((p.stderr or p.stdout or 'signature verification failed').strip())
print(f"SIGNATURE VERIFIED: {sigdoc.get('key_id')} / {sigdoc.get('algorithm')}")
PY
}

trust_command() {
  local key_id public private
  key_id="$(cfg_get key_id '')"; public="$(cfg_get public_key '')"; private="$(cfg_get private_key '')"
  [[ -n "$key_id" && -f "$public" ]] || die "Signing key is not configured"
  printf '\nCopy the PUBLIC key to the hotspot, then run there:\n\n'
  printf 'sudo install -d -o root -g root -m 0750 /etc/ywd-hotspot/plugin-trust.d\n'
  printf 'sudo install -o root -g root -m 0644 %q /etc/ywd-hotspot/plugin-trust.d/%s.pem\n\n' "$(basename "$public")" "$key_id"
  printf 'Local public key: %s\nPrivate key stays here: %s\n' "$public" "$private"
}

clean_dist() { mkdir -p "$DIST"; find "$DIST" -maxdepth 1 -type f -name '*.ywdplugin' -delete; printf 'Cleaned %s\n' "$DIST"; }

status_block() {
  local core id branch version
  core="$(ensure_core)"; id="$(selected_plugin)"; mapfile -t info < <(plugin_meta "$id")
  branch="$(git -C "$core" branch --show-current 2>/dev/null || printf '?')"; version="$(cat "$core/VERSION" 2>/dev/null || printf '?')"
  printf ' Core:        %s\n Core branch: %s\n Core ver:    %s\n Plugin:      %s v%s (%s)\n Key ID:      %s\n' "$core" "$branch" "$version" "$id" "${info[1]}" "${info[2]}" "$(cfg_get key_id 'not configured')"
}

menu() {
  while true; do
    banner; status_block
    cat <<'EOF'

 1) Select Plugin
 2) Validate Plugin Source
 3) Build Plugin (unsigned declarative)
 4) Build + Sign Plugin
 5) Inspect Built Package
 6) Verify Package Signature
 7) Signing Key Setup
 8) Show Hotspot Trust-Key Install Command
 9) Clean dist/
 0) Exit
EOF
    read -r -p '> ' choice
    case "$choice" in
      1) select_plugin_interactive;; 2) validate_plugin;; 3) build_plugin "" unsigned;; 4) build_plugin "" signed;;
      5) inspect_package;; 6) verify_package;; 7) setup_keys;; 8) trust_command;; 9) clean_dist;; 0) exit 0;;
      *) printf 'Unknown choice.\n';;
    esac
    read -r -p 'Press Enter to continue…' _
  done
}

need python3
cmd="${1:-menu}"
case "$cmd" in
  menu) menu;;
  list) plugin_ids;;
  select)
    [[ -n "${2:-}" ]] || die "usage: $0 select PLUGIN_ID"
    selected_plugin "$2" >/dev/null; cfg_set selected_plugin "$2"; printf 'Selected: %s\n' "$2";;
  validate) validate_plugin "${2:-}";;
  build) build_plugin "${2:-}" unsigned;;
  sign) build_plugin "${2:-}" signed;;
  inspect) inspect_package "${2:-}";;
  verify) verify_package "${2:-}";;
  keys) setup_keys;;
  trust-command) trust_command;;
  clean) clean_dist;;
  *) die "usage: $0 {menu|list|select|validate|build|sign|inspect|verify|keys|trust-command|clean}";;
esac
