#!/usr/bin/env bash
set -euo pipefail

asset_version="${ASSET_VERSION:-${GITHUB_SHA:-20260612-key-bold}}"
asset_version="${asset_version:0:20}"

export ASSET_VERSION="$asset_version"

find public -name '*.html' -type f -print0 | while IFS= read -r -d '' file; do
  perl -0pi -e 's#href="(((?:\.\./)*)css/style\.css|/css/style\.css)(?:\?v=[^"]*)?"#href="$1?v=$ENV{ASSET_VERSION}"#g; s#src="(((?:\.\./)*)js/main\.js|/js/main\.js)(?:\?v=[^"]*)?"#src="$1?v=$ENV{ASSET_VERSION}"#g' "$file"
done
