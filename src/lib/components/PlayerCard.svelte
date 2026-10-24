<script lang="ts">
	import { ArrowLeftFromLine, Pause, Play, StepBack, StepForward } from "@lucide/svelte";

	import { Button } from "#lib/components/ui/button";
	import { Slider } from "#lib/components/ui/slider";
	import { audioStore, type TrackState } from "#lib/audio.svelte.js";

	interface Props {
		track: TrackState;
	}

	let { track }: Props = $props();
	let isSeeking = $state(false);
	let progressValue = $state(0);

	const progressPercent = $derived(
		track.duration > 0 ? (track.currentTime / track.duration) * 100 : 0
	);

	$effect(() => {
		if (!isSeeking) {
			progressValue = progressPercent;
		}
	});

	function handleSeekCommit(val: number): void {
		audioStore.seek(track.id, (val / 100) * track.duration);
		isSeeking = false;
	}

	function togglePlayback(): void {
		if (track.playing) {
			audioStore.pause(track.id);
		} else {
			audioStore.play(track.id);
		}
	}

	function skipBackward(): void {
		audioStore.seek(track.id, track.currentTime - 10);
	}

	function skipForward(): void {
		audioStore.seek(track.id, track.currentTime + 10);
	}

	function seekToStart(): void {
		audioStore.seekToStart(track.id);
	}
</script>

<div class="flex w-full max-w-[110rem] flex-col items-center gap-8">
	<h2 class="text-center text-4xl font-extrabold tracking-tight">{track.name}</h2>

	<div class="flex w-full flex-col gap-8">
		<!-- Progress row -->
		<div class="flex items-center gap-4">
			<Slider
				type="single"
				max={100}
				step={0.1}
				class="flex-1"
				bind:value={progressValue}
				onValueCommit={(val: number) => handleSeekCommit(val)}
				onpointerdown={() => {
					isSeeking = true;
				}}
			/>

		</div>

		<!-- Controls row -->
		<div class="grid grid-cols-3 items-center gap-4">
			<div class="justify-self-start">
				<Button size="lg" variant="outline" onclick={seekToStart}>
					<ArrowLeftFromLine data-icon="inline-start" />
					Başa Sar
				</Button>
			</div>
			<div class="flex items-center justify-center gap-4 justify-self-center">
				<Button size="icon-lg" variant="ghost" onclick={skipBackward} aria-label="Geri sar">
					<StepBack />
				</Button>
				<Button size="icon-lg" onclick={togglePlayback}>
					{#if track.playing}
						<Pause />
					{:else}
						<Play />
					{/if}
				</Button>
				<Button size="icon-lg" variant="ghost" onclick={skipForward} aria-label="İleri sar">
					<StepForward />
				</Button>
			</div>
			<div></div>
		</div>
	</div>
</div>