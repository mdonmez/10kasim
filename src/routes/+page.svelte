<script lang="ts">
	import { onMount } from "svelte";
	import { cubicInOut } from "svelte/easing";
	import { fade } from "svelte/transition";
	import { asset } from "$app/paths";

	import { ArrowLeftFromLine, ArrowRightFromLine, ClefTreble, Expand, Feather, IterationCw, Pause, Play, Shrink, Undo2 } from "@lucide/svelte";
	import { Button } from "#lib/components/ui/button";
	import { ProSlider as Slider } from "#lib/components/ui/proslider";
	import { audioStore, type TrackState } from "#lib/audio.svelte.js";

	const PREVIOUS_TRACK_RESTART_THRESHOLD = 3;
	const WELCOME_HOLD_DURATION_SECONDS = 7;
	const SIDE_CONTROLS_HIDE_DELAY_MS = 5000;
	const INTRO_END_FADE_DURATION_MS = 750;
	const TITLE_FADE_DURATION_MS = 1000;
	const MERGED_AUDIO_DURATION_SECONDS = 943.248667;
	const FINAL_MESSAGE_START_SECONDS = MERGED_AUDIO_DURATION_SECONDS - WELCOME_HOLD_DURATION_SECONDS;
	const WELCOME_TITLE = "Sonsuzluk";
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
	const INTRO_VIDEO_SOURCE = mediaAsset("siirvideosu.webm");
	const PORTRAIT_FRAME_CLASS =
		"fixed left-1/2 top-1/2 h-[min(78vh,54rem)] aspect-[9/16] -translate-x-1/2 -translate-y-1/2";

	let isSeeking = $state(false);
	let globalPercent = $state(0);
	let isFullscreen = $state(false);

	let isIntroComplete = $state(false);
	let isIntroReady = $state(false);
	let hasIntroStarted = $state(false);
	let isIntroPlaying = $state(false);
	let isIntroCoverVisible = $state(true);
	let isIntroCoverAnimating = $state(false);
	let isIntroVideoVisible = $state(false);
	let isMainPortraitVisible = $state(false);
	let isIntroLoading = $state(false);
	let introError = $state("");
	let introVideo = $state<HTMLVideoElement>();
	let introFadeFrame: number | undefined;
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
		if (introVideo?.readyState && introVideo.readyState >= HTMLMediaElement.HAVE_METADATA) {
			isIntroReady = true;
		}

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
			stopIntroEndFade();
			titleAnimation?.cancel();
			document.removeEventListener("fullscreenchange", onFullscreenChange);
		};
	});


	function startIntro(): void {
		if (!introVideo || !isIntroReady || isIntroCoverAnimating) return;

		hasIntroStarted = true;
		introError = "";
		showSideControls();

		if (isIntroCoverVisible) {
			isIntroLoading = true;
			isIntroCoverAnimating = true;
			isIntroCoverVisible = false;
			return;
		}

		void playIntroVideo();
	}

	async function playIntroVideo(): Promise<void> {
		if (!introVideo || !isIntroReady || isIntroComplete || isCompletingIntro) return;

		isIntroCoverAnimating = false;
		isIntroLoading = true;

		try {
			await introVideo.play();
			if (isIntroComplete || isCompletingIntro) return;
			scheduleSideControlsHide();
		} catch (error) {
			if (isIntroComplete || isCompletingIntro) return;
			introVideo.pause();
			isIntroCoverAnimating = false;
			isIntroLoading = false;
			showSideControls();

			if (error instanceof Error && error.name === "AbortError") {
				if (!isIntroVideoVisible) {
					hasIntroStarted = false;
					isIntroCoverVisible = true;
				}
				return;
			}

			if (!isIntroVideoVisible) {
				hasIntroStarted = false;
				isIntroCoverVisible = true;
			}
			introError = "Video oynatılamadı. Tekrar deneyebilir veya anma bölümüne geçebilirsiniz.";
			console.error("[intro] Media playback failed:", error);
		}
	}

	function handleIntroCoverTransitionEnd(event: TransitionEvent): void {
		if (
			!isIntroCoverAnimating ||
			event.target !== event.currentTarget ||
			event.propertyName !== "opacity"
		) return;

		void playIntroVideo();
	}

	function toggleIntroPlayback(): void {
		if (isIntroCoverAnimating) return;

		if (isIntroPlaying || isIntroLoading) {
			introVideo?.pause();
			isIntroLoading = false;
			showSideControls();
			return;
		}

		startIntro();
	}

	function stopIntroEndFade(): void {
		if (introFadeFrame !== undefined) cancelAnimationFrame(introFadeFrame);
		introFadeFrame = undefined;
	}

	function syncIntroEndFade(): void {
		stopIntroEndFade();
		const video = introVideo;
		if (!video || video.paused || video.ended) return;

		const remainingMs = (video.duration - video.currentTime) * 1000;
		const progress = Number.isFinite(remainingMs)
			? Math.min(1, Math.max(0, 1 - remainingMs / INTRO_END_FADE_DURATION_MS))
			: 0;
		video.style.opacity = progress > 0 ? String(1 - progress) : "";
		video.volume = 1 - progress;
		introFadeFrame = requestAnimationFrame(syncIntroEndFade);
	}

	function resetIntroEndFade(): void {
		stopIntroEndFade();
		if (!introVideo) return;
		introVideo.style.opacity = "";
		introVideo.volume = 1;
	}

	async function completeIntro(): Promise<void> {
		if (isCompletingIntro || isIntroComplete) return;
		isCompletingIntro = true;
		isIntroLoading = true;
		isIntroCoverAnimating = false;
		introVideo?.pause();
		isIntroPlaying = false;
		showSideControls();

		try {
			await audioReady;
			const track = audioStore.tracks.find((item) => item.id === AUDIO_SOURCE.src);
			if (!track) throw new Error("The presentation audio track is not ready.");

			audioStore.pause(track.id);
			audioStore.seekToStart(track.id);
			isMainPortraitVisible = true;
			isIntroComplete = true;
			isIntroLoading = false;
			isCompletingIntro = false;
		} catch (error) {
			isCompletingIntro = false;
			isIntroLoading = false;
			if (!isIntroVideoVisible && !isIntroCoverVisible) isIntroCoverVisible = true;
			introError = "Sesli sunum başlatılamadı. Tekrar deneyebilir veya videoyu yeniden oynatabilirsiniz.";
			console.error("[intro] Could not start presentation audio:", error);
		}
	}

	function skipIntro(): void {
		void completeIntro();
	}

	function replayIntro(): void {
		const track = currentTrack;
		if (!track || isCompletingIntro) return;

		audioStore.pause(track.id);
		audioStore.seekToStart(track.id);
		introVideo?.pause();
		if (introVideo?.readyState) introVideo.currentTime = 0;
		resetIntroEndFade();

		hasSelectedSection = false;
		isPlaylistFinished = false;
		globalPercent = 0;
		isIntroComplete = false;
		isMainPortraitVisible = false;
		hasIntroStarted = false;
		isIntroPlaying = false;
		isIntroCoverVisible = true;
		isIntroCoverAnimating = false;
		isIntroVideoVisible = false;
		isIntroLoading = false;
		isIntroReady = false;
		introError = "";
		showTrackTitle();
		showSideControls();
	}

	function restartIntroPlayback(): void {
		if (!introVideo) return;

		introVideo.pause();
		if (introVideo.readyState > 0) introVideo.currentTime = 0;
		resetIntroEndFade();
		isMainPortraitVisible = false;
		hasIntroStarted = false;
		isIntroPlaying = false;
		isIntroCoverVisible = true;
		isIntroCoverAnimating = false;
		isIntroVideoVisible = false;
		isIntroLoading = false;
		introError = "";
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
		if (nextTitle === requestedTitle) return;

		requestedTitle = nextTitle;
		if (!element) {
			titleAnimation?.cancel();
			titleAnimation = null;
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


{#if !isIntroComplete}
	<section
		class="fixed inset-0 z-50 h-dvh w-full overflow-hidden bg-black text-white"
		style="--page-gutter: clamp(1.25rem, 3vw, 3rem)"
		in:fade={{ duration: 360 }}
		out:fade={{ duration: 1800 }}
	>
		<!-- The source clip has no caption file; avoid fabricating subtitles for the poem. -->
		<!-- svelte-ignore a11y_media_has_caption -->
		<video
			bind:this={introVideo}
			src={INTRO_VIDEO_SOURCE}
			preload="metadata"
			playsinline
			aria-label="10 Kasım şiir videosu"
			class="absolute inset-0 h-full w-full bg-black object-cover {isIntroVideoVisible ? 'opacity-100' : 'opacity-0'}"
			onloadedmetadata={() => {
				isIntroReady = true;
			}}
			onplaying={() => {
				if (isIntroComplete || isCompletingIntro) {
					introVideo?.pause();
					return;
				}
				isIntroPlaying = true;
				isIntroVideoVisible = true;
				isIntroLoading = false;
				syncIntroEndFade();
				scheduleSideControlsHide();
			}}
			onwaiting={() => {
				if (isIntroComplete || isCompletingIntro) return;
				isIntroLoading = true;
				showSideControls();
			}}
			onpause={() => {
				isIntroPlaying = false;
				stopIntroEndFade();
				if (!isCompletingIntro) isIntroLoading = false;
			}}
			onerror={() => {
				isIntroReady = false;
				hasIntroStarted = false;
				isIntroPlaying = false;
				isIntroCoverVisible = true;
				isIntroCoverAnimating = false;
				isIntroVideoVisible = false;
				isIntroLoading = false;
				showSideControls();
				introError = "Video yüklenemedi. Anma bölümüne geçebilirsiniz.";
			}}
			onended={() => {
				stopIntroEndFade();
				if (introVideo) {
					introVideo.style.opacity = "0";
					introVideo.volume = 0;
				}
				void completeIntro();
			}}
		></video>


		<div class="pointer-events-none absolute inset-0">


			{#if !isIntroReady || isIntroLoading}
				<p class="sr-only" role="status">
					{isIntroReady ? "Video yükleniyor" : "Video oynatıcı hazırlanıyor"}
				</p>
			{/if}

		</div>
	</section>
{:else}
<div
	class="relative z-[60] flex min-h-screen flex-col p-[var(--page-gutter)]"
	style="--page-gutter: clamp(1.25rem, 3vw, 3rem); --display-size: clamp(3rem, 5.5vw, 7rem)"
	in:diagonalReveal={{ duration: 1800 }}
	out:fade={{ duration: 360 }}
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


		<div class="relative z-10 w-full">
			<div class="mb-6 grid min-h-24 place-items-center px-2 text-center sm:min-h-28">
				<h2
					bind:this={titleHeading}
					class="w-full max-w-[100rem] leading-tight font-extrabold tracking-tight"
					style:font-size="var(--display-size)"
					aria-live="polite"
					aria-atomic="true"
					data-main-text-state={currentTitleState}
				>
					{#if displayedTitle === WELCOME_TITLE}
						<img
							src={staticAsset("infinity.svg")}
							alt={WELCOME_TITLE}
							class="mx-auto h-[0.9em] w-auto brightness-0 invert"
						/>
					{:else}
						{displayedTitle}
					{/if}
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
{/if}

<div
	aria-hidden="true"
	class="pointer-events-none fixed inset-0 z-[55] bg-black transition-opacity duration-[1500ms] ease-in-out {(isIntroComplete ? isMainPortraitVisible : isIntroCoverVisible) ? 'opacity-100' : 'opacity-0'}"
	ontransitionend={handleIntroCoverTransitionEnd}
>
	<div class="{PORTRAIT_FRAME_CLASS} overflow-hidden">
		<img src={staticAsset("newfoto.jpg")} alt="" class="h-full w-full object-contain" />
		<div
			class="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-b from-transparent via-black/60 to-black transition-opacity duration-300 ease-in-out {isIntroComplete ? 'opacity-100' : 'opacity-0'}"
		></div>
	</div>
</div>
{#if !isIntroComplete && introError}
	<p
		class="pointer-events-none fixed inset-x-4 bottom-20 z-[70] mx-auto w-fit max-w-xl rounded-lg bg-black/75 px-4 py-2 text-center text-sm text-white"
		role="alert"
	>
		{introError}
	</p>
{/if}

<footer
	class="pointer-events-none fixed inset-x-0 bottom-[var(--page-gutter)] z-[60] mx-auto flex w-full max-w-[112rem] flex-col items-center gap-3 px-[var(--page-gutter)] sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-0"
	style="--page-gutter: clamp(1.25rem, 3vw, 3rem)"
>
	<div
		class="pointer-events-none flex items-center gap-1 justify-self-center transition-opacity duration-500 ease-out sm:justify-self-start {!sideControlsVisible ? 'opacity-0' : 'opacity-100'}"
		inert={!sideControlsVisible}
	>
		<Button
			size="sm"
			variant={isIntroComplete ? "outline" : "ghost"}
			class="pointer-events-auto touch-manipulation transition-all duration-300 ease-in-out"
			aria-label={isIntroComplete ? "Sar" : "Videoyu başa sar"}
			title={isIntroComplete ? "Sar" : "Videoyu başa sar"}
			disabled={isIntroComplete ? !currentTrack : !isIntroReady || isCompletingIntro}
			onclick={isIntroComplete ? restartAll : restartIntroPlayback}
		>
			<IterationCw data-icon="inline-start" />
			Sar
		</Button>
		<div class="grid w-[4.375rem]">
			{#if !isIntroComplete}
				<div class="col-start-1 row-start-1" transition:fade={{ duration: 280 }}>
					<Button
						size="sm"
						variant="ghost"
						class="pointer-events-auto touch-manipulation transition-all duration-300 ease-in-out"
						aria-label="Anma bölümüne geç"
						title="Anma bölümüne geç"
						disabled={isCompletingIntro}
						onclick={skipIntro}
					>
						<ClefTreble data-icon="inline-start" />
						Anma
					</Button>
				</div>
			{:else}
				<div class="col-start-1 row-start-1" transition:fade={{ duration: 280 }}>
					<Button
						size="sm"
						variant="outline"
						class="pointer-events-auto touch-manipulation transition-all duration-300 ease-in-out"
						aria-label="Şiir bölümüne dön"
						title="Şiir bölümüne dön"
						disabled={!currentTrack || isCompletingIntro}
						onclick={replayIntro}
					>
						<Feather data-icon="inline-start" />
						Şiir
					</Button>
				</div>
			{/if}
		</div>
	</div>


	<div class="pointer-events-none grid w-64 max-w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:w-64">
		<div
			class="pointer-events-none w-full min-w-0 overflow-x-clip overflow-y-visible transition-opacity duration-300 ease-in-out {!sideControlsVisible ? 'opacity-0' : 'opacity-100'}"
			aria-hidden={!isIntroComplete || !sideControlsVisible}
			inert={!isIntroComplete || !sideControlsVisible}
		>
			<div class="flex w-full min-w-0 justify-end overflow-x-clip overflow-y-visible">
				<Button
					size="icon"
					variant="outline"
					class="pointer-events-auto touch-manipulation transition-all duration-300 ease-in-out"
					style="width: 4rem; transform-origin: right center; transform: scaleX({isIntroComplete ? 1 : 0})"
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
				class="pointer-events-auto touch-manipulation transition-all duration-300 ease-in-out"
				aria-label={isIntroComplete
					? isPlaylistFinished ? "Başa sar" : currentTrack?.playing ? "Duraklat" : "Oynat"
					: isIntroCoverAnimating || (isIntroLoading && hasIntroStarted)
						? "Geçiş yapılıyor"
						: isIntroPlaying ? "Videoyu duraklat" : hasIntroStarted ? "Videoyu sürdür" : "Videoyu başlat"}
				disabled={isIntroComplete ? !currentTrack : !isIntroReady || isCompletingIntro || isIntroCoverAnimating}
				onclick={isIntroComplete ? isPlaylistFinished ? restartAll : togglePlayback : toggleIntroPlayback}
			>
				{#if isIntroComplete}
					{#if isPlaylistFinished}
						<Undo2 />
					{:else if currentTrack?.playing}
						<Pause />
					{:else}
						<Play />
					{/if}
				{:else if isIntroPlaying || (isIntroLoading && hasIntroStarted)}
					<Pause />
				{:else}
					<Play />
				{/if}
			</Button>
		</div>

		<div
			class="pointer-events-none w-full min-w-0 overflow-x-clip overflow-y-visible transition-opacity duration-300 ease-in-out {!sideControlsVisible ? 'opacity-0' : 'opacity-100'}"
			aria-hidden={!isIntroComplete || !sideControlsVisible}
			inert={!isIntroComplete || !sideControlsVisible}
		>
			<div class="w-full min-w-0 overflow-x-clip overflow-y-visible">
				<Button
					size="icon"
					variant="outline"
					class="pointer-events-auto touch-manipulation transition-all duration-300 ease-in-out"
					style="width: 4rem; transform-origin: left center; transform: scaleX({isIntroComplete ? 1 : 0})"
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
		class="pointer-events-none flex items-center gap-1 justify-self-center transition-opacity duration-500 ease-out sm:justify-self-end {!sideControlsVisible ? 'opacity-0' : 'opacity-100'}"
		inert={!sideControlsVisible}
	>


		<Button
			size="sm"
			variant={isIntroComplete ? "outline" : "ghost"}
			class="pointer-events-auto touch-manipulation transition-all duration-300 ease-in-out"
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
