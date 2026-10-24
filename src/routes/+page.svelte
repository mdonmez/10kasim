<script lang="ts">
	import { onMount } from "svelte";
	import { asset } from "$app/paths";
	import { cubicOut } from "svelte/easing";
	import { fade } from "svelte/transition";
	import { ArrowLeftFromLine, ArrowRightFromLine, Expand, IterationCw, Pause, Play, Shrink, StepBack, StepForward } from "@lucide/svelte";
	import { Button } from "#lib/components/ui/button";
	import { ProSlider as Slider } from "#lib/components/ui/proslider";
	import { audioStore, type TrackState } from "#lib/audio.svelte.js";

	const PREVIOUS_TRACK_RESTART_THRESHOLD = 3;
	const WELCOME_AUDIO_DURATION_SECONDS = 5;
	const TITLE_TRANSITION_DURATION = 350;
	const TITLE_UPDATE_DEBOUNCE = 220;

	const TRACKS = [
		{ src: asset("1_ney_defteri_selanik_turkusu.wav"), name: "Selanik Türküsü", duration: 62.54 },
		{ src: asset("2_manastir_turkusu_piyano_karaoke.opus"), name: "Manastır Türküsü", duration: 120.6805 },
		{ src: asset("3_her_10_kasim_sabahi_koro_sarkisi_altyapi.opus"), name: "Her 10 Kasım Sabahı", duration: 288.1005 },
		{ src: asset("4_hasretinle_fa_diyez_section.mp3"), name: "Hasretinle Yandı Gönlüm", duration: 253 },
		{ src: asset("5_zara_hatiran_yeter_karaoke.opus"), name: "Hatıran Yeter", duration: 218.8605 }
	];

	let currentIndex = $state(0);
	let isSeeking = $state(false);
	let globalPercent = $state(0);
	let isFullscreen = $state(false);
	let prefersReducedMotion = $state(false);
	let titleMode = $state<"welcome" | "track" | "ending">("welcome");
	let isPlaylistFinished = $state(false);

	onMount(() => {
		for (const track of TRACKS) {
			audioStore.addTrackUrl(track.src, track.name, track.src, track.duration);
		}


		const onFullscreenChange = () => {
			isFullscreen = !!document.fullscreenElement;
		};
		document.addEventListener("fullscreenchange", onFullscreenChange);

		const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
		const onMotionPreferenceChange = (event: MediaQueryListEvent) => {
			prefersReducedMotion = event.matches;
		};
		prefersReducedMotion = motionPreference.matches;
		motionPreference.addEventListener("change", onMotionPreferenceChange);

		audioStore.onTrackEnd = (id: string) => {
			const tracks = audioStore.tracks;
			const index = tracks.findIndex((track) => track.id === id);
			if (index === -1) return;

			if (index === tracks.length - 1) {
				titleMode = "ending";
				isPlaylistFinished = true;
				audioStore.pauseAll();
				currentIndex = -1;
				globalPercent = 100;
				return;
			}

			const nextTrack = tracks[index + 1];
			if (!nextTrack) return;

			currentIndex = index + 1;
			setTimeout(() => audioStore.play(nextTrack.id), 0);
		};

		return () => {
			audioStore.onTrackEnd = null;
			document.removeEventListener("fullscreenchange", onFullscreenChange);
			motionPreference.removeEventListener("change", onMotionPreferenceChange);
		};
	});

	$effect(() => {
		if (audioStore.tracks.length > 0 && currentIndex >= audioStore.tracks.length) {
			currentIndex = 0;
		}
	});

	const currentTrack = $derived(audioStore.tracks[currentIndex] as TrackState | undefined);
	const playbackPosition = $derived.by(() => {
		let position = 0;
		for (let i = 0; i < currentIndex; i++) {
			const duration = audioStore.tracks[i]?.duration;
			if (duration !== undefined && Number.isFinite(duration) && duration > 0) {
				position += duration;
			}
		}
		const currentTime = currentTrack?.currentTime ?? 0;
		return position + (Number.isFinite(currentTime) ? currentTime : 0);
	});
	const displayTitle = $derived(
		titleMode === "ending"
			? "Saygı, Minnet ve Özlemle..."
			: titleMode === "welcome" && playbackPosition < WELCOME_AUDIO_DURATION_SECONDS
				? "Hoş Geldiniz"
				: (currentTrack?.name ?? "Hoş Geldiniz")
	);
	let presentedTitle = $state("Hoş Geldiniz");

	$effect(() => {
		const nextTitle = displayTitle;
		const timeout = window.setTimeout(() => {
			presentedTitle = nextTitle;
		}, TITLE_UPDATE_DEBOUNCE);

		return () => window.clearTimeout(timeout);
	});

	const totalDuration = $derived(
		audioStore.tracks.reduce(
			(sum, track) => sum + (Number.isFinite(track.duration) && track.duration > 0 ? track.duration : 0),
			0
		)
	);

	const cutPositions = $derived.by(() => {
		if (totalDuration <= 0) return [];
		let acc = 0;
		const positions: number[] = [];
		for (let i = 0; i < audioStore.tracks.length - 1; i++) {
			const duration = audioStore.tracks[i].duration;
			acc += Number.isFinite(duration) && duration > 0 ? duration : 0;
			positions.push((acc / totalDuration) * 100);
		}
		return positions;
	});

	// Sync slider position from playback when not seeking.
	$effect(() => {
		if (isPlaylistFinished) {
			globalPercent = 100;
			return;
		}
		if (isSeeking) return;
		if (!Number.isFinite(totalDuration) || totalDuration <= 0) {
			globalPercent = 0;
			return;
		}
		globalPercent = Math.max(0, Math.min(100, (playbackPosition / totalDuration) * 100));
	});

	function showTrackTitle(): void {
		if (titleMode === "ending") titleMode = "track";
		isPlaylistFinished = false;
	}

	function handleGlobalCommit(val: number): void {
		if (!Number.isFinite(val) || !Number.isFinite(totalDuration) || totalDuration <= 0 || audioStore.tracks.length === 0) {
			isSeeking = false;
			return;
		}
		showTrackTitle();
		const target = (val / 100) * totalDuration;
		let acc = 0;
		let idx = 0;
		let offset = 0;
		for (let i = 0; i < audioStore.tracks.length; i++) {
			const duration = audioStore.tracks[i].duration;
			const d = Number.isFinite(duration) && duration > 0 ? duration : 0;
			if (target < acc + d || i === audioStore.tracks.length - 1) {
				idx = i;
				offset = Math.max(0, target - acc);
				break;
			}
			acc += d;
		}

		const wasPlaying = currentTrack?.playing ?? false;
		if (currentTrack) audioStore.pause(currentTrack.id);
		currentIndex = idx;
		const nextTrack = audioStore.tracks[idx];
		if (nextTrack) {
			audioStore.seek(nextTrack.id, offset);
			if (wasPlaying) audioStore.play(nextTrack.id);
		}
		isSeeking = false;
	}

	function selectTrack(index: number): void {
		showTrackTitle();
		const current = audioStore.tracks[currentIndex];
		if (current) audioStore.pause(current.id);
		currentIndex = index;
	}

	function handleNextTrack(): void {
		const tracks = audioStore.tracks;
		if (tracks.length === 0) return;
		showTrackTitle();

		const current = tracks[currentIndex];
		const wasPlaying = current?.playing ?? false;
		if (current) audioStore.pause(current.id);

		const nextIndex = (currentIndex + 1) % tracks.length;
		currentIndex = nextIndex;
		if (wasPlaying) audioStore.play(tracks[nextIndex].id);
	}

	function handlePreviousTrack(): void {
		const tracks = audioStore.tracks;
		const current = tracks[currentIndex];
		if (!current) {
			if (!isPlaylistFinished || tracks.length === 0) return;
			showTrackTitle();
			currentIndex = tracks.length - 1;
			const lastTrack = tracks[currentIndex];
			if (lastTrack) audioStore.seekToStart(lastTrack.id);
			return;
		}
		showTrackTitle();

		if (current.currentTime > PREVIOUS_TRACK_RESTART_THRESHOLD) {
			audioStore.seekToStart(current.id);
			return;
		}

		const wasPlaying = current.playing;
		audioStore.pause(current.id);

		const previousIndex = (currentIndex - 1 + tracks.length) % tracks.length;
		const previousTrack = tracks[previousIndex];
		currentIndex = previousIndex;
		audioStore.seekToStart(previousTrack.id);
		if (wasPlaying) audioStore.play(previousTrack.id);
	}

	function togglePlayback(): void {
		const t = audioStore.tracks[currentIndex];
		if (!t) {
			const firstTrack = audioStore.tracks[0];
			if (!isPlaylistFinished || !firstTrack) return;
			showTrackTitle();
			currentIndex = 0;
			audioStore.seekToStart(firstTrack.id);
			audioStore.play(firstTrack.id);
			return;
		}
		showTrackTitle();
		if (t.playing) audioStore.pause(t.id);
		else audioStore.play(t.id);
	}

	function skipBackward(): void {
		const t = audioStore.tracks[currentIndex];
		if (t) {
			showTrackTitle();
			audioStore.seek(t.id, t.currentTime - 10);
		}
	}

	function skipForward(): void {
		const t = audioStore.tracks[currentIndex];
		if (t) {
			showTrackTitle();
			audioStore.seek(t.id, t.currentTime + 10);
		}
	}

	function seekToStart(): void {
		const t = audioStore.tracks[currentIndex];
		if (t) {
			showTrackTitle();
			audioStore.seekToStart(t.id);
		}
	}

	async function toggleFullscreen(): Promise<void> {
		try {
			if (document.fullscreenElement) {
				await document.exitFullscreen();
			} else {
				await document.documentElement.requestFullscreen();
			}
		} catch (e) {
			console.error(e);
		}
	}

	function restartAll(): void {
		showTrackTitle();
		const current = audioStore.tracks[currentIndex];
		if (current) audioStore.pause(current.id);
		currentIndex = 0;
		const first = audioStore.tracks[0];
		if (first) audioStore.seekToStart(first.id);
	}
</script>

<div class="flex min-h-screen flex-col">
	<header class="sticky top-0 z-50 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
		<div class="mx-auto flex h-28 max-w-[110rem] items-center justify-between px-8">
			<img src={asset("hilal-yildiz.svg")} alt="Hilal ve yıldız" class="h-auto w-24" />
			<h1 class="text-5xl font-extrabold tracking-tight">10.11</h1>
		</div>
	</header>

	<main class="relative mx-auto flex w-full max-w-[110rem] flex-1 flex-col justify-end px-8 pb-0 pt-8">

		<div
			aria-hidden="true"
			class="pointer-events-none absolute left-1/2 top-[32%] z-0 h-[min(64vh,44rem)] aspect-[9/16] -translate-x-1/2 -translate-y-1/2 overflow-hidden"
		>
			<img src={asset("newfoto.jpg")} alt="" class="h-full w-full object-contain" />
			<div class="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-b from-transparent via-black/60 to-black"></div>
		</div>
		<div class="relative z-10 w-full py-8">
			{#if presentedTitle}
				<div class="mb-6 grid place-items-center">
					{#key presentedTitle}
						<h2
							class="col-start-1 row-start-1 w-full -translate-y-6 text-center text-5xl font-extrabold tracking-tight"
							in:fade={{ duration: prefersReducedMotion ? 0 : TITLE_TRANSITION_DURATION, easing: cubicOut }}
							out:fade={{ duration: prefersReducedMotion ? 0 : TITLE_TRANSITION_DURATION, easing: cubicOut }}
						>
							{presentedTitle}
						</h2>
					{/key}
				</div>
			{/if}

			{#if audioStore.tracks.length > 0}
				<div class="mb-2 flex w-full">
					{#each audioStore.tracks as track, i (track.id)}
						<button
							type="button"
							class="truncate px-1 text-center text-xs transition-[color,opacity] duration-400 ease-out {i === currentIndex ? 'font-semibold text-foreground opacity-100' : 'text-muted-foreground opacity-60 hover:text-foreground hover:opacity-100'}"
							style="flex: {Number.isFinite(track.duration) && track.duration > 0 ? track.duration : 1} 1 0%"
							onclick={() => selectTrack(i)}
						>
							{track.name}
						</button>
					{/each}
				</div>
			{/if}

			<Slider
				type="single"
				max={100}
				step={0.1}
				class="mb-6 w-full"
				cuts={cutPositions}
				bind:value={globalPercent}
				onValueCommit={(val: number) => handleGlobalCommit(val)}
				onpointerdown={() => {
					isSeeking = true;
				}}
			/>

			<div class="relative mt-2 flex items-center justify-center">
				<div class="absolute left-0 flex items-center gap-2">
					<Button size="icon-lg" variant="outline" onclick={restartAll} aria-label="Tümünü başa sar">
						<IterationCw />
					</Button>
					<Button
						size="icon-lg"
						variant="outline"
						onclick={handlePreviousTrack}
						aria-label="Önceki parça veya başa sar"
						title="3 saniyeden fazla çaldıysa başa sar, aksi halde önceki parçaya geç"
					>
						<ArrowLeftFromLine />
					</Button>
					<Button
						size="icon-lg"
						variant="outline"
						onclick={handleNextTrack}
						aria-label="Sonraki parça"
						disabled={audioStore.tracks.length === 0}
					>
						<ArrowRightFromLine />
					</Button>
				</div>
				<div class="flex items-center justify-center gap-4">
					<Button size="icon-lg" variant="ghost" onclick={skipBackward} aria-label="Geri sar">
						<StepBack />
					</Button>
					<Button size="icon-lg" onclick={togglePlayback}>
						{#if currentTrack?.playing}
							<Pause />
						{:else}
							<Play />
						{/if}
					</Button>
					<Button size="icon-lg" variant="ghost" onclick={skipForward} aria-label="İleri sar">
						<StepForward />
					</Button>
				</div>
				<div class="absolute right-0">
					<Button size="icon-lg" variant="outline" onclick={toggleFullscreen} aria-label="Tam ekran">
						{#if isFullscreen}
							<Shrink />
						{:else}
							<Expand />
						{/if}
					</Button>
				</div>
			</div>
		</div>
	</main>
</div>
