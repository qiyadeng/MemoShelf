# Auto-Update

Automatic update checking and installation for the desktop app. Users should know when a new version is available without manually checking GitHub Releases.

## Context

Releases are already built via GitHub Actions and published as GitHub Releases (draft → publish). The app currently has no awareness of newer versions. This feature closes that loop.

## Scope

- Check for new versions against GitHub Releases (on launch or periodic)
- Notify the user when an update is available
- Download and install the update (platform-native: DMG on macOS, NSIS on Windows)
- Likely uses `electron-updater` (pairs with `electron-builder` already in the stack)

## Open Questions

These need a proper design session before implementation:

- **Check frequency**: On every launch? Background periodic? Both?
- **Download behavior**: Auto-download in background vs. prompt first?
- **Install timing**: Update-on-quit (less disruptive) vs. immediate restart?
- **UX**: Where does the "update available" notification live? Toast? Badge on settings? Dedicated UI?
- **Code signing**: macOS auto-update requires signed builds. Current signing status needs verification.
- **Staging/canary**: Any need for update channels (stable vs. beta)?
- **Offline/metered**: Should it respect metered connections or just check unconditionally?

## Status

Not started. No GitHub issue yet. Needs a dedicated session to scope properly.
