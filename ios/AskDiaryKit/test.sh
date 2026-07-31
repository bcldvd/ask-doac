#!/bin/zsh
# Run the AskDiaryKit test suite with Command Line Tools alone (no Xcode).
#
# CLT ships Testing.framework outside the default search path, and its
# _Testing_Foundation cross-import overlay is missing its Modules directory,
# so we add the framework path and disable cross-import overlays. With full
# Xcode selected (xcode-select -s /Applications/Xcode.app), plain `swift test`
# works and this script is unnecessary.
set -e
cd "$(dirname "$0")"

FRAMEWORKS=/Library/Developer/CommandLineTools/Library/Developer/Frameworks
if [[ -d /Applications/Xcode.app && "$(xcode-select -p)" == *Xcode.app* ]]; then
    exec swift test "$@"
fi
exec swift test \
    -Xswiftc -F$FRAMEWORKS \
    -Xswiftc -Xfrontend -Xswiftc -disable-cross-import-overlays \
    -Xlinker -F$FRAMEWORKS \
    -Xlinker -rpath -Xlinker $FRAMEWORKS \
    "$@"
