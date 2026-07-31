#!/bin/zsh
# Generate App Store screenshots on the 6.9" class simulator (iPhone 17 Pro Max).
# Real retrieval + real Foundation Models answer (host needs Apple Intelligence).
# Output: ios/AppStore/screenshots/*.png
set -euo pipefail
cd "$(dirname "$0")/.."

DEVICE="${DEVICE:-iPhone 17 Pro Max}"
BUNDLE=com.davidbocle.askdiary
OUT=AppStore/screenshots
mkdir -p "$OUT"

xcrun simctl boot "$DEVICE" 2>/dev/null || true
xcrun simctl bootstatus "$DEVICE"

echo "==> build + clean install (uninstall wipes SwiftData between runs)"
xcodegen
xcodebuild -project AskDiary.xcodeproj -scheme AskDiary \
  -destination "platform=iOS Simulator,name=$DEVICE" \
  -derivedDataPath DerivedData build | tail -1
xcrun simctl uninstall "$DEVICE" "$BUNDLE" 2>/dev/null || true
xcrun simctl install "$DEVICE" DerivedData/Build/Products/Debug-iphonesimulator/AskDiary.app

# the classic pristine status bar
xcrun simctl status_bar "$DEVICE" override \
  --time "9:41" --batteryState discharging --batteryLevel 100 --wifiBars 3 --cellularBars 4 --operatorName ""

shot() { xcrun simctl io "$DEVICE" screenshot "$OUT/$1.png"; echo "  -> $OUT/$1.png"; }
relaunch() {
  xcrun simctl terminate "$DEVICE" "$BUNDLE" 2>/dev/null || true
  sleep 1
  xcrun simctl launch "$DEVICE" "$BUNDLE" "$@" >/dev/null
}

echo "==> 4. empty studio (first-run home, before any question)"
relaunch -SkipOnboarding
sleep 2
shot 4-studio

echo "==> 2. onboarding privacy page"
relaunch -ResetOnboarding -OnboardingPage 1
sleep 2
shot 2-privacy

echo "==> 3. onboarding what-it-is page"
relaunch -ResetOnboarding -OnboardingPage 0
sleep 2
shot 3-what-it-is

echo "==> 1. hero: a real answered question, parked on the question"
relaunch -SkipOnboarding -ScrollTopWhenDone -AutoAsk "Is the 10,000 hours rule actually true?"
sleep 50  # retrieval + full FM generation + settle
shot 1-answer

xcrun simctl status_bar "$DEVICE" clear
echo "==> done: $(ls "$OUT" | wc -l | tr -d ' ') screenshots in $OUT"
