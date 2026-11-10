<script lang="ts">
	import { onMount } from "svelte";

	import { prefersReducedMotion } from "svelte/motion";
	import { asset } from "$app/paths";

	import { ArrowLeftFromLine, ArrowRightFromLine, Expand, IterationCw, Pause, Play, Shrink, Undo2 } from "@lucide/svelte";
	import { Button } from "#lib/components/ui/button";
	import { ProSlider as Slider } from "#lib/components/ui/proslider";
	import { audioStore, type TrackState } from "#lib/audio.svelte.js";

	const PREVIOUS_TRACK_RESTART_THRESHOLD = 3;
	const WELCOME_HOLD_DURATION_SECONDS = 7;
	const SIDE_CONTROLS_HIDE_DELAY_MS = 5000;
	const TITLE_FADE_DURATION_MS = 1000;
	const MERGED_AUDIO_DURATION_SECONDS = 943.248667;
	const FINAL_MESSAGE_START_SECONDS = MERGED_AUDIO_DURATION_SECONDS - WELCOME_HOLD_DURATION_SECONDS;
	const WELCOME_TITLE = "Hoş Geldiniz";
	const ENDING_MESSAGE = "Saygı, Minnet ve Özlemle";
	type MainTextState = {
		kind: "welcome" | "track" | "guest" | "ending";
		text: string;
	};
	const TRACKS = [
		{ name: "Selanik Türküsü", start: 0, end: 62.74, fadeOutStart: 59.54 },
		{ name: "Manastır Türküsü", start: 62.74, end: 183.621, fadeOutStart: 180.421 },
		{ name: "Her 10 Kasım Sabahı", start: 183.621, end: 471.922, fadeOutStart: 468.722 },
		{ name: "Hasretinle Yandı Gönlüm", start: 471.922, end: 727.122, fadeOutStart: 723.922 },
		{ name: "Hatıran Yeter", start: 727.122, end: MERGED_AUDIO_DURATION_SECONDS, fadeOutStart: undefined }
	] as const;
	const GUEST_MESSAGE = "Fatma Ela Sarı";
	const GUEST_TITLE_START_SECONDS = TRACKS[3].start + 7;
	const GUEST_TITLE_END_SECONDS = GUEST_TITLE_START_SECONDS + 5;
	const MEDIA_BASE_URL = "https://mdonmez.github.io/10kasim/";
	const staticAsset = (filename: Parameters<typeof asset>[0]) =>
		__OFFLINE_BUILD__ ? `./${filename}` : asset(filename);
	const mediaAsset = (filename: Parameters<typeof asset>[0]) =>
		__OFFLINE_BUILD__
			? `./media/${filename}`
			: import.meta.env.DEV
				? asset(filename)
				: `${MEDIA_BASE_URL}${filename}`;
	const AUDIO_SOURCE = {
		src: mediaAsset("onkasim.opus"),
		name: "10 Kasım",
		duration: MERGED_AUDIO_DURATION_SECONDS
	};
	let isSeeking = $state(false);
	let globalPercent = $state(0);
	let isFullscreen = $state(false);

	let hasSelectedSection = $state(false);
	let isPlaylistFinished = $state(false);
	let sideControlsVisible = $state(true);
	let sideControlsHideTimeout: number | undefined;
	let titleHeading = $state<HTMLHeadingElement>();
	let titleAnimation: Animation | null = null;

	onMount(() => {
		void audioStore.addTrackUrl(AUDIO_SOURCE.src, AUDIO_SOURCE.name, AUDIO_SOURCE.src, AUDIO_SOURCE.duration);

		const onFullscreenChange = () => {
			isFullscreen = !!document.fullscreenElement;
		};
		document.addEventListener("fullscreenchange", onFullscreenChange);


		audioStore.onTrackEnd = (id: string) => {
			if (id !== AUDIO_SOURCE.src) return;
			isPlaylistFinished = true;
			hideSideControls();
			globalPercent = 100;
		};

		return () => {
			audioStore.onTrackEnd = null;
			if (sideControlsHideTimeout !== undefined) window.clearTimeout(sideControlsHideTimeout);
			titleAnimation?.cancel();
			document.removeEventListener("fullscreenchange", onFullscreenChange);
		};
	});


	const currentTrack = $derived(audioStore.tracks[0] as TrackState | undefined);

	function showSideControls(): void {
		if (sideControlsHideTimeout !== undefined) {
			window.clearTimeout(sideControlsHideTimeout);
			sideControlsHideTimeout = undefined;
		}
		sideControlsVisible = true;
	}

	function hideSideControls(): void {
		if (sideControlsHideTimeout !== undefined) {
			window.clearTimeout(sideControlsHideTimeout);
			sideControlsHideTimeout = undefined;
		}
		sideControlsVisible = false;
	}

	function scheduleSideControlsHide(): void {
		if (sideControlsHideTimeout !== undefined) window.clearTimeout(sideControlsHideTimeout);
		sideControlsVisible = true;
		sideControlsHideTimeout = window.setTimeout(() => {
			sideControlsVisible = false;
			sideControlsHideTimeout = undefined;
		}, SIDE_CONTROLS_HIDE_DELAY_MS);
	}

	const playbackPosition = $derived(currentTrack?.currentTime ?? 0);
	const totalDuration = MERGED_AUDIO_DURATION_SECONDS;

	function sectionIndexAt(time: number): number {
		for (let i = TRACKS.length - 1; i >= 0; i--) {
			if (time >= TRACKS[i].start) return i;
		}
		return 0;
	}

	const currentIndex = $derived(isPlaylistFinished ? TRACKS.length - 1 : sectionIndexAt(playbackPosition));
	const currentSection = $derived(TRACKS[currentIndex]);
	const hasTrackFocus = $derived(
		!isPlaylistFinished && (currentTrack?.playing === true || playbackPosition > 0 || hasSelectedSection)
	);

	const mainText = $derived.by((): MainTextState => {
		if (isPlaylistFinished || playbackPosition >= FINAL_MESSAGE_START_SECONDS) {
			return { kind: "ending", text: ENDING_MESSAGE };
		}

		if (playbackPosition < WELCOME_HOLD_DURATION_SECONDS && currentIndex === 0) {
			return { kind: "welcome", text: WELCOME_TITLE };
		}

		if (playbackPosition >= GUEST_TITLE_START_SECONDS && playbackPosition < GUEST_TITLE_END_SECONDS) {
			return { kind: "guest", text: GUEST_MESSAGE };
		}

		return { kind: "track", text: currentSection?.name ?? WELCOME_TITLE };
	});
	const currentTitle = $derived(mainText.text);
	const currentTitleState = $derived(mainText.kind);

	let displayedTitle = $state(WELCOME_TITLE);
	let requestedTitle = WELCOME_TITLE;

	$effect(() => {
		const nextTitle = currentTitle;
		const element = titleHeading;
		const reduceMotion = prefersReducedMotion.current;

		if (nextTitle === requestedTitle) {
			if (reduceMotion && titleAnimation) {
				titleAnimation.cancel();
				titleAnimation = null;
				if (element) element.style.opacity = "";
				displayedTitle = nextTitle;
			}
			return;
		}

		requestedTitle = nextTitle;
		if (!element || reduceMotion) {
			titleAnimation?.cancel();
			titleAnimation = null;
			if (element) element.style.opacity = "";
			displayedTitle = nextTitle;
			return;
		}

		const currentOpacity = Number.parseFloat(getComputedStyle(element).opacity);
		const startOpacity = Number.isFinite(currentOpacity) ? currentOpacity : 1;
		titleAnimation?.cancel();

		const fadeOut = element.animate(
			[{ opacity: startOpacity }, { opacity: 0 }],
			{ duration: TITLE_FADE_DURATION_MS, easing: "ease-in-out", fill: "forwards" }
		);
		titleAnimation = fadeOut;

		void fadeOut.finished
			.then(() => {
				if (requestedTitle !== nextTitle) return;
				if (prefersReducedMotion.current) {
					element.style.opacity = "";
					displayedTitle = nextTitle;
					titleAnimation = null;
					return;
				}

				fadeOut.cancel();
				element.style.opacity = "0";
				displayedTitle = nextTitle;

				const fadeIn = element.animate(
					[{ opacity: 0 }, { opacity: 1 }],
					{ duration: TITLE_FADE_DURATION_MS, easing: "ease-in-out" }
				);
				titleAnimation = fadeIn;

				void fadeIn.finished
					.then(() => {
						if (titleAnimation !== fadeIn) return;
						fadeIn.cancel();
						element.style.opacity = "";
						titleAnimation = null;
					})
					.catch(() => {});
			})
			.catch(() => {});
	});

	const cutPositions = TRACKS.slice(1).map((section) => (section.start / totalDuration) * 100);

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
		isPlaylistFinished = false;
	}

	function focusSelectedSection(): void {
		hasSelectedSection = true;
	}

	function handleGlobalCommit(val: number): void {
		if (!Number.isFinite(val) || totalDuration <= 0 || !currentTrack) {
			isSeeking = false;
			return;
		}
		showTrackTitle();
		focusSelectedSection();
		audioStore.seek(currentTrack.id, (val / 100) * totalDuration);
		isSeeking = false;
	}

	function selectTrack(index: number): void {
		const section = TRACKS[index];
		if (!section || !currentTrack) return;
		showTrackTitle();
		focusSelectedSection();
		audioStore.pause(currentTrack.id);
		audioStore.seek(currentTrack.id, section.start);
		showSideControls();
	}

	function handleNextTrack(): void {
		if (!currentTrack) return;
		const wasFinished = isPlaylistFinished;
		showTrackTitle();
		const nextIndex = wasFinished ? 0 : (currentIndex + 1) % TRACKS.length;
		const nextSection = TRACKS[nextIndex];
		if (!nextSection) return;
		focusSelectedSection();
		isPlaylistFinished = false;
		audioStore.seek(currentTrack.id, nextSection.start);
	}

	function handlePreviousTrack(): void {
		if (!currentTrack) return;
		const wasFinished = isPlaylistFinished;
		showTrackTitle();
		focusSelectedSection();

		if (wasFinished) {
			isPlaylistFinished = false;
			audioStore.seek(currentTrack.id, TRACKS[TRACKS.length - 1].start);
			return;
		}

		if (currentTrack.currentTime - (currentSection?.start ?? 0) > PREVIOUS_TRACK_RESTART_THRESHOLD) {
			audioStore.seek(currentTrack.id, currentSection?.start ?? 0);
			return;
		}

		const previousIndex = (currentIndex - 1 + TRACKS.length) % TRACKS.length;
		const previousSection = TRACKS[previousIndex];
		if (previousSection) audioStore.seek(currentTrack.id, previousSection.start);
	}

	function togglePlayback(): void {
		const t = currentTrack;
		if (!t) return;
		showTrackTitle();
		if (t.playing) {
			audioStore.pause(t.id);
			showSideControls();
		} else {
			audioStore.play(t.id);
			scheduleSideControlsHide();
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
		hasSelectedSection = false;
		showTrackTitle();
		showSideControls();
		if (currentTrack) {
			audioStore.pause(currentTrack.id);
			audioStore.seekToStart(currentTrack.id);
		}
	}
	</script>


<div
	class="flex min-h-screen flex-col p-[var(--page-gutter)]"
	style="--page-gutter: clamp(1.25rem, 3vw, 3rem); --display-size: clamp(3rem, 5.5vw, 7rem)"
>
	<header class="sticky top-[var(--page-gutter)] z-50 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
		<div class="flex h-28 w-full items-start justify-between">
			<img
				src={staticAsset("hilal-yildiz.svg")}
				alt="Hilal ve yıldız"
				class="w-auto"
				style:height="var(--display-size)"
			/>
			<h1
				class="leading-none font-extrabold tracking-tight"
				style:font-size="var(--display-size)"
			>
				10.11
			</h1>
		</div>
	</header>

	<main class="relative mx-auto flex w-full max-w-[106rem] flex-1 flex-col justify-end">

		<div
			aria-hidden="true"
			class="pointer-events-none absolute left-1/2 top-[36%] z-0 h-[min(78vh,54rem)] aspect-[9/16] -translate-x-1/2 -translate-y-1/2 overflow-hidden"
		>
			<img src={staticAsset("newfoto.jpg")} alt="" class="h-full w-full object-contain" />
			<div class="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-b from-transparent via-black/60 to-black"></div>
		</div>
		<div class="relative z-10 w-full">
			<div class="mb-6 grid min-h-24 place-items-center px-2 text-center sm:min-h-28">
				<h2
					bind:this={titleHeading}
					class="max-w-6xl leading-tight font-extrabold tracking-tight"
					style:font-size="var(--display-size)"
					aria-live="polite"
					aria-atomic="true"
					data-main-text-state={currentTitleState}
				>
					{displayedTitle}
				</h2>
			</div>

			{#if audioStore.tracks.length > 0}
				<div class="mb-2 flex w-full">
					{#each TRACKS as section, i (section.name)}
						<button
							type="button"
							class="touch-manipulation truncate px-1 text-center text-xs transition-[color,opacity] duration-300 ease-in-out {hasTrackFocus && i === currentIndex ? 'font-semibold text-foreground opacity-100' : 'text-muted-foreground opacity-60 hover:text-foreground hover:opacity-100'}"
							style="flex: {section.end - section.start} 1 0%"
							title={section.name}
							aria-label={`Seek to ${section.name}`}
							aria-pressed={hasTrackFocus && i === currentIndex}
							onclick={() => selectTrack(i)}
						>
							{section.name}
						</button>
					{/each}
				</div>
			{/if}
			<Slider
				type="single"
				aria-label="Çalma konumu"
				disabled={!currentTrack}
				max={100}
				step={0.1}
				class="mb-6 w-full"
				cuts={cutPositions}
				bind:value={globalPercent}
				onValueCommit={(val: number) => handleGlobalCommit(val)}
				onpointerdown={() => {
					isSeeking = true;
				}}
				onpointercancel={() => {
					isSeeking = false;
				}}
			/>

			<div class="relative mt-2 h-28 sm:h-8" aria-hidden="true" inert></div>
		</div>
	</main>
</div>

<footer
	class="pointer-events-none fixed inset-x-0 bottom-[var(--page-gutter)] z-[60] mx-auto flex w-full max-w-[112rem] flex-col items-center gap-3 px-[var(--page-gutter)] sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-0"
	style="--page-gutter: clamp(1.25rem, 3vw, 3rem)"
>
	<div
		class="pointer-events-none flex items-center gap-1 justify-self-center transition-opacity duration-500 ease-out motion-reduce:transition-none sm:justify-self-start {!sideControlsVisible ? 'opacity-0' : 'opacity-100'}"
		inert={!sideControlsVisible}
	>
		<Button
			size="sm"
			variant="outline"
			class="pointer-events-auto touch-manipulation transition-all duration-300 ease-in-out motion-reduce:transition-none"
			aria-label="Sar"
			title="Sar"
			disabled={!currentTrack}
			onclick={restartAll}
		>
			<IterationCw data-icon="inline-start" />
			Sar
		</Button>
	</div>


	<div class="pointer-events-none grid w-64 max-w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:w-64">
		<div
			class="pointer-events-none w-full min-w-0 overflow-x-clip overflow-y-visible transition-opacity duration-300 ease-in-out motion-reduce:transition-none {!sideControlsVisible ? 'opacity-0' : 'opacity-100'}"
			aria-hidden={!sideControlsVisible}
			inert={!sideControlsVisible}
		>
			<div class="flex w-full min-w-0 justify-end overflow-x-clip overflow-y-visible">
				<Button
					size="icon"
					variant="outline"
					class="pointer-events-auto touch-manipulation transition-all duration-300 ease-in-out motion-reduce:transition-none"
					style="width: 4rem; transform-origin: right center"
					aria-label="Önceki"
					title="3 saniyeden fazla çaldıysa mevcut parçayı başa sar, aksi halde önceki parçaya geç"
					disabled={!currentTrack}
					onclick={handlePreviousTrack}
				>
					<ArrowLeftFromLine />
				</Button>
			</div>
		</div>

		<div class="flex items-center justify-center">
			<Button
				size="icon-lg"
				variant={sideControlsVisible ? "default" : "ghost"}
				class="pointer-events-auto touch-manipulation transition-all duration-300 ease-in-out motion-reduce:transition-none"
				aria-label={isPlaylistFinished ? "Başa sar" : currentTrack?.playing ? "Duraklat" : "Oynat"}
				disabled={!currentTrack}
				onclick={isPlaylistFinished ? restartAll : togglePlayback}
			>
				{#if isPlaylistFinished}
					<Undo2 />
				{:else if currentTrack?.playing}
					<Pause />
				{:else}
					<Play />
				{/if}
			</Button>
		</div>

		<div
			class="pointer-events-none w-full min-w-0 overflow-x-clip overflow-y-visible transition-opacity duration-300 ease-in-out motion-reduce:transition-none {!sideControlsVisible ? 'opacity-0' : 'opacity-100'}"
			aria-hidden={!sideControlsVisible}
			inert={!sideControlsVisible}
		>
			<div class="w-full min-w-0 overflow-x-clip overflow-y-visible">
				<Button
					size="icon"
					variant="outline"
					class="pointer-events-auto touch-manipulation transition-all duration-300 ease-in-out motion-reduce:transition-none"
					style="width: 4rem; transform-origin: left center"
					aria-label="Sonraki"
					disabled={!currentTrack}
					onclick={handleNextTrack}
				>
					<ArrowRightFromLine />
				</Button>
			</div>
		</div>
	</div>

	<div
		class="pointer-events-none flex items-center gap-1 justify-self-center transition-opacity duration-500 ease-out motion-reduce:transition-none sm:justify-self-end {!sideControlsVisible ? 'opacity-0' : 'opacity-100'}"
		inert={!sideControlsVisible}
	>


		<Button
			size="sm"
			variant="outline"
			class="pointer-events-auto touch-manipulation transition-all duration-300 ease-in-out motion-reduce:transition-none"
			aria-label={isFullscreen ? "Tam ekrandan çık" : "Tam ekran"}
			aria-pressed={isFullscreen}
			onclick={toggleFullscreen}
		>
			{#if isFullscreen}
				<Shrink data-icon="inline-start" />
			{:else}
				<Expand data-icon="inline-start" />
			{/if}
			Tam Ekran
		</Button>
	</div>
</footer>
