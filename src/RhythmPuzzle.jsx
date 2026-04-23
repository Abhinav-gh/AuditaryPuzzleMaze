// RhythmPuzzle.jsx
// Beat matching puzzle:
//  1. A random rhythm pattern of 4 beats plays (varying gaps = short/long)
//  2. Player sees a "Your Turn" prompt and taps SPACE to reproduce the rhythm
//  3. If all 4 taps match within ±250ms tolerance → solved!
//  4. 3 lives total. R = replay. Escape = skip + revert.

import React, { useState, useEffect, useRef, useCallback } from 'react';

const BPM = 80;
const BEAT_MS = (60 / BPM) * 1000; // ~750ms per beat

// Generate a 4-beat pattern. Each gap is 1 or 2 beats.
function generatePattern() {
  const gaps = [1, 1, 2, 1, 2, 2, 1, 2];
  const pattern = [];
  let t = 0;
  for (let i = 0; i < 4; i++) {
    pattern.push(t);
    t += gaps[Math.floor(Math.random() * gaps.length)] * BEAT_MS;
  }
  return pattern; // ms offsets from start: e.g. [0, 750, 1500, 2250]
}

// Normalize a tapping sequence to start at 0
function normalize(arr) {
  if (arr.length === 0) return [];
  const base = arr[0];
  return arr.map(t => t - base);
}

const TOLERANCE_MS = 260;

function matchesPattern(pattern, taps) {
  if (taps.length !== pattern.length) return false;
  const normPattern = normalize(pattern);
  const normTaps = normalize(taps);
  return normPattern.every((t, i) => Math.abs(t - normTaps[i]) <= TOLERANCE_MS);
}

const PHASE = { INTRO: 'intro', PLAYBACK: 'playback', WAIT: 'wait', RECORDING: 'recording', RESULT: 'result' };

export function RhythmPuzzle({ audioManager, onSolve, onSkip }) {
  const [pattern] = useState(() => generatePattern());
  const [phase, setPhase] = useState(PHASE.INTRO);
  const [lives, setLives] = useState(3);
  const [taps, setTaps] = useState([]);
  const [result, setResult] = useState(null); // null | 'correct' | 'wrong'
  const [beatHighlight, setBeatHighlight] = useState(false);
  const [tapHighlight, setTapHighlight] = useState(false);
  const [countdown, setCountdown] = useState(null);

  const tapsRef = useRef([]);
  const phaseRef = useRef(PHASE.INTRO);
  const timersRef = useRef([]);

  const clearAll = () => timersRef.current.forEach(clearTimeout);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const startPlayback = useCallback(() => {
    clearAll(); timersRef.current = [];
    setPhase(PHASE.PLAYBACK);
    phaseRef.current = PHASE.PLAYBACK;
    tapsRef.current = [];
    setTaps([]);

    // Play each beat
    pattern.forEach((offset, i) => {
      const id = setTimeout(() => {
        audioManager?.playBeat(i === 0 ? 0.5 : 0.35);
        setBeatHighlight(true);
        setTimeout(() => setBeatHighlight(false), 120);
      }, offset);
      timersRef.current.push(id);
    });

    // After last beat, wait then prompt user
    const totalDuration = pattern[pattern.length - 1] + 800;
    const waitId = setTimeout(() => {
      setPhase(PHASE.WAIT);
      // Countdown 3,2,1...
      let c = 3;
      setCountdown(c);
      const cdInterval = setInterval(() => {
        c--;
        if (c <= 0) {
          clearInterval(cdInterval);
          setCountdown(null);
          setPhase(PHASE.RECORDING);
          phaseRef.current = PHASE.RECORDING;
          tapsRef.current = [];
          setTaps([]);
          // Speak
          const utter = new SpeechSynthesisUtterance('Your turn! Tap Space to match the rhythm.');
          utter.rate = 1.0;
          window.speechSynthesis?.speak(utter);
        } else {
          setCountdown(c);
          audioManager?.playMetronomeTick(false);
        }
      }, 700);
      timersRef.current.push(cdInterval);
    }, totalDuration);
    timersRef.current.push(waitId);
  }, [pattern, audioManager]);

  // Auto-start after intro
  useEffect(() => {
    audioManager?.playPuzzleFound();
    const intro = `Rhythm puzzle! Listen to the beat pattern carefully. Then reproduce it by tapping Space. You have 3 attempts. Press R to replay the pattern. Press Escape to skip.`;
    const utter = new SpeechSynthesisUtterance(intro);
    utter.rate = 0.9;
    window.speechSynthesis?.speak(utter);
    const id = setTimeout(() => startPlayback(), 3500);
    timersRef.current.push(id);
    return () => { clearAll(); };
  }, []);

  const submitTaps = useCallback(() => {
    const recorded = tapsRef.current;
    setPhase(PHASE.RESULT);
    phaseRef.current = PHASE.RESULT;

    if (matchesPattern(pattern, recorded)) {
      setResult('correct');
      audioManager?.playCorrect();
      const utter = new SpeechSynthesisUtterance('Spot on! Rhythm matched. Puzzle solved!');
      window.speechSynthesis?.speak(utter);
      setTimeout(() => onSolve(), 1800);
    } else {
      const newLives = lives - 1;
      setLives(newLives);
      audioManager?.playWrong();
      if (newLives <= 0) {
        setResult('failed');
        const utter = new SpeechSynthesisUtterance(`Wrong rhythm. No attempts left. Press Escape to skip or replay to try again.`);
        window.speechSynthesis?.speak(utter);
      } else {
        setResult('wrong');
        const utter = new SpeechSynthesisUtterance(`Wrong rhythm. ${newLives} ${newLives === 1 ? 'attempt' : 'attempts'} left. Listen again.`);
        window.speechSynthesis?.speak(utter);
        setTimeout(() => { setResult(null); startPlayback(); }, 2000);
      }
    }
  }, [pattern, lives, audioManager, onSolve, startPlayback]);

  // Keyboard handler
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') { clearAll(); onSkip(); return; }
      if (e.key === 'r' || e.key === 'R') {
        const utter = new SpeechSynthesisUtterance('Replaying rhythm pattern.');
        window.speechSynthesis?.speak(utter);
        setTimeout(() => startPlayback(), 1000);
        return;
      }
      if (e.code === 'Space' && phaseRef.current === PHASE.RECORDING) {
        e.preventDefault();
        const now = performance.now();
        tapsRef.current = [...tapsRef.current, now];
        setTaps([...tapsRef.current]);
        audioManager?.playBeat(0.4);
        setTapHighlight(true);
        setTimeout(() => setTapHighlight(false), 120);
        // Auto-submit after 4 taps or 2x last beat gap of silence
        if (tapsRef.current.length >= pattern.length) {
          setTimeout(() => submitTaps(), 400);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [submitTaps, startPlayback, onSkip, audioManager, pattern.length]);

  const hearts = Array.from({ length: 3 }, (_, i) => i < lives ? '❤️' : '🖤');

  const phaseLabel = {
    [PHASE.INTRO]:     'Get ready…',
    [PHASE.PLAYBACK]:  '🔊 Listen to the pattern',
    [PHASE.WAIT]:      countdown !== null ? `Get ready: ${countdown}` : 'Get ready…',
    [PHASE.RECORDING]: '🎯 Your turn — tap Space!',
    [PHASE.RESULT]:    result === 'correct' ? '🎉 Correct!' : result === 'wrong' ? '❌ Try again…' : result === 'failed' ? '💀 Out of attempts' : '',
  }[phase] ?? '';

  return (
    <div className="wordle-overlay" role="dialog" aria-modal="true" aria-label="Rhythm Puzzle">
      <div className="wordle-panel rhythm-panel">
        <div className="wordle-header">
          <h2>🥁 Rhythm Puzzle</h2>
          <p className="wordle-subtitle">Match the beat pattern by tapping Space</p>
          <div className="lives-row">{hearts.join(' ')}</div>
        </div>

        <p className="rhythm-phase-label" aria-live="polite">{phaseLabel}</p>

        {/* Beat visualizer */}
        <div className="rhythm-visualizer">
          {pattern.map((_, i) => (
            <div
              key={i}
              className={`rhythm-beat-dot ${
                phase === PHASE.PLAYBACK && beatHighlight ? 'beat-active' : ''
              }`}
            />
          ))}
        </div>

        {/* Tap visualizer */}
        <div className="rhythm-tap-area">
          {phase === PHASE.RECORDING ? (
            <button
              className={`rhythm-tap-btn ${tapHighlight ? 'tap-active' : ''}`}
              onMouseDown={() => {
                if (phaseRef.current !== PHASE.RECORDING) return;
                const now = performance.now();
                tapsRef.current = [...tapsRef.current, now];
                setTaps([...tapsRef.current]);
                audioManager?.playBeat(0.4);
                setTapHighlight(true);
                setTimeout(() => setTapHighlight(false), 120);
                if (tapsRef.current.length >= pattern.length) setTimeout(() => submitTaps(), 400);
              }}
              aria-label="Tap to match rhythm (or press Space)"
            >
              TAP
            </button>
          ) : (
            <div className="rhythm-tap-placeholder">
              {phase === PHASE.RESULT && result === 'correct' && <span className="correct-fb">🎉 Perfect match!</span>}
              {phase === PHASE.RESULT && result === 'wrong'   && <span className="wrong-fb">❌ Off rhythm</span>}
              {phase === PHASE.RESULT && result === 'failed'  && <span className="wrong-fb">💀 {pattern.length} beats needed</span>}
            </div>
          )}
        </div>

        <p className="rhythm-progress">
          {phase === PHASE.RECORDING ? `Taps: ${taps.length} / ${pattern.length}` : '\u00a0'}
        </p>

        <div className="puzzle-shortcuts">
          <span><kbd>Space</kbd> Tap</span>
          <span><kbd>R</kbd> Replay pattern</span>
          <span><kbd>Esc</kbd> Skip (move back)</span>
        </div>

        <div className="wordle-footer">
          <button className="skip-btn" onClick={() => { clearAll(); onSkip(); }}>
            Skip puzzle (you'll be moved back)
          </button>
        </div>
      </div>
    </div>
  );
}
