// ChordPuzzle.jsx v2 — Piano key hold mechanic
// 
// HOW IT WORKS:
//   - Target chord plays automatically on entry
//   - 8 piano keys shown on screen: A S D F G H J K = C D E F G A B C5
//   - Physical keyboard keys play notes while HELD (like a real piano)
//   - Hold any combination — when exactly 3 keys match the target chord → SOLVED!
//   - Wrong 3-key combo held → life lost, try again
//   - R = replay target chord | Escape = skip + revert

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PIANO_KEYS, CHORDS } from './AudioManager';

const MAX_LIVES = 3;

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

export function ChordPuzzle({ audioManager, onSolve, onSkip }) {
  const [target] = useState(() => CHORDS[Math.floor(Math.random() * CHORDS.length)]);
  const [heldKeys, setHeldKeys] = useState(new Set());
  const [lives, setLives] = useState(MAX_LIVES);
  const [status, setStatus] = useState('playing'); // playing | correct | wrong | failed
  const [lastAttemptKeys, setLastAttemptKeys] = useState(null);
  const heldRef = useRef(new Set());
  const checkTimerRef = useRef(null);
  const statusRef = useRef('playing');

  useEffect(() => { statusRef.current = status; }, [status]);

  const replayTarget = useCallback(() => {
    window.speechSynthesis?.cancel();
    audioManager?.playChord(target.freqs, 1.4);
    const utter = new SpeechSynthesisUtterance(
      `Target chord replayed. The chord name is hidden — find it by ear!`
    );
    window.speechSynthesis?.speak(utter);
  }, [target, audioManager]);

  // Speak instructions + play target
  useEffect(() => {
    audioManager?.playPuzzleFound();
    const intro = `Chord puzzle! A chord will now play. Your keyboard keys A through K are piano keys. Hold 3 keys together that produce the same chord. Press R to replay the target chord. Press Escape to skip and be moved back.`;
    const utter = new SpeechSynthesisUtterance(intro);
    utter.rate = 0.9;
    window.speechSynthesis?.speak(utter);
    setTimeout(() => audioManager?.playChord(target.freqs, 1.4), 3800);
  }, []);

  const checkChord = useCallback(() => {
    if (statusRef.current !== 'playing') return;
    const held = heldRef.current;
    if (held.size !== 3) return;

    setLastAttemptKeys(new Set(held));

    if (setsEqual(held, target.keys)) {
      setStatus('correct');
      audioManager?.playCorrect();
      audioManager?.stopAllNotes();
      const utter = new SpeechSynthesisUtterance(`Correct! That's ${target.name}! Puzzle solved!`);
      window.speechSynthesis?.speak(utter);
      setTimeout(() => onSolve(), 1800);
    } else {
      setLives(prev => {
        const newLives = prev - 1;
        if (newLives <= 0) {
          setStatus('failed');
          audioManager?.playWrong();
          const utter = new SpeechSynthesisUtterance(
            `Wrong combination. Out of attempts! The chord was ${target.name}. Skip or keep your position.`
          );
          window.speechSynthesis?.speak(utter);
        } else {
          setStatus('wrong');
          audioManager?.playWrong();
          const utter = new SpeechSynthesisUtterance(
            `Wrong combination. ${newLives} ${newLives === 1 ? 'attempt' : 'attempts'} left. Press R to replay. Keep exploring the keys.`
          );
          window.speechSynthesis?.speak(utter);
          setTimeout(() => setStatus('playing'), 1200);
        }
        return newLives;
      });
    }
  }, [target, audioManager, onSolve]);

  useEffect(() => {
    const onDown = (e) => {
      if (e.key === 'r' || e.key === 'R') { replayTarget(); return; }
      if (e.key === 'Escape') { audioManager?.stopAllNotes(); onSkip(); return; }
      if (statusRef.current !== 'playing') return;

      const key = e.key.toLowerCase();
      if (!PIANO_KEYS[key] || heldRef.current.has(key)) return;
      e.preventDefault();

      heldRef.current.add(key);
      setHeldKeys(new Set(heldRef.current));
      audioManager?.playNoteStart(key, PIANO_KEYS[key].freq);

      // When exactly 3 held, start a short timer then check
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

  const hearts = Array.from({ length: MAX_LIVES }, (_, i) => i < lives ? '❤️' : '🖤');

  return (
    <div className="wordle-overlay" role="dialog" aria-modal="true" aria-label="Chord Puzzle">
      <div className="wordle-panel chord-panel">
        <div className="wordle-header">
          <h2>🎹 Chord Puzzle</h2>
          <p className="wordle-subtitle">Hold 3 piano keys to match the target chord</p>
          <div className="lives-row">{hearts.join(' ')}</div>
        </div>

        <button className="chord-replay-btn" onClick={replayTarget}>
          🔊 Play Target Chord <span className="key-hint">R</span>
        </button>

        {/* Status feedback */}
        <div className="chord-status-area">
          {status === 'correct' && <p className="chord-feedback correct-fb">✅ {target.name} — Correct!</p>}
          {status === 'wrong'   && <p className="chord-feedback wrong-fb">❌ Wrong combo — try again</p>}
          {status === 'failed'  && <p className="chord-feedback wrong-fb">💀 The chord was: {target.name}</p>}
          {status === 'playing' && heldKeys.size > 0 && (
            <p className="chord-feedback neutral-fb">
              Holding: {[...heldKeys].map(k => PIANO_KEYS[k]?.note).join(' + ')}
              {heldKeys.size === 3 ? ' — checking…' : ` (need ${3 - heldKeys.size} more)`}
            </p>
          )}
          {status === 'playing' && heldKeys.size === 0 && (
            <p className="chord-help">Press and hold keys on your keyboard to explore notes.</p>
          )}
        </div>

        {/* Piano keyboard visual */}
        <div className="piano-keyboard" aria-label="Piano keyboard A through K">
          {Object.entries(PIANO_KEYS).map(([key, { note, freq }]) => {
            const isHeld = heldKeys.has(key);
            const wasInAttempt = lastAttemptKeys?.has(key);
            const isTarget = status === 'failed' || status === 'correct' ? target.keys.has(key) : false;
            return (
              <div
                key={key}
                className={`piano-key
                  ${isHeld ? 'piano-key-held' : ''}
                  ${isTarget ? 'piano-key-target' : ''}
                `}
                onMouseDown={() => {
                  if (statusRef.current !== 'playing') return;
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
                aria-label={`Key ${key.toUpperCase()}: note ${note}`}
              >
                <span className="piano-note">{note}</span>
                <span className="piano-key-label">{key.toUpperCase()}</span>
              </div>
            );
          })}
        </div>

        <p className="chord-instructions">
          Hold multiple keys simultaneously. When you hold exactly the right 3 keys that make the chord, it auto-solves!
        </p>

        <div className="puzzle-shortcuts">
          <span><kbd>A–K</kbd> Piano keys</span>
          <span><kbd>R</kbd> Replay chord</span>
          <span><kbd>Esc</kbd> Skip (move back)</span>
        </div>

        <div className="wordle-footer">
          <button className="skip-btn" onClick={() => { audioManager?.stopAllNotes(); onSkip(); }}>
            Skip puzzle (you'll be moved back)
          </button>
        </div>
      </div>
    </div>
  );
}
