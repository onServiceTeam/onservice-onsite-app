#!/usr/bin/env bash
# Package an already-built, exact-revision image for isolated release rehearsal.
# No registry upload, deployment credential, production config or DB is involved.
set -euo pipefail
DOCKER_BIN="${DOCKER_BIN:-docker}"
release_sha="${ONSERVICE_RELEASE_SHA:-}"
artifact_dir="${ONSERVICE_ARTIFACT_DIR:-}"
if [[ ! "$release_sha" =~ ^[0-9a-f]{40}$ || -z "$artifact_dir" ]]; then
  echo "ERROR: a full release SHA and a new artifact directory are required." >&2
  exit 2
fi
if [[ "$(git rev-parse HEAD)" != "$release_sha" ]] || ! git diff --quiet HEAD --; then
  echo "ERROR: package only the exact clean source checkout." >&2
  exit 1
fi
image_tag="onservice-api:$release_sha"
image_id="$("$DOCKER_BIN" image inspect --format '{{.Id}}' "$image_tag")"
image_revision="$("$DOCKER_BIN" image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image_tag")"
image_platform="$("$DOCKER_BIN" image inspect --format '{{.Os}}/{{.Architecture}}' "$image_tag")"
if [[ ! "$image_id" =~ ^sha256:[0-9a-f]{64}$ || "$image_revision" != "$release_sha" || "$image_platform" != linux/amd64 ]]; then
  echo "ERROR: expected the reviewed linux/amd64 image with its exact revision label." >&2
  exit 1
fi

# mkdir deliberately rejects an existing target. Never overwrite an older set
# or recursively remove an operator-supplied path on failure.
umask 077
mkdir -- "$artifact_dir"
artifact_dir="$(cd "$artifact_dir" && pwd -P)"
"$DOCKER_BIN" save "$image_tag" </dev/null | gzip -1 > "$artifact_dir/api-image.tar.gz"
gzip -t "$artifact_dir/api-image.tar.gz"
export CANDIDATE_IMAGE_TAG="$image_tag" CANDIDATE_IMAGE_ID="$image_id" CANDIDATE_SOURCE_SHA="$release_sha"
config_path="$(tar -xzOf "$artifact_dir/api-image.tar.gz" manifest.json | node -e '
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => { input += chunk; });
process.stdin.on("end", () => {
  const manifest = JSON.parse(input);
  const entries = Array.isArray(manifest) ? manifest.filter(entry =>
    Array.isArray(entry.RepoTags) && entry.RepoTags.includes(process.env.CANDIDATE_IMAGE_TAG)) : [];
  if (entries.length !== 1 || !/^(?:[a-f0-9]{64}\.json|blobs\/sha256\/[a-f0-9]{64})$/.test(entries[0].Config)) {
    throw new Error("Saved image archive does not identify the requested tag");
  }
  process.stdout.write(entries[0].Config);
});')"
# Check the actual saved config, not only the tag/inspect result before save.
# This catches a changed tag between inspection and packaging.
tar -xzOf "$artifact_dir/api-image.tar.gz" "$config_path" | node -e '
const chunks = [];
process.stdin.on("data", chunk => { chunks.push(chunk); });
process.stdin.on("end", () => {
  const bytes = Buffer.concat(chunks);
  const digest = "sha256:" + require("node:crypto").createHash("sha256").update(bytes).digest("hex");
  const config = JSON.parse(bytes.toString("utf8"));
  if (digest !== process.env.CANDIDATE_IMAGE_ID || config.os !== "linux" || config.architecture !== "amd64" ||
      config.config?.Labels?.["org.opencontainers.image.revision"] !== process.env.CANDIDATE_SOURCE_SHA) {
    throw new Error("Saved image config does not match its inspected identity, platform and source revision");
  }
});'

git bundle create "$artifact_dir/onservice-source.bundle" HEAD
git bundle verify "$artifact_dir/onservice-source.bundle"
if [[ "$(git bundle list-heads "$artifact_dir/onservice-source.bundle")" != "$release_sha HEAD" ]]; then
  echo "ERROR: source bundle does not identify exactly the requested HEAD." >&2
  exit 1
fi

node -e 'process.stdout.write(JSON.stringify({
  schemaVersion: 1, sourceRevision: process.env.CANDIDATE_SOURCE_SHA,
  imageTag: process.env.CANDIDATE_IMAGE_TAG, imageId: process.env.CANDIDATE_IMAGE_ID,
  platform: "linux/amd64", deploymentEligible: false,
  limitation: "Release rehearsal input, not migration/rollback/business acceptance approval."
}, null, 2) + "\n")' > "$artifact_dir/api-candidate.json"
(
  cd "$artifact_dir"
  sha256sum api-image.tar.gz onservice-source.bundle api-candidate.json > SHA256SUMS
  sha256sum -c SHA256SUMS
)
echo "API candidate packaged: $release_sha; not deployed or approved for production."
