#!/bin/bash
# Publish a verified signed tester APK so installed apps offer it as an update.
#
# Run ON THE SERVER after the APK has been copied there and inspected
# (scripts/release/inspect-android-apk.mjs on the build machine):
#
#   bash publish-android-apk.sh <apk path> <versionName> <versionCode> <minimumVersionCode> \
#        <expected sha256> <certificate sha256> "<release notes>"
#
# Release notes (HA-UPD, 2026-10-13): phones on 1.0.1 and 1.0.2 still have the
# old updater, which hands the download to the browser and shows only these
# notes. For 1.0.3 (the first build that updates itself) the notes MUST say:
#   "Before installing: delete older onService APK files from your Downloads
#   folder, then open onService-1.0.3-4.apk. From this version on, updates
#   install from inside the app."
# Opening an older APK left in Downloads is the likely cause of "keeps saying
# Update available". The full 1.0.3 checklist is in
# .ai-coder/decisions/D39-in-app-apk-updater.md.
#
# What it does, in order, stopping at the first problem:
#   1. checks every argument against a strict pattern and the APK's sha256,
#      and that the APK declares REQUEST_INSTALL_PACKAGES (without it the app
#      could never install its own next update);
#   2. copies the APK into the API upload volume under releases/android/ as
#      onService-<versionName>-<versionCode>.apk (never overwrites a different
#      file of that name; same bytes are accepted);
#   3. writes latest.json beside it (with the APK's sha256 and, since HA-UPD
#      on 2026-10-13, its md5, which the app checks after downloading the APK
#      itself) and swaps it in with a same-folder rename, so a reader sees
#      either the old or the new manifest, never half of one;
#   4. confirms through https://app.onservice.ph that the API now advertises
#      this build (sha256 and md5) and serves the file with the Android
#      package type.
# Older APKs are kept (an installed app can still finish an older download).
# Literal paths only; nothing is deleted.
set -euo pipefail

APK="${1:?apk path}"
NAME="${2:?versionName}"
CODE="${3:?versionCode}"
MIN="${4:?minimumVersionCode}"
SHA="${5:?expected sha256}"
CERT="${6:?certificate sha256}"
NOTES="${7:-}"
VOLUME=onservice_uploads_data
ORIGIN=https://app.onservice.ph

[[ "$NAME" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]] || { echo "bad versionName"; exit 1; }
[[ "$CODE" =~ ^[1-9][0-9]{0,8}$ ]] || { echo "bad versionCode"; exit 1; }
[[ "$MIN" =~ ^[1-9][0-9]{0,8}$ ]] && [ "$MIN" -le "$CODE" ] || { echo "bad minimumVersionCode"; exit 1; }
[[ "$SHA" =~ ^[a-f0-9]{64}$ ]] || { echo "bad sha256 (lower-case hex)"; exit 1; }
[[ "$CERT" =~ ^[A-F0-9]{64}$ ]] || { echo "bad certificate sha256 (upper-case hex)"; exit 1; }
[ "${#NOTES}" -le 500 ] || { echo "notes longer than 500 characters"; exit 1; }
[ -f "$APK" ] || { echo "no such APK: $APK"; exit 1; }
ACTUAL=$(sha256sum "$APK" | cut -d' ' -f1)
[ "$ACTUAL" = "$SHA" ] || { echo "sha256 mismatch: $ACTUAL"; exit 1; }
# HA-UPD: Android 8+ silently cancels an install started from inside an app
# that does not declare REQUEST_INSTALL_PACKAGES. A coarse check: the name must
# be in the APK's compiled manifest (its string table is UTF-16 or UTF-8). The
# full check is scripts/release/inspect-android-apk.mjs on the build machine.
python3 - "$APK" <<'PY' || { echo "APK does not declare android.permission.REQUEST_INSTALL_PACKAGES, so it could never install its own next update; refusing"; exit 1; }
import sys, zipfile
name = "android.permission.REQUEST_INSTALL_PACKAGES"
with zipfile.ZipFile(sys.argv[1]) as apk:
    manifest = apk.read("AndroidManifest.xml")
sys.exit(0 if name.encode("utf-16-le") in manifest or name.encode("utf-8") in manifest else 1)
PY
SIZE=$(stat -c %s "$APK")
# The app can only compute md5 cheaply on the phone, so it is published too.
MD5=$(md5sum "$APK" | cut -d' ' -f1)
[[ "$MD5" =~ ^[a-f0-9]{32}$ ]] || { echo "could not compute md5"; exit 1; }

DATA=$(docker volume inspect --format '{{ .Mountpoint }}' "$VOLUME")
# The volume lives under a root-only folder, so every check uses sudo.
[ -n "$DATA" ] && sudo -n test -d "$DATA" || { echo "upload volume not found"; exit 1; }
DIR="$DATA/releases/android"
FILE="onService-$NAME-$CODE.apk"
sudo -n mkdir -p "$DIR"
sudo -n chmod 755 "$DATA/releases" "$DIR"

if [ -e "$DIR/$FILE" ]; then
  sudo -n cmp -s "$APK" "$DIR/$FILE" || { echo "$FILE already published with different bytes; refusing"; exit 1; }
  echo "$FILE already present with identical bytes"
else
  sudo -n cp "$APK" "$DIR/.$FILE.tmp-publish"
  sudo -n chmod 644 "$DIR/.$FILE.tmp-publish"
  sudo -n mv "$DIR/.$FILE.tmp-publish" "$DIR/$FILE"
  echo "copied $FILE"
fi

PUBLISHED=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
TMP=$(mktemp)
python3 - "$TMP" "$NAME" "$CODE" "$MIN" "$FILE" "$SHA" "$MD5" "$SIZE" "$CERT" "$PUBLISHED" "$NOTES" <<'PY'
import json, sys
out, name, code, minimum, file, sha, md5, size, cert, published, notes = sys.argv[1:]
json.dump({
  "packageName": "ph.onservice.app", "channel": "tester",
  "versionCode": int(code), "versionName": name, "minimumVersionCode": int(minimum),
  "file": file, "sha256": sha, "md5": md5, "size": int(size), "certificateSha256": cert,
  "publishedAt": published, "notes": notes,
}, open(out, "w"))
PY
# Keep the manifest being replaced, so it can be put back if the API refuses
# the new one (for example an API older than the md5 field, which rejects it).
HAD_PREVIOUS=0
if sudo -n test -f "$DIR/latest.json"; then
  sudo -n cp -p "$DIR/latest.json" "$DIR/.latest.json.previous"
  HAD_PREVIOUS=1
fi
sudo -n cp "$TMP" "$DIR/.latest.json.tmp-publish"
sudo -n chmod 644 "$DIR/.latest.json.tmp-publish"
sudo -n mv -f "$DIR/.latest.json.tmp-publish" "$DIR/latest.json"
rm -f "$TMP"
echo "manifest switched to $NAME ($CODE)"

if ! LIVE=$(curl -fsS "$ORIGIN/api/v1/app-releases/android/latest") ||
   ! echo "$LIVE" | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; assert d['versionCode']==int(sys.argv[1]) and d['sha256']==sys.argv[2] and d.get('md5')==sys.argv[3], d; print('API advertises', d['versionName'], d['versionCode'])" "$CODE" "$SHA" "$MD5"; then
  echo "the API does not advertise the new manifest (is the API deployed with md5 support?)"
  if [ "$HAD_PREVIOUS" = 1 ]; then
    sudo -n mv -f "$DIR/.latest.json.previous" "$DIR/latest.json"
    echo "previous manifest restored"
  fi
  exit 1
fi
TYPE=$(curl -fsSI "$ORIGIN/api/v1/app-releases/android/files/$FILE" | tr -d '\r' | awk -F': ' 'tolower($1)=="content-type"{print $2}')
[ "$TYPE" = "application/vnd.android.package-archive" ] || { echo "download served as '$TYPE'"; exit 1; }
echo "download served as $TYPE"
echo "published"
