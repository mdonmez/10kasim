<script lang="ts">
	import { onMount, tick } from "svelte";
	import { cubicInOut } from "svelte/easing";
	import { fade } from "svelte/transition";

	import { prefersReducedMotion } from "svelte/motion";
	import { asset } from "$app/paths";

	import { ArrowLeftFromLine, ArrowRightFromLine, Drum, Expand, IterationCw, Pause, Play, Shrink, SkipForward, Undo2 } from "@lucide/svelte";
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
	const AUDIO_SOURCE = {
		src: asset("onkasim.opus"),
		name: "10 Kasım",
		duration: MERGED_AUDIO_DURATION_SECONDS
	};
	const INTRO_VIDEO_SOURCE = import.meta.env.DEV
		? asset("0_saygiistiklal-full.mp4")
		: "https://mdonmez.github.io/10kasim/0_saygiistiklal-full.mp4";

	let isSeeking = $state(false);
	let globalPercent = $state(0);
	let isFullscreen = $state(false);

	let isIntroComplete = $state(false);
	let isIntroReady = $state(false);
	let hasIntroStarted = $state(false);
	let isIntroPlaying = $state(false);
	let isIntroLoading = $state(false);
	let introError = $state("");
	let introVideo = $state<HTMLVideoElement>();
	let introAudio = $state<HTMLAudioElement>();
	let audioReady: Promise<void> = Promise.resolve();
	let isCompletingIntro = $state(false);

	let hasSelectedSection = $state(false);
	let isPlaylistFinished = $state(false);
	let sideControlsVisible = $state(true);
	let sideControlsHideTimeout: number | undefined;
	let titleHeading = $state<HTMLHeadingElement>();
	let titleAnimation: Animation | null = null;

	onMount(() => {
		audioReady = audioStore.addTrackUrl(AUDIO_SOURCE.src, AUDIO_SOURCE.name, AUDIO_SOURCE.src, AUDIO_SOURCE.duration);
		setupIntroMedia();

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

	function setupIntroMedia(): void {
		if (!introVideo || !introAudio) return;

		if (!introVideo.src) introVideo.src = INTRO_VIDEO_SOURCE;
		if (!introAudio.src) introAudio.src = asset("0_saygiistiklal-intro.opus");
		isIntroReady = true;
	}

	function syncIntroAudioToVideo(): void {
		const video = introVideo;
		const audio = introAudio;
		if (!video || !audio || video.paused || audio.paused) return;

		if (Math.abs(video.currentTime - audio.currentTime) > 0.15) {
			audio.currentTime = video.currentTime;
		}
		audio.muted = false;
	}

	async function startIntro(): Promise<void> {
		if (!introVideo || !introAudio || !isIntroReady) return;

		hasIntroStarted = true;
		introError = "";
		isIntroLoading = true;
		introAudio.muted = true;

		try {
			await Promise.all([introVideo.play(), introAudio.play()]);
			scheduleSideControlsHide();
		} catch (error) {
			introVideo.pause();
			introAudio.pause();
			introAudio.muted = false;
			isIntroLoading = false;
			showSideControls();
			introError = "Video veya ses başlatılamadı. Tekrar deneyebilir veya atlayabilirsiniz.";
			console.error("[intro] Media playback failed:", error);
		}
	}

	function toggleIntroPlayback(): void {
		if (isIntroPlaying || isIntroLoading) {
			introVideo?.pause();
			introAudio?.pause();
			isIntroLoading = false;
			showSideControls();
			return;
		}

		void startIntro();
	}

	async function completeIntro(): Promise<void> {
		if (isCompletingIntro) return;
		isCompletingIntro = true;
		isIntroLoading = true;
		introVideo?.pause();
		introAudio?.pause();

		try {
			await audioReady;
			const track = audioStore.tracks.find((item) => item.id === AUDIO_SOURCE.src);
			if (!track) throw new Error("The presentation audio track is not ready.");

			audioStore.pause(track.id);
			audioStore.seekToStart(track.id);
			isIntroComplete = true;
			isIntroLoading = false;
		} catch (error) {
			isCompletingIntro = false;
			isIntroLoading = false;
			introError = "Sesli sunum başlatılamadı. Tekrar deneyebilir veya videoyu yeniden oynatabilirsiniz.";
			console.error("[intro] Could not start presentation audio:", error);
		}
	}

	function skipIntro(): void {
		void completeIntro();
	}

	async function replayIntro(): Promise<void> {
		const track = currentTrack;
		if (track) {
			audioStore.pause(track.id);
			audioStore.seekToStart(track.id);
		}

		introVideo?.pause();
		introAudio?.pause();
		isCompletingIntro = false;
		isPlaylistFinished = false;
		hasSelectedSection = false;
		globalPercent = 0;
		showTrackTitle();
		showSideControls();
		hasIntroStarted = false;
		isIntroPlaying = false;
		isIntroLoading = false;
		isIntroReady = false;
		introError = "";
		isIntroComplete = false;
		await tick();

		setupIntroMedia();
		if (introVideo) introVideo.currentTime = 0;
		if (introAudio) {
			introAudio.currentTime = 0;
			introAudio.muted = false;
		}
		showSideControls();
	}

	function restartIntroPlayback(): void {
		if (!introVideo || !introAudio) return;

		introVideo.pause();
		introAudio.pause();
		if (introVideo.readyState > 0) introVideo.currentTime = 0;
		if (introAudio.readyState > 0) introAudio.currentTime = 0;
		hasIntroStarted = false;
		isIntroPlaying = false;
		isIntroLoading = false;
		showSideControls();
	}

	function diagonalReveal(_node: Element, { duration }: { duration: number }) {
		return {
			duration,
			easing: cubicInOut,
			css: (t: number) => {
				const hidden = `${(1 - t) * 100}%`;
				return `clip-path: inset(0 ${hidden} ${hidden} 0)`;
			}
		};
	}

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

<audio
	bind:this={introAudio}
	preload="auto"
	aria-hidden="true"
	class="hidden"
	onplaying={() => {
		isIntroPlaying = true;
		isIntroLoading = false;
		syncIntroAudioToVideo();
		scheduleSideControlsHide();
	}}
	onwaiting={() => {
		isIntroLoading = true;
		showSideControls();
	}}
	onpause={() => {
		isIntroPlaying = false;
		if (!isCompletingIntro) {
			isIntroLoading = false;
			showSideControls();
		}
	}}
	onended={() => {
		void completeIntro();
	}}
	onerror={() => {
		isIntroPlaying = false;
		isIntroLoading = false;
		introVideo?.pause();
		if (introAudio) introAudio.muted = false;
		showSideControls();
		introError = "Ses açılamadı. Atlayarak sesli sunuma geçebilirsiniz.";
	}}
></audio>

{#if !isIntroComplete}
	<section
		class="fixed inset-0 z-50 h-dvh w-full overflow-hidden bg-black text-white"
		style="--page-gutter: clamp(1.25rem, 3vw, 3rem)"
		in:fade={{ duration: prefersReducedMotion.current ? 0 : 360 }}
		out:fade={{ duration: prefersReducedMotion.current ? 0 : 1800 }}
	>
		<video
			bind:this={introVideo}
			poster={asset("0_saygiistiklal-poster.jpg")}
			preload="metadata"
			playsinline
			aria-label="Dalgalanan Türk bayrağı video girişi"
			class="absolute inset-0 h-full w-full bg-black object-cover"
			onplaying={() => {
				isIntroPlaying = true;
				isIntroLoading = false;
				syncIntroAudioToVideo();
				scheduleSideControlsHide();
			}}
			onwaiting={() => {
				isIntroLoading = true;
				if (introAudio) introAudio.muted = true;
				showSideControls();
			}}
			onpause={() => {
				isIntroPlaying = false;
				if (!isCompletingIntro) isIntroLoading = false;
			}}
			onerror={() => {
				isIntroPlaying = false;
				isIntroLoading = false;
				introAudio?.pause();
				if (introAudio) introAudio.muted = false;
				showSideControls();
				introError = "Video yüklenemedi. Atlayarak sesli sunuma geçebilirsiniz.";
			}}
		></video>

		<div class="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/40"></div>
		<div class="pointer-events-none absolute inset-0">

			<footer
				class="absolute inset-x-0 bottom-[var(--page-gutter)] grid grid-cols-[1fr_auto_1fr] items-center px-[var(--page-gutter)]"
			>
				<div
					class="flex items-center gap-2 justify-self-start transition-opacity duration-500 ease-out motion-reduce:transition-none {!sideControlsVisible ? 'pointer-events-none opacity-0' : 'opacity-100'}"
					inert={!sideControlsVisible}
				>
					<Button
						size="icon"
						variant="ghost"
						class="pointer-events-auto touch-manipulation"
						aria-label="Videoyu başa sar"
						title="Başa sar"
						disabled={!isIntroReady || isCompletingIntro}
						onclick={restartIntroPlayback}
					>
						<IterationCw />
					</Button>
					<Button
						size="icon"
						variant="ghost"
						class="pointer-events-auto touch-manipulation"
						aria-label="Videoyu atla"
						disabled={isCompletingIntro}
						onclick={skipIntro}
					>
						<SkipForward />
					</Button>
				</div>
				<Button
					size="icon-lg"
					variant={sideControlsVisible ? "secondary" : "ghost"}
					class="pointer-events-auto touch-manipulation transition-all duration-500 ease-out motion-reduce:transition-none"
					aria-label={isIntroPlaying ? "Videoyu duraklat" : hasIntroStarted ? "Videoyu sürdür" : "Videoyu başlat"}
					disabled={!isIntroReady || isCompletingIntro}
					onclick={toggleIntroPlayback}
				>
					{#if isIntroPlaying}
						<Pause />
					{:else}
						<Play />
					{/if}
				</Button>
				<div
					class="justify-self-end transition-opacity duration-500 ease-out motion-reduce:transition-none {!sideControlsVisible ? 'pointer-events-none opacity-0' : 'opacity-100'}"
					inert={!sideControlsVisible}
				>
					<Button
						size="icon"
						variant="ghost"
						class="pointer-events-auto touch-manipulation"
						aria-label={isFullscreen ? "Tam ekrandan çık" : "Tam ekran"}
						aria-pressed={isFullscreen}
						onclick={toggleFullscreen}
					>
						{#if isFullscreen}
							<Shrink />
						{:else}
							<Expand />
						{/if}
					</Button>
				</div>
			</footer>

			{#if !isIntroReady || isIntroLoading}
				<p class="sr-only" role="status">
					{isIntroReady ? "Video yükleniyor" : "Video oynatıcı hazırlanıyor"}
				</p>
			{/if}
			{#if introError}
				<p
					class="pointer-events-auto absolute inset-x-4 bottom-20 mx-auto w-fit max-w-xl rounded-lg bg-black/75 px-4 py-2 text-center text-sm text-white"
					role="alert"
				>
					{introError}
				</p>
			{/if}
		</div>
	</section>
{:else}
<div
	class="flex min-h-screen flex-col p-[var(--page-gutter)]"
	style="--page-gutter: clamp(1.25rem, 3vw, 3rem); --display-size: clamp(3rem, 5.5vw, 7rem)"
	in:diagonalReveal={{ duration: prefersReducedMotion.current ? 0 : 1800 }}
	out:fade={{ duration: prefersReducedMotion.current ? 0 : 360 }}
>
	<header class="sticky top-[var(--page-gutter)] z-50 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
		<div class="flex h-28 w-full items-start justify-between">
			<img
				src={asset("hilal-yildiz.svg")}
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
			<img src={asset("newfoto.jpg")} alt="" class="h-full w-full object-contain" />
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

			<div class="relative mt-2 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
				<div
					class="relative flex items-center gap-1 transition-opacity duration-500 ease-out motion-reduce:transition-none sm:absolute sm:left-0 {!sideControlsVisible ? 'pointer-events-none opacity-0' : 'opacity-100'}"
					inert={!sideControlsVisible}
				>
					<Button size="sm" variant="outline" class="touch-manipulation" onclick={restartAll} disabled={!currentTrack}>
						<IterationCw data-icon="inline-start" />
						Sar
					</Button>
					<Button
						size="sm"
						variant="outline"
						class="touch-manipulation"
						onclick={handlePreviousTrack}
						disabled={!currentTrack}
						title="3 saniyeden fazla çaldıysa mevcut parçayı başa sar, aksi halde önceki parçaya geç"
					>
						<ArrowLeftFromLine data-icon="inline-start" />
						Önceki
					</Button>
					<Button
						size="sm"
						variant="outline"
						class="touch-manipulation"
						onclick={handleNextTrack}
						disabled={!currentTrack}
					>
						<ArrowRightFromLine data-icon="inline-start" />
						Sonraki
					</Button>
				</div>
				<div class="flex items-center justify-center">
					<Button
						size="icon-lg"
						variant={sideControlsVisible ? "secondary" : "ghost"}
						class="touch-manipulation transition-all duration-500 ease-out motion-reduce:transition-none"
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
					class="relative flex items-center gap-1 transition-opacity duration-500 ease-out motion-reduce:transition-none sm:absolute sm:right-0 {!sideControlsVisible ? 'pointer-events-none opacity-0' : 'opacity-100'}"
					inert={!sideControlsVisible}
				>
					<Button
						size="sm"
						variant="outline"
						class="touch-manipulation"
						aria-label="Saygı duruşu ve İstiklal Marşı'nı yeniden başlat"
						title="Saygı duruşu ve İstiklal Marşı'nı yeniden başlat"
						onclick={replayIntro}
					>
						<Drum data-icon="inline-start" />
						Marş
					</Button>
					<Button size="sm" variant="outline" class="touch-manipulation" onclick={toggleFullscreen}>
						{#if isFullscreen}
							<Shrink data-icon="inline-start" />
						{:else}
							<Expand data-icon="inline-start" />
						{/if}
						Tam Ekran
					</Button>
				</div>
			</div>
		</div>
	</main>
	</div>
{/if}
