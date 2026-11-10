# Archived Marş / Saygı Duruşu section

This folder preserves the previous implementation so it can be restored later.

- `src/routes/+page.svelte` is the complete route from before the anthem intro was disabled.
- `main-only/src/routes/+page.svelte` is the interim main-only version, retained for reference.
- `media/` contains the earlier intro WebM, separate intro Opus audio, poster, and 720p WebM variant.

To restore it, copy the archived route back to `src/routes/+page.svelte` and copy these files from `media/` back into `static/`:

- `0_saygiistiklal-full.webm`
- `0_saygiistiklal-intro.opus`
- `0_saygiistiklal-poster.jpg`

The archived `0_saygiistiklal-720p.webm` is the lower-resolution offline variant. The original MP4 sources remain under `video-source/`.
