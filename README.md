# 10 Kasım Memorial Presentation

A SvelteKit memorial presentation with an opening poetry video and an audio-led main section. The project supports the online Cloudflare and GitHub Pages builds, plus a self-contained offline package for local playback.

## Development

Requires [Bun](https://bun.sh/).

```sh
bun install --frozen-lockfile
bun run dev
```

Run the project check before publishing:

```sh
bun run check
```

## Builds

- `bun run build` builds the default Cloudflare deployment.
- GitHub Pages is built in CI with `GITHUB_PAGES=true` and the Pages base path.
- `bun run build:offline` creates `final10kasim.zip` for offline use.

Extract the offline ZIP, keep its folder structure intact, and open `10kasim-offline/index.html` in Firefox ESR. It does not require a local server or internet connection. If playback does not start, verify that extraction completed and reopen the HTML file.
