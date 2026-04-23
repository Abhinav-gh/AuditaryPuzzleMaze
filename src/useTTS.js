// useTTS.js — Text-to-Speech hook using Web Speech API (no external deps)
import { useCallback, useRef } from 'react';

export function useTTS() {
  const utteranceRef = useRef(null);

  const speak = useCallback((text, { rate = 1, pitch = 1, volume = 1, priority = false } = {}) => {
    if (!window.speechSynthesis) return;

    // If priority, cancel anything currently speaking
    if (priority) {
      window.speechSynthesis.cancel();
    } else if (window.speechSynthesis.speaking) {
      return; // don't queue up too many
    }

    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = rate;
    utter.pitch = pitch;
    utter.volume = volume;
    utteranceRef.current = utter;
    window.speechSynthesis.speak(utter);
  }, []);

  const cancel = useCallback(() => {
    window.speechSynthesis?.cancel();
  }, []);

  return { speak, cancel };
}
