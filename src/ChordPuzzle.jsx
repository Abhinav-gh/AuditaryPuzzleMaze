// ChordPuzzle.jsx v3
// Changes: removed lives system — wrong combo just gives feedback, no limit.
// onRestart prop + Restart button added.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PIANO_KEYS, CHORDS } from './AudioManager';

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

export function ChordPuzzle({ audioManager, onSolve, onSkip, onRestart }) {
  const [target] = useState(() => CHORDS[Math.floor(Math.random() * CHORDS.length)]);
  const [heldKeys, setHeldKeys] = useState(new Set());
  const [status, setStatus]     = useState('playing'); // playing | correct | wrong
  const [lastAttempt, setLastAttempt] = useState(null); // Set of keys from last attempt
  const heldRef      = useRef(new Set());
  const checkTimerRef = useRef(null);
  const statusRef    = useRef('playing');
  const replayLockRef = useRef(false);

  useEffect(() => { statusRef.current = status; }, [status]);

  const replayTarget = useCallback(() => {
    if (replayLockRef.current) return;
    replayLockRef.current = true;
    window.speechSynthesis?.cancel();
    audioManager?.playChord(target.freqs, 1.4);
    setTimeout(() => {
      replayLockRef.current = false;
    }, 1500);
  }, [target, audioManager]);

  useEffect(() => {
    audioManager?.playPuzzleFound();
    const intro = `Chord puzzle! Listen to the target chord now. Your keyboard keys A through K are piano keys — C, D, E, F, G, A, B, and high C. Hold 3 keys together to play a chord. Match the target chord to solve. There are no wrong-answer limits — keep trying! Press R to replay. Press Escape to skip.`;
    const utter = new SpeechSynthesisUtterance(intro);
    utter.rate = 0.9;
    window.speechSynthesis?.speak(utter);
    setTimeout(() => audioManager?.playChord(target.freqs, 1.5), 4500);
  }, []);

  const checkChord = useCallback(() => {
    if (statusRef.current !== 'playing') return;
    const held = heldRef.current;
    if (held.size !== 3) return;

    setLastAttempt(new Set(held));

    if (setsEqual(held, target.keys)) {
      setStatus('correct');
      audioManager?.playCorrect();
      audioManager?.stopAllNotes();
      const utter = new SpeechSynthesisUtterance(`Correct! That's ${target.name}! Puzzle solved!`);
      window.speechSynthesis?.speak(utter);
      setTimeout(() => onSolve(), 1800);
    } else {
      setStatus('wrong');
      audioManager?.playWrong();
      const held3 = [...held].map(k => PIANO_KEYS[k]?.note).join('+');
      const utter = new SpeechSynthesisUtterance(`Wrong combination: ${held3}. Keep exploring — no limit on attempts!`);
      window.speechSynthesis?.speak(utter);
      setTimeout(() => setStatus('playing'), 1300);
    }
  }, [target, audioManager, onSolve]);

  useEffect(() => {
    const onDown = (e) => {
      if (e.key === 'r' || e.key === 'R') { replayTarget(); return; }
      if (e.key === 'Escape') { audioManager?.stopAllNotes(); onSkip(); return; }
      if (e.code === 'Space') {
        e.preventDefault();
        if (window.speechSynthesis.speaking) { window.speechSynthesis.cancel(); }
        return;
      }
      if (statusRef.current === 'correct') return;

      const key = e.key.toLowerCase();
      if (!PIANO_KEYS[key] || heldRef.current.has(key)) return;
      e.preventDefault();

      heldRef.current.add(key);
      setHeldKeys(new Set(heldRef.current));
      audioManager?.playNoteStart(key, PIANO_KEYS[key].freq);

      if (heldRef.current.size === 3) {
        clearTimeout(checkTimerRef.current);
        checkTimerRef.current = setTimeout(checkChord, 350);
      } else {
        clearTimeout(checkTimerRef.current);
      }
    };

    const onUp = (e) => {
      const key = e.key.toLowerCase();
      if (!PIANO_KEYS[key]) return;
      heldRef.current.delete(key);
      setHeldKeys(new Set(heldRef.current));
      audioManager?.playNoteStop(key);
      clearTimeout(checkTimerRef.current);
    };

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      clearTimeout(checkTimerRef.current);
      audioManager?.stopAllNotes();
    };
  }, [checkChord, replayTarget, onSkip, audioManager]);

  return (
    <div className="wordle-overlay" role="dialog" aria-modal="true" aria-label="Chord Puzzle">
      <div className="wordle-panel chord-panel">
        <div className="wordle-header">
          <h2>🎹 Chord Puzzle</h2>
          <p className="wordle-subtitle">Hold 3 piano keys together to match the target chord</p>
        </div>

        <button className="chord-replay-btn" onClick={replayTarget}>
          🔊 Play Target Chord <span className="key-hint">R</span>
        </button>

        {/* Status */}
        <div className="chord-status-area">
          {status === 'correct' && <p className="chord-feedback correct-fb">✅ {target.name} — Correct!</p>}
          {status === 'wrong'   && <p className="chord-feedback wrong-fb">❌ Wrong combo — try again, no limits!</p>}
          {status === 'playing' && heldKeys.size > 0 && (
            <p className="chord-feedback neutral-fb">
              Holding: {[...heldKeys].map(k => PIANO_KEYS[k]?.note).join(' + ')}
              {heldKeys.size === 3 ? ' — checking…' : ` (need ${3 - heldKeys.size} more)`}
            </p>
          )}
          {status === 'playing' && heldKeys.size === 0 && (
            <p className="chord-help">Hold any 3 keys to play and test a chord.</p>
          )}
        </div>

        {/* Piano keyboard */}
        <div className="piano-keyboard" aria-label="Piano keyboard A through K">
          {Object.entries(PIANO_KEYS).map(([key, { note }]) => {
            const isHeld   = heldKeys.has(key);
            const isTarget = status === 'correct' ? target.keys.has(key) : false;
            return (
              <div
                key={key}
                className={`piano-key ${isHeld ? 'piano-key-held' : ''} ${isTarget ? 'piano-key-target' : ''}`}
                onMouseDown={() => {
                  if (statusRef.current === 'correct') return;
                  heldRef.current.add(key);
                  setHeldKeys(new Set(heldRef.current));
                  audioManager?.playNoteStart(key, PIANO_KEYS[key].freq);
                  if (heldRef.current.size === 3) {
                    clearTimeout(checkTimerRef.current);
                    checkTimerRef.current = setTimeout(checkChord, 350);
                  }
                }}
                onMouseUp={() => {
                  heldRef.current.delete(key);
                  setHeldKeys(new Set(heldRef.current));
                  audioManager?.playNoteStop(key);
                  clearTimeout(checkTimerRef.current);
                }}
                onMouseLeave={() => {
                  if (heldRef.current.has(key)) {
                    heldRef.current.delete(key);
                    setHeldKeys(new Set(heldRef.current));
                    audioManager?.playNoteStop(key);
                    clearTimeout(checkTimerRef.current);
                  }
                }}
                aria-label={`Key ${key.toUpperCase()}: ${note}`}
              >
                <span className="piano-note">{note}</span>
                <span className="piano-key-label">{key.toUpperCase()}</span>
              </div>
            );
          })}
        </div>

        <p className="chord-instructions">
          Hold multiple keys simultaneously. Exactly 3 keys = checks the chord automatically. No attempt limit!
        </p>

        <div className="puzzle-shortcuts">
          <span><kbd>A–K</kbd> Piano keys</span>
          <span><kbd>R</kbd> Replay</span>
          <span><kbd>Space</kbd> Silence narrator</span>
          <span><kbd>Esc</kbd> Skip</span>
        </div>

        <div className="wordle-footer puzzle-footer-row">
          <button className="restart-btn" onClick={onRestart}>🔄 Restart</button>
          <button className="skip-btn flex1" onClick={() => { audioManager?.stopAllNotes(); onSkip(); }}>
            Skip (move back)
          </button>
        </div>
      </div>
    </div>
  );
}
