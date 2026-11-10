<script lang="ts">
	import { asset } from '$app/paths';
	import './layout.css';


	import type { LayoutProps } from './$types';

	const staticAsset = (filename: Parameters<typeof asset>[0]) =>
		__OFFLINE_BUILD__ ? `./${filename}` : asset(filename);
	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={staticAsset('hilal-yildiz.svg')} type="image/svg+xml" />
	<title>10.11</title>
</svelte:head>

{@render children()}
