#!/bin/zsh
# Archive AskDiary and upload it to App Store Connect (TestFlight).
#
# Activates once the user enrolls in the Apple Developer Program:
#   1. Xcode → Settings → Accounts → add the Apple ID that holds the paid team.
#   2. Find the team ID under that account (10 chars, e.g. AB12CD34EF).
#   3. Create an App Store Connect API key (Users and Access → Integrations)
#      with App Manager role; download the .p8.
#
# Usage:
#   TEAM_ID=AB12CD34EF \
#   ASC_KEY_ID=XXXXXXXXXX ASC_ISSUER_ID=uuid ASC_KEY_P8=~/keys/AuthKey.p8 \
#     ./scripts/archive-upload.sh            # archive + upload to TestFlight
#   TEAM_ID=AB12CD34EF ./scripts/archive-upload.sh --archive-only
#
# Before the first upload, also uncomment the iCloud entitlement block in
# project.yml (CloudKit needs the paid program) so history sync ships enabled.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${TEAM_ID:?Set TEAM_ID to your Apple Developer team ID (Xcode → Settings → Accounts, after enrollment)}"

ARCHIVE=build/AskDiary.xcarchive
mkdir -p build

echo "==> xcodegen"
xcodegen

echo "==> archive"
xcodebuild -project AskDiary.xcodeproj -scheme AskDiary \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  DEVELOPMENT_TEAM="$TEAM_ID" CODE_SIGN_STYLE=Automatic \
  -allowProvisioningUpdates \
  archive

if [[ "${1:-}" == "--archive-only" ]]; then
  echo "==> archive ready at $ARCHIVE (skipping upload)"
  exit 0
fi

: "${ASC_KEY_ID:?Set ASC_KEY_ID (App Store Connect API key ID)}"
: "${ASC_ISSUER_ID:?Set ASC_ISSUER_ID (App Store Connect issuer ID)}"
: "${ASC_KEY_P8:?Set ASC_KEY_P8 (path to the AuthKey .p8 file)}"

cat > build/ExportOptions.plist <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key><string>app-store-connect</string>
    <key>destination</key><string>upload</string>
    <key>teamID</key><string>${TEAM_ID}</string>
    <key>manageAppVersionAndBuildNumber</key><true/>
</dict>
</plist>
PLIST

echo "==> export + upload to App Store Connect"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportOptionsPlist build/ExportOptions.plist \
  -exportPath build/export \
  -allowProvisioningUpdates \
  -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID" \
  -authenticationKeyPath "${ASC_KEY_P8/#\~/$HOME}"

echo "==> uploaded. Check App Store Connect → TestFlight for processing status."
