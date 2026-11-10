import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { build as bundle } from 'esbuild';
import { join, resolve } from 'node:path';

const root = process.cwd();
const buildDir = resolve(root, 'build');
const stagingDir = resolve(root, '.offline-release-stage');
const zipPath = resolve(root, 'final10kasim.zip');
const mediaFiles = ['onkasim.opus', 'siirvideosu.webm'];
const sourceHtmlPath = join(buildDir, 'index.html');

let html = await readFile(sourceHtmlPath, 'utf8');
const basePattern = /base:\s*new URL\("\."\s*,\s*location\)\.pathname\.slice\(0,\s*-1\),/;
if (!basePattern.test(html)) {
	throw new Error('Could not replace SvelteKit’s filesystem-derived base path.');
}
html = html.replace(basePattern, 'base: "",');

const entryDir = join(buildDir, '_app', 'immutable', 'entry');
const entryFiles = await readdir(entryDir);
const startEntry = entryFiles.find((filename) => /^start\..+\.js$/.test(filename));
const appEntry = entryFiles.find((filename) => /^app\..+\.js$/.test(filename));
if (!startEntry || !appEntry) {
	throw new Error('Could not locate the generated SvelteKit client entries.');
}

const baseVersion = html.match(/base:\s*"([^"]*)",\s*version:\s*"([^"]+)"/);
const routeData = html.match(
	/node_ids:\s*(\[[^\]]+\]),\s*data:\s*(\[[^\]]+\]),\s*form:\s*([^,]+),\s*error:\s*([^,\n}]+)/
);
if (!baseVersion || !routeData) {
	throw new Error('Could not read the SvelteKit bootstrap configuration from index.html.');
}

const chunkDir = join(buildDir, '_app', 'immutable', 'chunks');
let vitePreloadHelper: string | undefined;
for (const filename of await readdir(chunkDir)) {
	if (!filename.endsWith('.js')) continue;
	const path = join(chunkDir, filename);
	const contents = await readFile(path, 'utf8');
	if (contents.includes('import.meta.resolve') && contents.includes('modulepreload')) {
		vitePreloadHelper = path;
		break;
	}
}
if (!vitePreloadHelper) {
	throw new Error('Could not locate Vite’s module-preload helper.');
}

const bootstrapPath = join(buildDir, 'offline-bootstrap.ts');
const classicScriptPath = join(buildDir, '_app', 'offline.js');
await writeFile(
	bootstrapPath,
	`import * as kit from "./_app/immutable/entry/${startEntry}";\n` +
		`import * as app from "./_app/immutable/entry/${appEntry}";\n` +
		`const element = document.currentScript?.parentElement;\n` +
		`if (!element) throw new Error("Offline presentation root was not found.");\n` +
		`kit.init({ base: ${JSON.stringify(baseVersion[1])}, version: ${JSON.stringify(baseVersion[2])} });\n` +
		`kit.start(app, element, { node_ids: ${routeData[1]}, data: ${routeData[2]}, form: ${routeData[3]}, error: ${routeData[4]} });\n`,
	'utf8'
);

await bundle({
	entryPoints: [bootstrapPath],
	outfile: classicScriptPath,
	bundle: true,
	format: 'iife',
	platform: 'browser',
	target: 'firefox115',
	minify: true,
	legalComments: 'none',
	define: { 'import.meta.url': 'document.baseURI' },
	plugins: [
		{
			name: 'disable-module-preload-for-file-url',
			setup(builder) {
				builder.onLoad({ filter: /.*/ }, async ({ path }) => {
					if (resolve(path) !== resolve(vitePreloadHelper!)) return;
					return { contents: 'export const t = (load) => load();', loader: 'js' };
				});
			}
		}
	]
});
await rm(bootstrapPath, { force: true });

const noModulePreloads = html.replace(/\s*<link\b(?=[^>]*\brel="modulepreload")[^>]*>/g, '');
const bootstrapScript = /<script>\s*\{\s*__sveltekit_[\s\S]*?<\/script>/;
if (!bootstrapScript.test(noModulePreloads)) {
	throw new Error('Could not replace the module-based SvelteKit bootstrap.');
}
html = noModulePreloads.replace(bootstrapScript, '<script src="./_app/offline.js"></script>');
await writeFile(sourceHtmlPath, html);

const immutableDir = join(buildDir, '_app', 'immutable');
for (const filename of await readdir(immutableDir, { recursive: true })) {
	const path = join(immutableDir, filename);
	if (filename.endsWith('.js')) {
		await rm(path, { force: true });
	} else if (filename.endsWith('.css')) {
		const contents = await readFile(path, 'utf8');
		const withoutExternalLicenseLinks = contents.replace(/\/\*![^]*?\*\//g, (comment) =>
			/https?:\/\//.test(comment) ? '' : comment
		);
		await writeFile(path, withoutExternalLicenseLinks);
	}
}
for (const directory of ['chunks', 'entry', 'nodes']) {
	await rm(join(immutableDir, directory), { recursive: true, force: true });
}

let classicScript = await readFile(classicScriptPath, 'utf8');
classicScript = classicScript.replaceAll('https://svelte.dev/e/', 'Svelte error: ');
await writeFile(classicScriptPath, classicScript);
if (/\bimport\s*\(/.test(classicScript) || /^\s*(?:import|export)\s/m.test(classicScript)) {
	throw new Error('The offline classic script still contains module syntax.');
}

const mediaDir = join(buildDir, 'media');
await mkdir(mediaDir, { recursive: true });
for (const filename of mediaFiles) {
	const source = join(buildDir, filename);
	const destination = join(mediaDir, filename);
	try {
		await rename(source, destination);
	} catch {
		try {
			await cp(join(root, 'static', filename), destination, { preserveTimestamps: true });
		} catch {
			throw new Error(`Expected offline asset was not emitted or found in static/: ${filename}`);
		}
	}
}

for (const filename of await readdir(buildDir)) {
	if (
		filename.endsWith('.opus') ||
		filename === '.assetsignore' ||
		filename === 'robots.txt' ||
		filename === '404.html'
	) {
		await rm(join(buildDir, filename), { recursive: true, force: true });
	}
}


await rm(stagingDir, { recursive: true, force: true });
await rm(zipPath, { force: true });
await mkdir(stagingDir, { recursive: true });
const offlineFolder = join(stagingDir, '10kasim-offline');
await cp(buildDir, offlineFolder, { recursive: true, preserveTimestamps: true });

const readme = `10 Kasım — Offline memorial presentation

Open 10kasim-offline/index.html in Firefox ESR while disconnected from the
internet. Keep the folder intact; the page uses only local files beside index.html.

This edition opens with the poetry video intro, including its own audio. Press Play
to start the video or Anma to skip it. When it ends, the memorial audio player
appears paused; press Play there to begin the main presentation.

If playback does not start, use Firefox ESR, confirm the folder was fully extracted,
and reopen index.html. Do not move index.html away from its _app and media folders.
`;
await writeFile(join(stagingDir, 'README.txt'), readme, 'utf8');

const zip = Bun.spawnSync(
	['zip', '-q', '-r', '-X', zipPath, 'README.txt', '10kasim-offline'],
	{ cwd: stagingDir, stdout: 'pipe', stderr: 'pipe' }
);
if (zip.exitCode !== 0) {
	throw new Error(`ZIP creation failed: ${zip.stderr.toString()}`);
}

await rm(stagingDir, { recursive: true, force: true });
console.log(`Created ${zipPath}`);
