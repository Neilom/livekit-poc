#!/bin/bash
#
# Publishes technical documentation to the Confluence POC page.
# Usage: ./docs/publish-to-confluence.sh
#
# Required environment variables:
#   CONFLUENCE_EMAIL    - Your Atlassian email
#   CONFLUENCE_TOKEN    - API token from https://id.atlassian.com/manage-profile/security/api-tokens
#

set -euo pipefail

PAGE_ID="4646764602"
BASE_URL="https://omnichat.atlassian.net/wiki"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONTENT_FILE="$SCRIPT_DIR/confluence-page.html"

if [[ -z "${CONFLUENCE_EMAIL:-}" || -z "${CONFLUENCE_TOKEN:-}" ]]; then
  echo "Error: Set CONFLUENCE_EMAIL and CONFLUENCE_TOKEN environment variables."
  echo ""
  echo "  export CONFLUENCE_EMAIL=your-email@omnichat.com"
  echo "  export CONFLUENCE_TOKEN=your-api-token"
  echo ""
  echo "Generate a token at: https://id.atlassian.com/manage-profile/security/api-tokens"
  exit 1
fi

if [[ ! -f "$CONTENT_FILE" ]]; then
  echo "Error: Content file not found: $CONTENT_FILE"
  exit 1
fi

echo "Fetching current page version..."
CURRENT_VERSION=$(curl -s -u "$CONFLUENCE_EMAIL:$CONFLUENCE_TOKEN" \
  "$BASE_URL/rest/api/content/$PAGE_ID?expand=version" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['version']['number'])")

NEW_VERSION=$((CURRENT_VERSION + 1))
echo "Current version: $CURRENT_VERSION → New version: $NEW_VERSION"

BODY_CONTENT=$(python3 -c "
import json, sys
with open('$CONTENT_FILE', 'r') as f:
    content = f.read()
print(json.dumps(content))
")

echo "Publishing documentation..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X PUT \
  -u "$CONFLUENCE_EMAIL:$CONFLUENCE_TOKEN" \
  -H "Content-Type: application/json" \
  "$BASE_URL/rest/api/content/$PAGE_ID" \
  -d "{
    \"version\": { \"number\": $NEW_VERSION },
    \"title\": \"POC - Ligação com Livekit\",
    \"type\": \"page\",
    \"body\": {
      \"storage\": {
        \"value\": $BODY_CONTENT,
        \"representation\": \"storage\"
      }
    }
  }")

if [[ "$HTTP_CODE" == "200" ]]; then
  echo "Documentation published successfully!"
  echo "View at: $BASE_URL/spaces/AT/pages/$PAGE_ID"
else
  echo "Error: Confluence API returned HTTP $HTTP_CODE"
  echo "Run with verbose (-v) to debug."
  exit 1
fi
