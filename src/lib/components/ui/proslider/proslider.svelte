<script lang="ts">
	import { Slider as SliderPrimitive } from "bits-ui";
	import { cn, type WithoutChildrenOrChild } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		value = $bindable(),
		orientation = "horizontal",
		class: className,
		cuts = [],
		...restProps
	}: WithoutChildrenOrChild<SliderPrimitive.RootProps> & { cuts?: number[] } = $props();
</script>

<SliderPrimitive.Root
	bind:ref
	bind:value={value as never}
	data-slot="proslider"
	{orientation}
	class={cn(
		"data-vertical:min-h-40 relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:w-auto data-vertical:flex-col",
		className
	)}
	{...restProps}
>
	{#snippet children({ thumbItems })}
		<span
			data-slot="proslider-track"
			data-orientation={orientation}
			class={cn(
				"rounded-full data-horizontal:h-1 data-horizontal:w-full data-vertical:h-full data-vertical:w-1 relative grow overflow-hidden bg-muted data-horizontal:w-full data-vertical:h-full"
			)}
		>
			<SliderPrimitive.Range
				data-slot="proslider-range"
				class={cn(
					"absolute select-none rounded-full data-horizontal:h-full data-vertical:w-full bg-gradient-to-r from-primary/35 via-primary/70 to-primary transition-[width,transform] duration-100 ease-out motion-reduce:transition-none after:absolute after:-right-1 after:top-1/2 after:size-3 after:-translate-y-1/2 after:rounded-full after:bg-primary after:opacity-80 after:blur-md after:content-['']"
				)}
			/>
			{#each cuts as cut, i (i)}
				<span
					class="absolute inset-y-0 w-px bg-background/60"
					style="left: {cut}%"
				></span>
			{/each}
		</span>
		{#each thumbItems as thumb (thumb.index)}
			<SliderPrimitive.Thumb
				index={thumb.index}
				class="border-ring ring-ring/50 relative size-3 rounded-full border bg-white transition-[color,box-shadow] after:absolute after:-inset-2 hover:ring-3 focus-visible:ring-3 focus-visible:outline-hidden active:ring-3 block shrink-0 select-none disabled:pointer-events-none disabled:opacity-50"
			/>
		{/each}
	{/snippet}
</SliderPrimitive.Root>
