<script lang="ts">
	import { asset } from '$app/paths';
	import './layout.css';


	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={asset('hilal-yildiz.svg')} type="image/svg+xml" />
	<title>10.11</title>
</svelte:head>

{@render children()}
