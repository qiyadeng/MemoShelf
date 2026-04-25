# Pending

## Origin-Backed Library Image Hydration

Status: pending

Decision:
Rich text command images for local writable libraries are stored as real files under `attachments/<command-id>/...` and referenced from command JSON with portable relative paths. For origin-backed libraries that are indexed from external content, we are not hydrating those attachment files locally yet.

What this means right now:
- Local libraries support rich text images end-to-end.
- Origin-backed libraries may contain valid relative image references in command JSON, but SnipForge does not currently download and materialize those referenced image files during sync/reindex.
- Because of that, rich text images from externally sourced library commands should be treated as unsupported until hydration exists.

Expected direction:
- During origin sync, detect image references used by rich text command bodies.
- Download referenced attachment files into the local cached copy / working copy used for that library.
- Resolve those cached attachment paths into safe local renderable URLs for the renderer.
- Clean up cached remote attachments when commands or referenced files are removed upstream.

Reason:
GitHub supports images as normal committed files, not as assets that are auto-uploaded from inside JSON. So if remote rich text images are going to work, SnipForge has to fetch the referenced files itself as part of sync.
