// SimonPuzzle.jsx
// Simon-Says style spatial audio sequence puzzle:
//  1. A sequence of 4 directional notes plays (each arrow = different spatially panned tone)
//  2. Player must repeat the sequence using arrow keys (or click buttons)
//  3. Correct → next note in sequence; Full sequence correct → SOLVED
//  4. 3 lives. R = replay. Escape = skip + revert.
//
// Arrow key sounds (each spatially positioned):
//   ↑ = high (C5, center)  ↓ = low (C3, center)
//   ← = mid-low (E3, left pan)  → = mid-high (G3, right pan)

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SIMON_NOTES } from './AudioManager';

const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
const SEQ_LENGTH = 4;

function randomSequence() {
  return Array.from({ length: SEQ_LENGTH }, () => ARROWS[Math.floor(Math.random() * ARROWS.length)]);
}

const PHASE = { INTRO: 'intro', PLAYBACK: 'playback', INPUT: 'input', RESULT: 'result' };

export function SimonPuzzle({ audioManager, onSolve, onSkip }) {
  const [sequence] = useState(() => randomSequence());
  const [phase, setPhase] = useState(PHASE.INTRO);
  const [lives, setLives] = useState(3);
  const [userInput, setUserInput] = useState([]);
  const [activeKey, setActiveKey] = useState(null); // highlighted during playback or input
  const [result, setResult] = useState(null); // 'correct' | 'wrong' | 'failed'
  const [highlightStep, setHighlightStep] = useState(-1); // which step is currently lit

  const phaseRef = useRef(PHASE.INTRO);
  const userInputRef = useRef([]);
  const timersRef = useRef([]);

  const clearAll = () => timersRef.current.forEach(clearTimeout);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const playSequence = useCallback(() => {
    clearAll(); timersRef.current = [];
    setPhase(PHASE.PLAYBACK); setUserInput([]); userInputRef.current = [];

    let delay = 600;
    sequence.forEach((key, i) => {
      const id = setTimeout(() => {
        setHighlightStep(i);
        setActiveKey(key);
        audioManager?.playSimonNote(key);
        setTimeout(() => { setHighlightStep(-1); setActiveKey(null); }, 500);
      }, delay);
      timersRef.current.push(id);
      delay += 800;
    });

    const doneId = setTimeout(() => {
      setPhase(PHASE.INPUT);
      phaseRef.current = PHASE.INPUT;
      const utter = new SpeechSynthesisUtterance('Your turn! Repeat the sequence using the arrow keys.');
      window.speechSynthesis?.speak(utter);
    }, delay + 400);
    timersRef.current.push(doneId);
  }, [sequence, audioManager]);

  // Auto-start
  useEffect(() => {
    audioManager?.playPuzzleFound();
    const intro = `Simon Says puzzle! You will hear a sequence of 4 direction sounds. Each arrow key plays a different note. Listen, then repeat the sequence using your arrow keys. Press R to replay the sequence. Press Escape to skip.`;
    const utter = new SpeechSynthesisUtterance(intro);
    utter.rate = 0.88;
    window.speechSynthesis?.speak(utter);
    const id = setTimeout(() => playSequence(), 4500);
    timersRef.current.push(id);
    return () => clearAll();
  }, []);

  const handleInput = useCallback((key) => {
    if (phaseRef.current !== PHASE.INPUT) return;
    audioManager?.playSimonNote(key, 0.2, 0.45);
    setActiveKey(key);
    setTimeout(() => setActiveKey(null), 350);

    const newInput = [...userInputRef.current, key];
    userInputRef.current = newInput;
    setUserInput([...newInput]);
    const step = newInput.length - 1;

    if (newInput[step] !== sequence[step]) {
      // Wrong!
      audioManager?.playWrong();
      const newLives = lives - 1;
      setLives(newLives);
      if (newLives <= 0) {
        setPhase(PHASE.RESULT); phaseRef.current = PHASE.RESULT; setResult('failed');
        const utter = new SpeechSynthesisUtterance('Wrong! Out of attempts. You may skip the puzzle.');
        window.speechSynthesis?.speak(utter);
      } else {
        const utter = new SpeechSynthesisUtterance(`Wrong step! ${newLives} ${newLives === 1 ? 'attempt' : 'attempts'} left. Replaying.`);
        window.speechSynthesis?.speak(utter);
        setTimeout(() => playSequence(), 2000);
      }
      return;
    }

    if (newInput.length === sequence.length) {
      // Fully correct!
      setPhase(PHASE.RESULT); phaseRef.current = PHASE.RESULT; setResult('correct');
      audioManager?.playCorrect();
      const utter = new SpeechSynthesisUtterance('Well done! Sequence complete. Puzzle solved!');
      window.speechSynthesis?.speak(utter);
      setTimeout(() => onSolve(), 1800);
    }
  }, [sequence, lives, audioManager, onSolve, playSequence]);

  // Keyboard
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') { clearAll(); onSkip(); return; }
      if (e.key === 'r' || e.key === 'R') {
        const utter = new SpeechSynthesisUtterance('Replaying sequence.');
        window.speechSynthesis?.speak(utter);
        setTimeout(() => playSequence(), 800);
        return;
      }
      if (ARROWS.includes(e.key)) {
        e.preventDefault();
        handleInput(e.key);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleInput, playSequence, onSkip]);

  const hearts = Array.from({ length: 3 }, (_, i) => i < lives ? '❤️' : '🖤');

  const btnInfo = [
    { key: 'ArrowUp',    label: '↑', pos: 'top',    note: 'High C' },
    { key: 'ArrowLeft',  label: '←', pos: 'left',   note: 'Low E (left)' },
    { key: 'ArrowDown',  label: '↓', pos: 'bottom', note: 'Low C' },
    { key: 'ArrowRight', label: '→', pos: 'right',  note: 'High G (right)' },
  ];

  return (
    <div className="wordle-overlay" role="dialog" aria-modal="true" aria-label="Simon Says Puzzle">
      <div className="wordle-panel simon-panel">
        <div className="wordle-header">
          <h2>🎮 Simon Says</h2>
          <p className="wordle-subtitle">Repeat the arrow-key note sequence</p>
          <div className="lives-row">{hearts.join(' ')}</div>
        </div>

        <p className="rhythm-phase-label" aria-live="polite">
          {phase === PHASE.INTRO     && 'Get ready…'}
          {phase === PHASE.PLAYBACK  && '🔊 Listen to the sequence…'}
          {phase === PHASE.INPUT     && `Press arrow keys! Step ${userInput.length + 1}/${sequence.length}`}
          {phase === PHASE.RESULT    && (result === 'correct' ? '🎉 Correct!' : result === 'failed' ? '💀 Out of attempts' : '')}
        </p>

        {/* D-pad style buttons */}
        <div className="simon-dpad">
          {btnInfo.map(({ key, label, pos, note }) => (
            <button
              key={key}
              className={`simon-btn simon-${pos}
                ${activeKey === key ? 'simon-active' : ''}
                ${highlightStep >= 0 && sequence[highlightStep] === key ? 'simon-lit' : ''}
              `}
              onClick={() => handleInput(key)}
              aria-label={`${label}: ${note}`}
            >
              {label}
            </button>
          ))}
          <div className="dpad-center" />
        </div>

        {/* Progress dots */}
        <div className="simon-progress">
          {sequence.map((_, i) => (
            <div
              key={i}
              className={`simon-dot
                ${i < userInput.length ? (userInput[i] === sequence[i] ? 'dot-correct' : 'dot-wrong') : ''}
                ${highlightStep === i ? 'dot-lit' : ''}
              `}
            />
          ))}
        </div>

        <div className="puzzle-shortcuts">
          <span><kbd>↑ ↓ ← →</kbd> Repeat notes</span>
          <span><kbd>R</kbd> Replay</span>
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
