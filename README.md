# 10 Kasım — Technical Notes

Internal project notes for future maintenance and recall. This is an implementation reference, not presentation or audience-facing copy.

## Current snapshot

- SvelteKit app, TypeScript, Svelte 5 runes, Vite, Tailwind CSS, Howler, and locally bundled Manrope.
- Main experience: a poetry video intro followed by one long-form audio presentation. The previously removed Marş / Saygı Duruşu experience is preserved under `marscodearchive/`.
- `final10kasim.zip` is the current offline package (about 98 MB at last build). It is generated locally and intentionally ignored by Git.
- **No production deployments are currently active.** GitHub Pages was unpublished and its Actions workflow disabled remotely; the Cloudflare Pages project and Cloudflare Worker were deleted. The build configuration remains in the repository for possible future use.
- **Production media URL caveat:** `src/routes/+page.svelte` currently uses `https://mdonmez.github.io/10kasim/` as `MEDIA_BASE_URL` for non-development media. That host was decommissioned. Before redeploying an online build, restore the host or change the media URL strategy (for example, use same-origin assets). Otherwise production audio/video requests will fail even if the app itself builds.

## Project map

| Path | Purpose |
| --- | --- |
| `src/routes/+page.svelte` | Presentation flow, intro/video state, long audio timeline, text states, controls, seeking, and transitions. |
| `src/lib/audio.svelte.ts` | Shared Howler-backed audio store: loading, playback, seeking, volume/mute, and progress polling. |
| `src/routes/+layout.svelte` | Document title, favicon, and root layout. |
| `src/routes/layout.css` | Global styles, theme, and locally imported font setup. |
| `static/` | Runtime assets: `siirvideosu.webm`, `onkasim.opus`, portrait, SVGs, and other retained media. |
| `audio-source/` | Original WAV/source audio used during editing; not fetched by the app at runtime. |
| `video-source/` | Original video inputs. `siirvideosu.mkv` is a local ignored source copy; it is not required for builds. |
| `marscodearchive/` | Archived implementation and media for the removed anthem/moment-of-silence section. See its README for restoration notes. |
| `scripts/package-offline.ts` | Converts the static build into a self-contained `file://`-compatible package and ZIP. |
| `vite.config.ts` | Selects Cloudflare, GitHub Pages, or offline build behavior. |
| `wrangler.jsonc` | Cloudflare Worker configuration; its `10kasim` Worker was deleted. |
| `.github/workflows/deploy-pages.yml` | GitHub Pages build/deploy workflow. The file remains in Git, but the workflow is disabled in repository settings. |

## Runtime flow and state notes

### Poetry intro

1. The opening cover uses the centered Atatürk image against black. Play fades the cover before starting video playback; the video does not start until the cover transition completes.
2. The intro is `static/siirvideosu.webm`, loaded with `preload="metadata"`. Its audio is part of the video.
3. During the final **750 ms**, the video opacity and its media volume are reduced together according to playback time. Pausing pauses the fade; replay resets opacity and volume.
4. At the natural end, or when **Anma** is selected, the intro completes and the main audio player appears paused. Playback is deliberately not started automatically.
5. **Şiir** returns from the main presentation to the video intro. The shared portrait frame is used across sections to avoid a portrait jump during the transition.

### Main audio presentation

- Main asset: `static/onkasim.opus`, one merged track with a declared duration of **943.248667 seconds** (about 15:43).
- Howler is configured with `html5: true` and `preload: false`, so the long track uses a native media element and does not eagerly decode the entire file into Web Audio memory. UI progress is polled every 50 ms (20 Hz).
- The section buttons and global seek bar address positions within this single audio file; the sections are logical timeline ranges, not separate playback files.

| Section | Start (s) | End (s) |
| --- | ---: | ---: |
| Selanik Türküsü | 0 | 62.740 |
| Manastır Türküsü | 62.740 | 183.621 |
| Her 10 Kasım Sabahı | 183.621 | 471.922 |
| Hasretinle Yandı Gönlüm | 471.922 | 727.122 |
| Hatıran Yeter | 727.122 | 943.248667 |

### Media details

- `static/siirvideosu.webm`: WebM container, VP9 video at 1920×1080 and approximately 29.97 fps, with an embedded Opus audio stream. Container duration is about 184.381 seconds; file size is 81,397,634 bytes (~77.6 MiB).
- `static/onkasim.opus`: Ogg/Opus, 48 kHz stereo, 943.248667 seconds; file size is 20,761,834 bytes (~19.8 MiB).
- The offline ZIP bundles these two runtime media files under `10kasim-offline/media/`. The source WAVs and source video files are for editing/archive purposes, not runtime requests.

### Main text and controls

- **0–7 s:** infinity SVG / “Sonsuzluk” welcome state.
- **7 s onward:** the current section title, except for the timed guest and ending states below.
- **478.922–483.922 s:** “Fatma Ela Sarı” guest title.
- **Final 7 s** (from 936.248667 s) and the completed-playlist state: “Saygı, Minnet ve Özlemle”. Completion is latched so the message does not disappear when the audio store resets its playhead.
- Title changes use Web Animations API opacity fades: 1,000 ms out, then 1,000 ms in. The video intro has its separate 750 ms end fade.
- Side controls hide after 5 seconds while playing. Pausing, section selection, reset, and intro completion explicitly reveal them. Dragging the global slider sets `isSeeking` until commit; pointer cancellation clears it. Seeking does not itself force the side controls visible.
- At playlist completion the side controls stay hidden and the center button becomes an undo/reset action.
- Previous restarts the current section when the playhead is more than 3 seconds into it; otherwise it selects the prior section. Next selects the following section. The global slider seeks across the complete 943.248667-second timeline.

## Build and verification commands

Requires Bun. Dependencies are locked in `bun.lock`.

```sh
bun install --frozen-lockfile
bun run dev
bun run check
```

- `bun run build` uses the default Cloudflare adapter and creates the Worker build output under `.svelte-kit/cloudflare/`.
- GitHub Pages uses the static adapter when `GITHUB_PAGES=true`; CI supplies `BASE_PATH` from the Pages configuration. A local equivalent is `GITHUB_PAGES=true BASE_PATH=/10kasim bun run build`.
- `bun run build:offline` sets `OFFLINE_BUILD=true`, builds statically, then runs `scripts/package-offline.ts` to produce `final10kasim.zip`.

The offline packager adjusts SvelteKit's generated base, bundles the client bootstrap into a minified classic IIFE via esbuild (target `firefox115`), removes module-preload/module-chunk dependencies that fail under `file://` CORS rules, and keeps asset references relative. It packages `index.html`, local JS/CSS/font/image files, `media/siirvideosu.webm`, and `media/onkasim.opus`. The generated folder is `10kasim-offline/`; extract it intact and open its `index.html` in Firefox ESR without a server or network. `zip` must be installed on the machine running the packaging script.

The offline prerender may log `404 GET /media/siirvideosu.webm`; this is the expected prerender probe for a media URL that the offline packager places into `media/` afterward. The `vite.config.ts` prerender exception is limited to the expected video/audio paths; other prerender errors should still fail the build.

## Deployment history / reactivation notes

As of **2026-11-10**, the live deployment resources were explicitly removed:

- GitHub Pages site unpublished; the workflow disabled in GitHub settings. Its workflow file is still present in the repository.
- Cloudflare Pages project `10kasim` deleted.
- Cloudflare Worker `10kasim` deleted.

No repository source or offline package was deleted as part of decommissioning. To publish again, first resolve the production media host caveat above.

- GitHub Pages: re-enable the workflow with `gh workflow enable deploy-pages.yml --repo mdonmez/10kasim`, then confirm the repository's Pages build source is set to GitHub Actions. Pushes to `master` trigger the workflow; `workflow_dispatch` also supports a manual run.
- Cloudflare Worker: build, then deploy with the authenticated local Wrangler CLI:

  ```sh
  bun run build
  bun run wrangler deploy
  ```

  `wrangler.jsonc` names the Worker `10kasim`. Cloudflare Pages requires recreating the deleted Pages project and its Git integration/build settings.

Merely running `bun run build` builds output; it does not deploy it.

## Local-only / ignored items

`.gitignore` excludes generated release ZIPs, build output/caches, `*.mkv`, and `video-source/0_saygiistiklal-full-source.mp4`. Ignored media remains on the local machine but is not included in commits. Keep the original files if future remastering or restoration work may be needed.
