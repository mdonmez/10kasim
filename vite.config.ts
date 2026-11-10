import { enhancedImages } from '@sveltejs/enhanced-img';
import tailwindcss from '@tailwindcss/vite';
import cloudflareAdapter from '@sveltejs/adapter-cloudflare';
import staticAdapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { env } from 'node:process';
import { defineConfig } from 'vite';

const isOfflineBuild = env.OFFLINE_BUILD === 'true';
const isGithubPages = env.GITHUB_PAGES === 'true';
const base: '' | `/${string}` = isGithubPages ? (env.BASE_PATH ?? '/10kasim') as '' | `/${string}` : '';

export default defineConfig({
	plugins: [
		enhancedImages(),
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			adapter:
				isOfflineBuild || isGithubPages
					? staticAdapter({ fallback: '404.html' })
					: cloudflareAdapter(),
			paths: { base, relative: isOfflineBuild },
			prerender: isOfflineBuild
				? {
						handleHttpError: ({ path, message }) => {
							if (path === '/media/siirvideosu.webm' || path === '/media/onkasim.opus') return;
							throw new Error(message);
						}
					}
				: undefined
		})
	],
	define: {
		__OFFLINE_BUILD__: JSON.stringify(isOfflineBuild)
	}
});
