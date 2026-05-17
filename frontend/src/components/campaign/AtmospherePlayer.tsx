/**
 * AtmospherePlayer
 * Per SOW Section 18.3: Ambient Audio
 *
 * Invisible component — manages a hidden HTML5 <audio> element for ambient music.
 * Mounts once at the CampaignPage level so audio persists regardless of panel open state.
 *
 * Responsibilities:
 * - Listen for atmosphere.audio.updated WebSocket events and update CampaignContext
 * - Listen for atmosphere.effect.updated WebSocket events and update CampaignContext
 * - Watch activeAtmosphereAudio context state and drive the Audio element (crossfade)
 * - Handle browser autoplay restrictions via one-time click unlock
 */

import { useEffect, useRef, useCallback } from 'react';
import { useCampaign } from '@/contexts/CampaignContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import type { AtmosphereAudioUpdatedBroadcast, AtmosphereEffectUpdatedBroadcast } from '@/types';

const FADE_DURATION_MS = 1500; // 1.5-second crossfade

// Smoothly interpolate audio.volume from current to target over FADE_DURATION_MS.
// Calls onDone when complete (or immediately if already at target).
function fadeTo(
  audio: HTMLAudioElement,
  targetVolume: number,
  onDone: () => void,
  signal?: { cancelled: boolean },
): void {
  const start = audio.volume;
  const delta = targetVolume - start;

  if (Math.abs(delta) < 0.001) {
    audio.volume = targetVolume;
    onDone();
    return;
  }

  const startTime = performance.now();

  function step(now: number) {
    if (signal?.cancelled) return;
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / FADE_DURATION_MS, 1);
    // Ease-in-out for a more natural feel
    const eased = progress < 0.5
      ? 2 * progress * progress
      : -1 + (4 - 2 * progress) * progress;
    audio.volume = Math.max(0, Math.min(1, start + delta * eased));
    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      audio.volume = targetVolume;
      onDone();
    }
  }

  requestAnimationFrame(step);
}

export default function AtmospherePlayer() {
  const { activeAtmosphereAudio, updateAtmosphereAudio, updateAtmosphereEffect } = useCampaign();
  const { socket } = useWebSocket();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Used to cancel any in-progress fade when a new command arrives
  const fadeSignalRef = useRef<{ cancelled: boolean }>({ cancelled: false });

  // ============================================
  // Initialize audio element once
  // ============================================

  useEffect(() => {
    const audio = new Audio();
    audio.loop = true;
    audio.volume = 0;
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.src = '';
    };
  }, []);

  // ============================================
  // Autoplay unlock helper
  // ============================================

  const tryPlay = useCallback((audio: HTMLAudioElement) => {
    const promise = audio.play();
    if (promise !== undefined) {
      promise.catch(() => {
        // Autoplay blocked — attach a one-time click listener to unlock
        const unlock = () => {
          audio.play().catch(() => {});
        };
        document.addEventListener('click', unlock, { once: true });
      });
    }
  }, []);

  // ============================================
  // WebSocket: atmosphere.audio.updated
  // ============================================

  useEffect(() => {
    if (!socket) return;

    const handleAudioUpdated = (data: AtmosphereAudioUpdatedBroadcast) => {
      if (data.assetId && data.audioUrl) {
        updateAtmosphereAudio({
          assetId: data.assetId,
          audioUrl: data.audioUrl,
          volume: data.volume,
          loop: data.loop,
        });
      } else {
        updateAtmosphereAudio(null);
      }
    };

    socket.onAtmosphereAudioUpdated(handleAudioUpdated);
    return () => socket.off('atmosphere.audio.updated', handleAudioUpdated);
  }, [socket, updateAtmosphereAudio]);

  // ============================================
  // WebSocket: atmosphere.effect.updated
  // ============================================

  useEffect(() => {
    if (!socket) return;

    const handleEffectUpdated = (data: AtmosphereEffectUpdatedBroadcast) => {
      updateAtmosphereEffect(data.effect);
    };

    socket.onAtmosphereEffectUpdated(handleEffectUpdated);
    return () => socket.off('atmosphere.effect.updated', handleEffectUpdated);
  }, [socket, updateAtmosphereEffect]);

  // ============================================
  // Drive the Audio element from context state
  // ============================================

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Cancel any in-progress fade
    fadeSignalRef.current.cancelled = true;
    const signal = { cancelled: false };
    fadeSignalRef.current = signal;

    if (!activeAtmosphereAudio) {
      // Stop — fade out then clear src
      fadeTo(audio, 0, () => {
        if (signal.cancelled) return;
        audio.pause();
        audio.src = '';
      }, signal);
      return;
    }

    const { audioUrl, volume, loop } = activeAtmosphereAudio;
    audio.loop = loop;

    // Normalize URL for comparison (relative path vs window.origin + path)
    const normalizedNew = audioUrl.startsWith('http')
      ? audioUrl
      : window.location.origin + audioUrl;

    if (audio.src === normalizedNew) {
      // Same track — just update volume
      fadeTo(audio, volume, () => {}, signal);
    } else {
      // New track — fade out current, swap, fade in
      fadeTo(audio, 0, () => {
        if (signal.cancelled) return;
        audio.pause();
        audio.src = audioUrl;
        audio.load();
        audio.volume = 0;
        tryPlay(audio);
        fadeTo(audio, volume, () => {}, signal);
      }, signal);
    }
  }, [activeAtmosphereAudio, tryPlay]);

  // Invisible — no DOM output
  return null;
}
