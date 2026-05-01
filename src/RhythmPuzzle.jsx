// RhythmPuzzle.jsx
// Beat matching puzzle:
//  1. A random rhythm pattern of 4 beats plays (varying gaps = short/long)
//  2. Player hears the pattern, then gets a separate turn prompt before recording
//  3. If all 4 taps match within ±250ms tolerance → solved!
//  4. No lives. R = replay pattern. I = repeat instructions. Escape = skip + revert.

import React, { useState, useEffect, useRef, useCallback } from "react";

const BPM = 80;
const BEAT_MS = (60 / BPM) * 1000; // ~750ms per beat

// Generate a 4-beat pattern.
const PATTERNS = [
  [0, BEAT_MS, BEAT_MS * 2, BEAT_MS * 3], // 4 steady beats
  [0, BEAT_MS * 0.5, BEAT_MS * 1.5, BEAT_MS * 2.5], // Quick start
  [0, BEAT_MS, BEAT_MS * 1.5, BEAT_MS * 2.5], // Syncopated
  [0, BEAT_MS * 1.5, BEAT_MS * 2.5, BEAT_MS * 3], // Delayed
];

function generatePattern() {
  return PATTERNS[Math.floor(Math.random() * PATTERNS.length)];
}

// Normalize a tapping sequence to start at 0
function normalize(arr) {
  if (arr.length === 0) return [];
  const base = arr[0];
  return arr.map((t) => t - base);
}

const TOLERANCE_MS = 400;

function matchesPattern(pattern, taps) {
  if (taps.length !== pattern.length) return false;
  const normPattern = normalize(pattern);
  const normTaps = normalize(taps);
  return normPattern.every((t, i) => Math.abs(t - normTaps[i]) <= TOLERANCE_MS);
}

const PHASE = {
  INTRO: "intro",
  PLAYBACK: "playback",
  WAIT: "wait",
  RECORDING: "recording",
  RESULT: "result",
};

export function RhythmPuzzle({ audioManager, onSolve, onSkip, onRestart }) {
  const [pattern, setPattern] = useState(() => generatePattern());
  const [phase, setPhase] = useState(PHASE.INTRO);
  const [taps, setTaps] = useState([]);
  const [result, setResult] = useState(null);
  const [beatHighlight, setBeatHighlight] = useState(false);
  const [tapHighlight, setTapHighlight] = useState(false);
  const [countdown, setCountdown] = useState(null);

  const tapsRef = useRef([]);
  const phaseRef = useRef(PHASE.INTRO);
  const timersRef = useRef([]);
  const narrationTokenRef = useRef(0);

  const clearAll = () => timersRef.current.forEach(clearTimeout);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const cancelNarration = useCallback(() => {
    narrationTokenRef.current += 1;
    window.speechSynthesis?.cancel();
  }, []);

  const speakAndThen = useCallback((text, onEnd) => {
    const token = ++narrationTokenRef.current;
    const synth = window.speechSynthesis;
    if (!synth) {
      onEnd?.();
      return;
    }

    synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 0.9;
    utter.onend = () => {
      if (narrationTokenRef.current === token) onEnd?.();
    };
    utter.onerror = utter.onend;
    synth.speak(utter);
  }, []);

  const resetRound = useCallback(() => {
    clearAll();
    cancelNarration();
    setCountdown(null);
    setBeatHighlight(false);
    setTapHighlight(false);
    setResult(null);
    tapsRef.current = [];
    setTaps([]);
  }, [cancelNarration]);

  const startPlayback = useCallback(() => {
    clearAll();
    timersRef.current = [];
    setPhase(PHASE.PLAYBACK);
    phaseRef.current = PHASE.PLAYBACK;
    tapsRef.current = [];
    setTaps([]);
    setCountdown(null);

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
      const countValues = [3, 2, 1];
      let index = 0;
      setCountdown(countValues[index]);
      const cdInterval = setInterval(() => {
        index += 1;
        if (index >= countValues.length) {
          clearInterval(cdInterval);
          setCountdown(null);
          setPhase(PHASE.RECORDING);
          phaseRef.current = PHASE.RECORDING;
          tapsRef.current = [];
          setTaps([]);
          speakAndThen("Your turn!");
        } else {
          setCountdown(countValues[index]);
        }
      }, 700);
      timersRef.current.push(cdInterval);
    }, totalDuration);
    timersRef.current.push(waitId);
  }, [pattern, audioManager, speakAndThen]);

  useEffect(() => {
    audioManager?.playPuzzleFound();
    const intro = `Rhythm puzzle! First listen to the beat pattern. Then wait for the turn prompt before tapping Space. No attempt limits, keep trying. Press R to replay the pattern. Press I to repeat instructions. Press Escape to skip.`;
    speakAndThen(intro, () => {
      const id = setTimeout(() => startPlayback(), 250);
      timersRef.current.push(id);
    });

    return () => {
      clearAll();
      cancelNarration();
    };
  }, [audioManager, startPlayback, speakAndThen, cancelNarration]);

  const submitTaps = useCallback(() => {
    const recorded = tapsRef.current;
    setPhase(PHASE.RESULT);
    phaseRef.current = PHASE.RESULT;

    if (matchesPattern(pattern, recorded)) {
      setResult("correct");
      audioManager?.playCorrect();
      window.speechSynthesis?.cancel();
      const utter = new SpeechSynthesisUtterance(
        "Spot on! Rhythm matched. Puzzle solved!",
      );
      utter.rate = 0.85;
      // Wait for narrator to finish before closing puzzle
      utter.onend = () => {
        onSolve();
      };
      window.speechSynthesis?.speak(utter);
    } else {
      audioManager?.playWrong();
      setResult("wrong");
      const utter = new SpeechSynthesisUtterance(
        "Wrong rhythm. Listen again carefully.",
      );
      window.speechSynthesis?.speak(utter);
      setTimeout(() => {
        setResult(null);
        startPlayback();
      }, 2000);
    }
  }, [pattern, audioManager, onSolve, startPlayback]);

  // Keyboard handler
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") {
        clearAll();
        if (phaseRef.current === PHASE.RESULT && result === "correct") {
          onSolve();
          return;
        }
        onSkip();
        return;
      }
      if (e.key === "r" || e.key === "R") {
        resetRound();
        speakAndThen("Replaying rhythm pattern. Listen carefully.", () => {
          const id = setTimeout(() => startPlayback(), 250);
          timersRef.current.push(id);
        });
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        // In RECORDING phase, Space ALWAYS records a tap (never silences narrator)
        if (phaseRef.current === PHASE.RECORDING) {
          const now = performance.now();
          tapsRef.current = [...tapsRef.current, now];
          setTaps([...tapsRef.current]);
          audioManager?.playBeat(0.4);
          setTapHighlight(true);
          setTimeout(() => setTapHighlight(false), 120);
          if (tapsRef.current.length >= pattern.length) {
            setTimeout(() => submitTaps(), 400);
          }
          return;
        }
        // In other phases, Space silences the narrator (do NOT count as tap)
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
          return;
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    submitTaps,
    startPlayback,
    onSkip,
    audioManager,
    pattern.length,
    resetRound,
    speakAndThen,
  ]);

  const phaseLabel =
    {
      [PHASE.INTRO]: "Get ready…",
      [PHASE.PLAYBACK]: "🔊 Listen to the pattern",
      [PHASE.WAIT]:
        countdown !== null ? `Get ready: ${countdown}` : "Get ready…",
      [PHASE.RECORDING]: "🎯 Your turn — tap Space!",
      [PHASE.RESULT]:
        result === "correct" ? "🎉 Correct!" : "❌ Off rhythm — replaying…",
    }[phase] ?? "";

  return (
    <div
      className="wordle-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Rhythm Puzzle"
    >
      <div className="wordle-panel rhythm-panel">
        <div className="wordle-header">
          <h2>🥁 Rhythm Puzzle</h2>
          <p className="wordle-subtitle">
            Match the beat pattern by tapping Space
          </p>
        </div>

        <p className="rhythm-phase-label" aria-live="polite">
          {phaseLabel}
        </p>

        {/* Beat visualizer */}
        <div className="rhythm-visualizer">
          {pattern.map((_, i) => (
            <div
              key={i}
              className={`rhythm-beat-dot ${
                phase === PHASE.PLAYBACK && beatHighlight ? "beat-active" : ""
              }`}
            />
          ))}
        </div>

        {/* Tap visualizer */}
        <div className="rhythm-tap-area">
          {phase === PHASE.RECORDING ? (
            <button
              className={`rhythm-tap-btn ${tapHighlight ? "tap-active" : ""}`}
              onMouseDown={() => {
                if (phaseRef.current !== PHASE.RECORDING) return;
                const now = performance.now();
                tapsRef.current = [...tapsRef.current, now];
                setTaps([...tapsRef.current]);
                audioManager?.playBeat(0.4);
                setTapHighlight(true);
                setTimeout(() => setTapHighlight(false), 120);
                if (tapsRef.current.length >= pattern.length)
                  setTimeout(() => submitTaps(), 400);
              }}
              aria-label="Tap to match rhythm (or press Space)"
            >
              TAP
            </button>
          ) : (
            <div className="rhythm-tap-placeholder">
              {phase === PHASE.RESULT && result === "correct" && (
                <span className="correct-fb">🎉 Perfect match!</span>
              )}
              {phase === PHASE.RESULT && result === "wrong" && (
                <span className="wrong-fb">❌ Off rhythm</span>
              )}
              {phase === PHASE.RESULT && result === "failed" && (
                <span className="wrong-fb">
                  💀 {pattern.length} beats needed
                </span>
              )}
            </div>
          )}
        </div>

        <p className="rhythm-progress">
          {phase === PHASE.RECORDING
            ? `Taps: ${taps.length} / ${pattern.length}`
            : "\u00a0"}
        </p>

        <div className="puzzle-shortcuts">
          <span>
            <kbd>Space</kbd> Tap / Silence narrator
          </span>
          <span>
            <kbd>R</kbd> Replay
          </span>
          <span>
            <kbd>I</kbd> Instructions
          </span>
          <span>
            <kbd>Esc</kbd> Skip
          </span>
        </div>

        <div className="wordle-footer puzzle-footer-row">
          <button
            className="restart-btn"
            onClick={() => {
              clearAll();
              onRestart();
            }}
          >
            🔄 Restart
          </button>
          <button
            className="skip-btn flex1"
            onClick={() => {
              clearAll();
              onSkip();
            }}
          >
            Skip (move back)
          </button>
        </div>
      </div>
    </div>
  );
}
