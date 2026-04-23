// SimonPuzzle.jsx v2
// Changes:
//  - EXPLORE phase first: user presses each arrow key to hear its sound, Space to start
//  - Input registered on keyup (not keydown) — holding a key = one press only
//  - e.repeat ignored on keydown so auto-repeat is blocked
//  - No lives system removed
//  - onRestart prop + Restart button

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SIMON_NOTES } from './AudioManager';

const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
const SEQ_LENGTH = 4;

function randomSequence() {
  return Array.from({ length: SEQ_LENGTH }, () => ARROWS[Math.floor(Math.random() * ARROWS.length)]);
}

const PHASE = {
  EXPLORE:  'explore',   // learn the sounds
  PLAYBACK: 'playback',  // watch the sequence
  INPUT:    'input',     // repeat the sequence
  RESULT:   'result',    // done
};

const ARROW_INFO = [
  { key: 'ArrowUp',    label: '↑', pos: 'top',    desc: 'High note (center)' },
  { key: 'ArrowLeft',  label: '←', pos: 'left',   desc: 'Low-mid (left)' },
  { key: 'ArrowDown',  label: '↓', pos: 'bottom', desc: 'Low note (center)' },
  { key: 'ArrowRight', label: '→', pos: 'right',  desc: 'High-mid (right)' },
];

export function SimonPuzzle({ audioManager, onSolve, onSkip, onRestart }) {
  const [sequence, setSequence] = useState(() => randomSequence());
  const [phase, setPhase]       = useState(PHASE.EXPLORE);
  const [userInput, setUserInput] = useState([]);
  const [activeKey, setActiveKey] = useState(null);
  const [highlightStep, setHighlightStep] = useState(-1);
  const [result, setResult] = useState(null); // 'correct' | 'wrong'
  const [exploredKeys, setExploredKeys] = useState(new Set()); // which keys user explored

  const phaseRef      = useRef(PHASE.EXPLORE);
  const seqRef        = useRef(sequence);
  const userInputRef  = useRef([]);
  const pressedRef    = useRef(new Set()); // prevent keyup fire without keydown
  const timersRef     = useRef([]);

  const clearAll = () => timersRef.current.forEach(t => typeof t === 'number' ? clearTimeout(t) : clearInterval(t));
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // ── Exploration — speak intro ─────────────────────────────────────────────
  useEffect(() => {
    audioManager?.playPuzzleFound();
    const utter = new SpeechSynthesisUtterance(
      `Simon Says puzzle! First, explore your arrow keys. Each one plays a different note. ` +
      `Up arrow plays a high note in the center. Down plays a low note. ` +
      `Left plays a note to the left. Right plays a note to the right. ` +
      `Press each arrow key to hear its sound. When you're ready, press Enter to start the challenge. ` +
      `Press I for instructions, Escape to skip.`
    );
    utter.rate = 0.88;
    window.speechSynthesis?.speak(utter);
    return () => clearAll();
  }, []);

  // ── Play back the puzzle sequence ──────────────────────────────────────────
  const playSequence = useCallback((seq) => {
    clearAll(); timersRef.current = [];
    setPhase(PHASE.PLAYBACK); phaseRef.current = PHASE.PLAYBACK;
    setUserInput([]); userInputRef.current = [];

    let delay = 600;
    seq.forEach((key, i) => {
      const id = setTimeout(() => {
        setHighlightStep(i);
        setActiveKey(key);
        audioManager?.playSimonNote(key);
        setTimeout(() => { setHighlightStep(-1); setActiveKey(null); }, 520);
      }, delay);
      timersRef.current.push(id);
      delay += 850;
    });

    const doneId = setTimeout(() => {
      setPhase(PHASE.INPUT); phaseRef.current = PHASE.INPUT;
      const utter = new SpeechSynthesisUtterance('Your turn! Repeat the sequence using arrow keys. Each key press is registered when you release.');
      window.speechSynthesis?.speak(utter);
    }, delay + 300);
    timersRef.current.push(doneId);
  }, [audioManager]);

  // ── Handle one user input step ──────────────────────────────────────────────
  const handleInput = useCallback((key) => {
    if (phaseRef.current !== PHASE.INPUT) return;

    setActiveKey(key);
    setTimeout(() => setActiveKey(null), 300);

    const newInput = [...userInputRef.current, key];
    userInputRef.current = newInput;
    setUserInput([...newInput]);
    const step = newInput.length - 1;

    if (newInput[step] !== seqRef.current[step]) {
      // Wrong — replay from start (no lives)
      audioManager?.playWrong();
      setResult('wrong');
      const utter = new SpeechSynthesisUtterance('Wrong! Listen again carefully.');
      window.speechSynthesis?.speak(utter);
      setTimeout(() => {
        setResult(null);
        playSequence(seqRef.current);
      }, 1500);
      return;
    }

    if (newInput.length === seqRef.current.length) {
      setPhase(PHASE.RESULT); phaseRef.current = PHASE.RESULT;
      setResult('correct');
      audioManager?.playCorrect();
      const utter = new SpeechSynthesisUtterance('Excellent! Sequence complete. Puzzle solved!');
      window.speechSynthesis?.speak(utter);
      setTimeout(() => onSolve(), 1800);
    }
  }, [audioManager, onSolve, playSequence]);

  // ── Keyboard handler ──────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code === 'Enter') {
        e.preventDefault();
        if (phaseRef.current === PHASE.EXPLORE) {
          playSequence(seqRef.current);
        }
        return;
      }
      // Space = silence TTS
      if (e.code === 'Space') {
        e.preventDefault();
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
          return;
        }
        return;
      }
      if (e.key === 'Escape') { clearAll(); onSkip(); return; }
      if (e.key === 'r' || e.key === 'R') {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance('Replaying sequence.');
        window.speechSynthesis.speak(utter);
        setTimeout(() => playSequence(seqRef.current), 800);
        return;
      }
      if (e.key === 'i' || e.key === 'I') {
        const msg = phaseRef.current === PHASE.EXPLORE
          ? 'Explore each arrow key to hear its note. Press Enter when ready to start.'
          : 'Listen to the sequence then repeat it with arrow keys. Each key registers when released. Press R to replay.';
        const utter = new SpeechSynthesisUtterance(msg);
        window.speechSynthesis.speak(utter);
        return;
      }

      if (!ARROWS.includes(e.key)) return;
      if (e.repeat) return; // BLOCK auto-repeat
      e.preventDefault();

      if (pressedRef.current.has(e.key)) return;
      pressedRef.current.add(e.key);

      // Play the note immediately on press
      audioManager?.playSimonNote(e.key);
      setActiveKey(e.key);

      if (phaseRef.current === PHASE.EXPLORE) {
        setExploredKeys(prev => new Set([...prev, e.key]));
      }
    };

    const onKeyUp = (e) => {
      if (!ARROWS.includes(e.key)) return;
      if (!pressedRef.current.has(e.key)) return;
      pressedRef.current.delete(e.key);
      setActiveKey(null);
      e.preventDefault();

      // Register as input only on keyup, only in INPUT phase
      if (phaseRef.current === PHASE.INPUT) {
        handleInput(e.key);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [handleInput, playSequence, onSkip, audioManager]);

  const handleRestart = () => {
    clearAll();
    window.speechSynthesis?.cancel();
    const newSeq = randomSequence();
    setSequence(newSeq); seqRef.current = newSeq;
    pressedRef.current.clear();
    setUserInput([]); userInputRef.current = [];
    setResult(null); setActiveKey(null); setHighlightStep(-1);
    setExploredKeys(new Set());
    setPhase(PHASE.EXPLORE); phaseRef.current = PHASE.EXPLORE;
    const utter = new SpeechSynthesisUtterance('Puzzle restarted. Explore the arrow keys, then press Enter to begin.');
    window.speechSynthesis.speak(utter);
  };

  const allExplored = ARROWS.every(k => exploredKeys.has(k));

  return (
    <div className="wordle-overlay" role="dialog" aria-modal="true" aria-label="Simon Says Puzzle">
      <div className="wordle-panel simon-panel">
        <div className="wordle-header">
          <h2>🎮 Simon Says</h2>
          <p className="wordle-subtitle">
            {phase === PHASE.EXPLORE ? 'Learn the sounds, then press Enter to start' : 'Repeat the arrow-key note sequence'}
          </p>
        </div>

        {/* Phase label */}
        <p className="rhythm-phase-label" aria-live="polite">
          {phase === PHASE.EXPLORE  && (allExplored ? '✅ All explored — press Enter to begin!' : `Explore: ${ARROWS.filter(k => exploredKeys.has(k)).length}/4 keys heard`)}
          {phase === PHASE.PLAYBACK && '🔊 Listen carefully…'}
          {phase === PHASE.INPUT    && `↑↓←→ Your turn — step ${userInput.length + 1}/${sequence.length}`}
          {phase === PHASE.RESULT   && (result === 'correct' ? '🎉 Correct!' : result === 'wrong' ? '❌ Wrong — try listening again' : '')}
        </p>

        {/* D-pad */}
        <div className="simon-dpad">
          {ARROW_INFO.map(({ key, label, pos, desc }) => {
            const explored = exploredKeys.has(key);
            return (
              <button
                key={key}
                className={`simon-btn simon-${pos}
                  ${activeKey === key ? 'simon-active' : ''}
                  ${highlightStep >= 0 && sequence[highlightStep] === key ? 'simon-lit' : ''}
                  ${phase === PHASE.EXPLORE && explored ? 'simon-explored' : ''}
                `}
                onMouseDown={() => {
                  audioManager?.playSimonNote(key);
                  setActiveKey(key);
                  if (phase === PHASE.EXPLORE) setExploredKeys(prev => new Set([...prev, key]));
                }}
                onMouseUp={() => {
                  setActiveKey(null);
                  if (phase === PHASE.INPUT) handleInput(key);
                }}
                title={desc}
                aria-label={`${label}: ${desc}`}
              >
                {label}
                {phase === PHASE.EXPLORE && explored && <span className="explore-check">✓</span>}
              </button>
            );
          })}
          <div className="dpad-center">
            {phase === PHASE.EXPLORE && (
              <button className="dpad-start-btn" onClick={() => playSequence(seqRef.current)} title="Start puzzle (Enter)">▶</button>
            )}
          </div>
        </div>

        {/* Explore legend */}
        {phase === PHASE.EXPLORE && (
          <div className="simon-explore-legend">
            {ARROW_INFO.map(({ key, label, desc }) => (
              <div key={key} className={`explore-item ${exploredKeys.has(key) ? 'explored' : ''}`}>
                <span className="explore-key">{label}</span>
                <span className="explore-desc">{desc}</span>
              </div>
            ))}
          </div>
        )}

        {/* Sequence progress dots (input phase) */}
        {phase !== PHASE.EXPLORE && (
          <div className="simon-progress">
            {sequence.map((_, i) => (
              <div key={i} className={`simon-dot
                ${i < userInput.length ? (userInput[i] === sequence[i] ? 'dot-correct' : 'dot-wrong') : ''}
                ${highlightStep === i ? 'dot-lit' : ''}
              `} />
            ))}
          </div>
        )}

        <div className="puzzle-shortcuts">
          {phase === PHASE.EXPLORE
            ? <><span><kbd>↑↓←→</kbd> Explore notes</span><span><kbd>Enter</kbd> Start puzzle</span></>
            : <><span><kbd>↑↓←→</kbd> Input (on release)</span><span><kbd>R</kbd> Replay</span></>
          }
          <span><kbd>Space</kbd> Silence narrator</span>
          <span><kbd>Esc</kbd> Skip</span>
        </div>

        <div className="wordle-footer puzzle-footer-row">
          <button className="restart-btn" onClick={handleRestart}>🔄 Restart</button>
          <button className="skip-btn flex1" onClick={() => { clearAll(); onSkip(); }}>
            Skip (move back)
          </button>
        </div>
      </div>
    </div>
  );
}
