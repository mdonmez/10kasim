import { enhancedImages } from '@sveltejs/enhanced-img';
import tailwindcss from '@tailwindcss/vite';
import cloudflareAdapter from '@sveltejs/adapter-cloudflare';
import staticAdapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { env } from 'node:process';
import { defineConfig } from 'vite';

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

			adapter: isGithubPages ? staticAdapter({ fallback: '404.html' }) : cloudflareAdapter(),
			paths: { base }
		})
	]
});
