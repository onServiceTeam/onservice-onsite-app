#!/bin/bash
# Publish a verified signed tester APK so installed apps offer it as an update.
#
# Run ON THE SERVER after the APK has been copied there and inspected
# (scripts/release/inspect-android-apk.mjs on the build machine):
#
#   bash publish-android-apk.sh <apk path> <versionName> <versionCode> <minimumVersionCode> \
#        <expected sha256> <certificate sha256> "<release notes>"
#
# What it does, in order, stopping at the first problem:
#   1. checks every argument against a strict pattern and the APK's sha256;
#   2. copies the APK into the API upload volume under releases/android/ as
#      onService-<versionName>-<versionCode>.apk (never overwrites a different
#      file of that name; same bytes are accepted);
#   3. writes latest.json beside it and swaps it in with a same-folder rename,
#      so a reader sees either the old or the new manifest, never half of one;
#   4. confirms through https://app.onservice.ph that the API now advertises
#      this build and serves the file with the Android package type.
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
SIZE=$(stat -c %s "$APK")

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
python3 - "$TMP" "$NAME" "$CODE" "$MIN" "$FILE" "$SHA" "$SIZE" "$CERT" "$PUBLISHED" "$NOTES" <<'PY'
import json, sys
out, name, code, minimum, file, sha, size, cert, published, notes = sys.argv[1:]
json.dump({
  "packageName": "ph.onservice.app", "channel": "tester",
  "versionCode": int(code), "versionName": name, "minimumVersionCode": int(minimum),
  "file": file, "sha256": sha, "size": int(size), "certificateSha256": cert,
  "publishedAt": published, "notes": notes,
}, open(out, "w"))
PY
sudo -n cp "$TMP" "$DIR/.latest.json.tmp-publish"
sudo -n chmod 644 "$DIR/.latest.json.tmp-publish"
sudo -n mv -f "$DIR/.latest.json.tmp-publish" "$DIR/latest.json"
rm -f "$TMP"
echo "manifest switched to $NAME ($CODE)"

LIVE=$(curl -fsS "$ORIGIN/api/v1/app-releases/android/latest")
echo "$LIVE" | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; assert d['versionCode']==int(sys.argv[1]) and d['sha256']==sys.argv[2], d; print('API advertises', d['versionName'], d['versionCode'])" "$CODE" "$SHA"
TYPE=$(curl -fsSI "$ORIGIN/api/v1/app-releases/android/files/$FILE" | tr -d '\r' | awk -F': ' 'tolower($1)=="content-type"{print $2}')
[ "$TYPE" = "application/vnd.android.package-archive" ] || { echo "download served as '$TYPE'"; exit 1; }
echo "download served as $TYPE"
echo "published"
