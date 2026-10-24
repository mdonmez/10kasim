import { browser } from "$app/env";

type HowlSoundId = number;

type HowlLike = {
	seek: {
		(soundId?: HowlSoundId): number | unknown;
		(position: number, soundId?: HowlSoundId): unknown;
	};
	mute: (muted: boolean, soundId?: HowlSoundId) => unknown;
	volume: (volume: number, soundId?: HowlSoundId) => unknown;
	loop: (loop: boolean, soundId?: HowlSoundId) => unknown;
	duration: () => number;
	play: (soundId?: HowlSoundId) => HowlSoundId | unknown;
	pause: (soundId?: HowlSoundId) => unknown;
	unload: () => unknown;
	once: (event: string, callback: () => void) => unknown;
};

export interface TrackState {
	id: string;
	name: string;
	playing: boolean;
	volume: number;
	muted: boolean;
	volumeBeforeMute: number;
	loop: boolean;
	currentTime: number;
	duration: number;
}

interface HowlRecord {
	howl: HowlLike;
	url: string;
	/** Howler sound instance ID returned by howl.play(). Null before first play or after a non-looping sound ends. */
	soundId: number | null;
	/** Seek requested while waiting for the next confirmed onplay event. */
	pendingSeek: number | null;
	/** True between play() call and onplay callback for the active sound instance. */
	awaitingPlayEvent: boolean;
	/** True when the source URL is a blob that must be revoked on removeTrack(). */
	isBlobUrl: boolean;
}

/**
 * Howler primes its HTML5 audio pool itself only inside its AudioContext
 * unlock handler (which is skipped when usingWebAudio=false), so we prime
 * it manually — with the same unlocked-node marker howler uses.
 */
const POOL_SIZE = 4;

class AudioStore {
	tracks = $state<TrackState[]>([]);
	masterVolume = $state(100);
	/** Optional callback fired when a non-looping track finishes. */
	onTrackEnd: ((id: string) => void) | null = null;
	masterMuted = $state(false);
	masterPlaying = $derived(this.tracks.some((t) => t.playing));
	playingTracksCount = $derived(this.tracks.filter((t) => t.playing).length);

	#masterVolumeBeforeMute = 100;
	#howlerPromise: Promise<{ Howl: new (options: Record<string, unknown>) => HowlLike }> | null =
		null;
	#howls = new Map<string, HowlRecord>();
	#rafId: number | null = null;

	async #getHowlCtor(): Promise<
		| ((new (options: Record<string, unknown>) => HowlLike) & {
				prototype: HowlLike;
		  })
		| null
	> {
		if (!browser) return null;
		this.#howlerPromise ??= import("howler").then(({ Howl, Howler }) => {
			// Play strictly via HTMLAudioElement (html5:true). Skipping the
			// AudioContext entirely avoids "AudioContext was not allowed to
			// start" autoplay-policy noise at page load; playback starts on the
			// first click without needing an audio unlock.
			Howler.usingWebAudio = false;

			// Howler only primes its HTML5 audio pool inside its AudioContext
			// unlock handler, which is skipped when usingWebAudio=false. Prime
			// it manually so the first Howl doesn't log "HTML5 Audio pool
			// exhausted" (its empty-pool fallback even plays an empty Audio,
			// which Chrome rejects with NotSupportedError on every cold start).
			const self = Howler as unknown as { _html5AudioPool: HTMLAudioElement[] };
			while (self._html5AudioPool.length < POOL_SIZE) {
				const node = new Audio();
				// Mark as unlocked so howler returns the node to the pool when released.
				(node as unknown as { _unlocked: boolean })._unlocked = true;
				self._html5AudioPool.push(node);
			}

			return { Howl } as unknown as { Howl: new (options: Record<string, unknown>) => HowlLike };
		});
		const { Howl } = await this.#howlerPromise;
		return Howl as (new (options: Record<string, unknown>) => HowlLike) & {
			prototype: HowlLike;
		};
	}

	// ─── Volume helpers ───────────────────────────────────────────────────────

	#effectiveVolume(track: TrackState): number {
		return track.muted || this.masterMuted ? 0 : (track.volume / 100) * (this.masterVolume / 100);
	}

	#clampSeek(track: TrackState, seconds: number): number {
		const max = track.duration > 0 ? track.duration : Number.POSITIVE_INFINITY;
		return Math.max(0, Math.min(seconds, max));
	}

	#applyPendingSeek(id: string): void {
		const track = this.tracks.find((t) => t.id === id);
		const rec = this.#howls.get(id);
		if (!track || !rec || rec.soundId === null) return;

		if (rec.pendingSeek !== null) {
			const clamped = this.#clampSeek(track, rec.pendingSeek);
			rec.howl.seek(clamped, rec.soundId);
			track.currentTime = clamped;
			rec.pendingSeek = null;
		}
	}

	/**
	 * Pushes the correct volume + mute state from TrackState/masterVolume into
	 * the underlying Howl (and its active sound instance if one exists).
	 */
	#applyVolume(id: string): void {
		const track = this.tracks.find((t) => t.id === id);
		const rec = this.#howls.get(id);
		if (!track || !rec) return;

		const vol = this.#effectiveVolume(track);
		const isMuted = track.muted || this.masterMuted;

		if (rec.soundId !== null) {
			rec.howl.mute(isMuted, rec.soundId);
			rec.howl.volume(vol, rec.soundId);
		} else {
			// No active instance yet – set the Howl-level default so the
			// next play() inherits the right volume.
			rec.howl.mute(isMuted);
			rec.howl.volume(vol);
		}
	}

	#applyVolumeAll(): void {
		for (const track of this.tracks) {
			this.#applyVolume(track.id);
		}
	}

	// ─── RAF tick (currentTime polling) ──────────────────────────────────────

	#startRaf(): void {
		if (this.#rafId !== null) return;

		const tick = () => {
			for (const track of this.tracks) {
				if (!track.playing) continue;
				const rec = this.#howls.get(track.id);
				if (!rec || rec.soundId === null) continue;
				if (rec.awaitingPlayEvent) continue;

				const pos = rec.howl.seek(rec.soundId);
				// seek() returns Howl | number depending on usage;
				// the single-number-ID form returns the position as a number.
				if (typeof pos === "number" && isFinite(pos)) {
					track.currentTime = pos;
				}
			}
			this.#rafId = requestAnimationFrame(tick);
		};

		this.#rafId = requestAnimationFrame(tick);
	}

	#stopRaf(): void {
		if (this.#rafId !== null) {
			cancelAnimationFrame(this.#rafId);
			this.#rafId = null;
		}
	}

	// ─── Track creation ───────────────────────────────────────────────────────

	async #addTrackSource({
		src,
		name,
		id = crypto.randomUUID(),
		isBlobUrl = false
	}: {
		src: string;
		name: string;
		id?: string;
		isBlobUrl?: boolean;
	}): Promise<void> {
		if (!browser) return;

		const Howl = await this.#getHowlCtor();
		if (!Howl) return;

		if (this.tracks.some((t) => t.id === id)) return;

		const state: TrackState = {
			id,
			name,
			playing: false,
			volume: 100,
			muted: false,
			volumeBeforeMute: 100,
			loop: false,
			currentTime: 0,
			duration: 0
		};

		const rec: HowlRecord = {
			// howl is assigned below – the forward-reference is safe because
			// Howler callbacks only fire asynchronously.
			howl: null as unknown as HowlLike,
			url: src,
			soundId: null,
			pendingSeek: null,
			awaitingPlayEvent: false,
			isBlobUrl
		};

		// Prime duration from metadata so UI can show length and allow scrubbing
		// before the first playback starts.
		const metadataProbe = new Audio(src);
		metadataProbe.preload = "metadata";
		metadataProbe.addEventListener(
			"loadedmetadata",
			() => {
				const track = this.tracks.find((t) => t.id === id);
				if (!track) return;
				if (isFinite(metadataProbe.duration) && metadataProbe.duration > 0) {
					track.duration = metadataProbe.duration;
				}
			},
			{ once: true }
		);

		const howl = new Howl({
			src: [src],
			// Web Audio (buffered) mode – our sources are small static files, not
			// arbitrary-size blobs, so buffering avoids the html5 audio pool and
			// its "pool exhausted" noise. Howler still auto-unlocks the context
			// after the first user gesture (autoplay policy).
			html5: false,
			volume: this.#effectiveVolume(state),
			loop: state.loop,
			preload: true,

			onload: () => {
				const track = this.tracks.find((t) => t.id === id);
				if (track) track.duration = howl.duration();
			},

			onplay: (soundId: number) => {
				const track = this.tracks.find((t) => t.id === id);
				const r = this.#howls.get(id);
				if (!track || !r) return;

				r.soundId = soundId;
				r.awaitingPlayEvent = false;
				track.playing = true;
				r.howl.loop(track.loop, soundId);
				this.#applyVolume(id);
				this.#applyPendingSeek(id);
			},

			onend: (soundId: number) => {
				const track = this.tracks.find((t) => t.id === id);
				const r = this.#howls.get(id);
				if (!track || !r) return;

				// Only reset if this is the sound instance we're tracking
				// and the track is not set to loop (Howler fires onend even
				// for looping sounds at each cycle in some builds).
				if (r.soundId === soundId && !track.loop) {
					track.playing = false;
					track.currentTime = 0;
					r.soundId = null;
					r.pendingSeek = 0;
					r.awaitingPlayEvent = false;
					this.onTrackEnd?.(id);
				}
			},

			onloaderror: (_soundId: number, error: unknown) => {
				console.error(`[audio] Load error – "${state.name}":`, error);
			},

			onplayerror: (soundId: number, error: unknown) => {
				const track = this.tracks.find((t) => t.id === id);
				const r = this.#howls.get(id);
				console.error(`[audio] Play error – "${state.name}":`, error);
				const shouldRetryAfterUnlock = !!track?.playing;

				// Mobile browsers block autoplay until a user gesture.
				// Howler fires this error; we wait for its internal unlock and retry.
				howl.once("unlock", () => {
					if (!shouldRetryAfterUnlock) return;
					const rr = this.#howls.get(id);
					const t = this.tracks.find((tt) => tt.id === id);
					if (!rr || !t || !t.playing) return;

					rr.awaitingPlayEvent = true;
					const retryId = howl.play();
					if (typeof retryId === "number") rr.soundId = retryId;
				});

				if (r && r.soundId === soundId) {
					r.soundId = null;
					r.awaitingPlayEvent = false;
				}
			}
		});

		rec.howl = howl;
		this.#howls.set(id, rec);
		this.tracks.push(state);
		this.#startRaf();
	}

	// ─── Public API ───────────────────────────────────────────────────────────

	async addTrack(file: File): Promise<void> {
		await this.#addTrackSource({
			src: URL.createObjectURL(file),
			name: file.name.replace(/\.[^/.]+$/, ""),
			isBlobUrl: true
		});
	}

	/** Adds a track from a fixed source URL (e.g. /static asset), with a stable optional id. */
	async addTrackUrl(src: string, name: string, id?: string): Promise<void> {
		await this.#addTrackSource({ src, name, id });
	}

	removeTrack(id: string): void {
		const rec = this.#howls.get(id);
		if (!rec) return;

		// unload() stops playback, destroys all sound instances and
		// frees Web Audio nodes / HTMLAudioElement resources.
		rec.howl.unload();
		if (rec.isBlobUrl) URL.revokeObjectURL(rec.url);
		this.#howls.delete(id);

		const idx = this.tracks.findIndex((t) => t.id === id);
		if (idx !== -1) this.tracks.splice(idx, 1);

		if (this.tracks.length === 0) this.#stopRaf();
	}

	clearAll(): void {
		for (const track of [...this.tracks]) {
			this.removeTrack(track.id);
		}
	}

	play(id: string): void {
		const track = this.tracks.find((t) => t.id === id);
		const rec = this.#howls.get(id);
		if (!track || !rec) return;

		// Capture the desired playback position before touching Howler.
		// This covers the case where the user seeked the progress slider
		// while the track was stopped / had ended (soundId === null).
		const targetTime = track.currentTime;

		let soundId = rec.soundId;
		rec.pendingSeek = targetTime;
		rec.awaitingPlayEvent = true;

		if (soundId !== null) {
			// Resume the existing (paused) sound instance.
			const resumedId = rec.howl.play(soundId);
			if (typeof resumedId === "number") {
				soundId = resumedId;
			}
		} else {
			// First play, or resuming after a non-looping sound ended.
			soundId = rec.howl.play() as number;
		}

		if (typeof soundId === "number") {
			rec.soundId = soundId;
		}

		track.playing = true;
	}

	pause(id: string): void {
		const track = this.tracks.find((t) => t.id === id);
		const rec = this.#howls.get(id);
		if (!track || !rec) return;

		if (rec.soundId !== null) {
			// pause() preserves the current seek position so play() can resume.
			rec.howl.pause(rec.soundId);
		}
		track.playing = false;
		rec.awaitingPlayEvent = false;
	}

	playAll(): void {
		for (const track of this.tracks) {
			this.play(track.id);
		}
	}

	pauseAll(): void {
		for (const track of this.tracks) {
			this.pause(track.id);
		}
	}

	rollAll(): void {
		for (const track of this.tracks) {
			this.seekToStart(track.id);
		}
	}

	seekToStart(id: string): void {
		this.seek(id, 0);
	}

	seekToEnd(id: string): void {
		const track = this.tracks.find((t) => t.id === id);
		if (!track) return;
		this.seek(id, track.duration);
	}

	seek(id: string, seconds: number): void {
		const track = this.tracks.find((t) => t.id === id);
		const rec = this.#howls.get(id);
		if (!track || !rec) return;

		const clamped = this.#clampSeek(track, seconds);

		if (rec.soundId !== null) {
			if (track.playing && rec.awaitingPlayEvent) {
				rec.pendingSeek = clamped;
			} else {
				// seek(position, soundId) – setter form.
				rec.howl.seek(clamped, rec.soundId);
				rec.pendingSeek = null;
			}
		} else {
			rec.pendingSeek = clamped;
		}
		// Always update state so play() can apply it if soundId was null.
		track.currentTime = clamped;
	}

	setVolume(id: string, val: number): void {
		const track = this.tracks.find((t) => t.id === id);
		if (!track) return;

		const clamped = Math.max(0, Math.min(100, val));
		const shouldUnmute = track.muted && clamped > 0;
		if (clamped === track.volume && !shouldUnmute) return;

		track.volume = clamped;
		// Unmute implicitly when the user drags the volume above zero.
		if (shouldUnmute) track.muted = false;
		this.#applyVolume(id);
	}

	toggleMute(id: string): void {
		const track = this.tracks.find((t) => t.id === id);
		if (!track) return;
		const defaultUnmuteVolume = 25;
		const wasButtonMuted = track.muted;
		const wasSliderMuted = !track.muted && track.volume === 0;

		if (wasButtonMuted) {
			track.muted = false;
			track.volume = track.volumeBeforeMute > 1 ? track.volumeBeforeMute : defaultUnmuteVolume;
			track.volumeBeforeMute = track.volume;
		} else if (wasSliderMuted) {
			track.muted = false;
			track.volume = defaultUnmuteVolume;
			track.volumeBeforeMute = track.volume;
		} else {
			track.volumeBeforeMute = track.volume;
			track.muted = true;
			track.volume = 0;
		}
		this.#applyVolume(id);
	}

	toggleLoop(id: string): void {
		const track = this.tracks.find((t) => t.id === id);
		const rec = this.#howls.get(id);
		if (!track || !rec) return;

		track.loop = !track.loop;

		if (rec.soundId !== null) {
			// Apply to the active sound instance.
			rec.howl.loop(track.loop, rec.soundId);
		}
		// If soundId is null, play() will call howl.loop() on the next play.
	}

	setMasterVolume(val: number): void {
		this.masterVolume = val;
		if (val > 0 && this.masterMuted) this.masterMuted = false;
		this.#applyVolumeAll();
	}

	toggleMasterMute(): void {
		const defaultUnmuteVolume = 25;
		const wasButtonMuted = this.masterMuted;
		const wasSliderMuted = !this.masterMuted && this.masterVolume === 0;

		if (wasButtonMuted) {
			this.masterMuted = false;
			this.masterVolume =
				this.#masterVolumeBeforeMute > 1 ? this.#masterVolumeBeforeMute : defaultUnmuteVolume;
			this.#masterVolumeBeforeMute = this.masterVolume;
		} else if (wasSliderMuted) {
			this.masterMuted = false;
			this.masterVolume = defaultUnmuteVolume;
			this.#masterVolumeBeforeMute = this.masterVolume;
		} else {
			this.#masterVolumeBeforeMute = this.masterVolume;
			this.masterMuted = true;
			this.masterVolume = 0;
		}
		this.#applyVolumeAll();
	}
}

export const audioStore = new AudioStore();
