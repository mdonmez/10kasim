<script lang="ts">
	import './layout.css';


	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href="/hilal-yildiz.svg" type="image/svg+xml" />
	<title>10.11</title>
</svelte:head>

{@render children()}
