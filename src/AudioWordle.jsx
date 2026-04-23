// AudioWordle.jsx
// A mini audio-Wordle puzzle embedded in the maze.
// The player is given phonetic audio clues for each letter of a hidden 3-letter word.
// They type their guess and get audio + visual feedback (green/yellow/grey like Wordle).
// Completing the puzzle unlocks passage through the cell.

import React, { useState, useEffect, useCallback } from 'react';

// Word bank — short, phonetically distinct 3-letter words
const WORD_BANK = ['CAT', 'DOG', 'MAP', 'RUN', 'SUN', 'BIG', 'FAN', 'HOP', 'JAM', 'KEY'];

// NATO-ish phonetic descriptions per letter (for TTS clues)
const PHONETICS = {
  A: 'Alpha', B: 'Bravo', C: 'Charlie', D: 'Delta', E: 'Echo',
  F: 'Foxtrot', G: 'Golf', H: 'Hotel', I: 'India', J: 'Juliet',
  K: 'Kilo', L: 'Lima', M: 'Mike', N: 'November', O: 'Oscar',
  P: 'Papa', Q: 'Quebec', R: 'Romeo', S: 'Sierra', T: 'Tango',
  U: 'Uniform', V: 'Victor', W: 'Whiskey', X: 'X-ray', Y: 'Yankee', Z: 'Zulu',
};

const MAX_GUESSES = 4;

function getTileState(guess, target, index) {
  if (guess[index] === target[index]) return 'correct';
  if (target.includes(guess[index])) return 'present';
  return 'absent';
}

export function AudioWordle({ audioManager, onSolve, onSkip }) {
  const [target] = useState(() => WORD_BANK[Math.floor(Math.random() * WORD_BANK.length)]);
  const [guesses, setGuesses] = useState([]); // array of strings
  const [current, setCurrent] = useState('');
  const [solved, setSolved] = useState(false);
  const [failed, setFailed] = useState(false);
  const [shake, setShake] = useState(false);
  const [clueRevealed, setClueRevealed] = useState(false);

  // Speak clue on mount
  useEffect(() => {
    const clue = target
      .split('')
      .map(l => PHONETICS[l])
      .join(' ... ');
    const msg = `Puzzle unlocked! Guess the three letter word. Audio clue: ${clue}. Type your guess and press Enter.`;
    const utter = new SpeechSynthesisUtterance(msg);
    utter.rate = 0.9;
    window.speechSynthesis?.speak(utter);
    audioManager?.playPuzzleFound();
    setClueRevealed(true);
  }, []);

  const speakClue = useCallback(() => {
    window.speechSynthesis?.cancel();
    const clue = target.split('').map(l => PHONETICS[l]).join(' ... ');
    const utter = new SpeechSynthesisUtterance(`Clue: ${clue}`);
    utter.rate = 0.85;
    window.speechSynthesis?.speak(utter);
  }, [target]);

  const submitGuess = useCallback(() => {
    if (current.length !== 3 || solved || failed) return;
    const upper = current.toUpperCase();
    const newGuesses = [...guesses, upper];
    setGuesses(newGuesses);
    setCurrent('');

    if (upper === target) {
      setSolved(true);
      audioManager?.playCorrect();
      const utter = new SpeechSynthesisUtterance(`Correct! The word was ${target}. Puzzle solved! Path unlocked.`);
      window.speechSynthesis?.speak(utter);
      setTimeout(() => onSolve(), 1800);
    } else if (newGuesses.length >= MAX_GUESSES) {
      setFailed(true);
      audioManager?.playWrong();
      const utter = new SpeechSynthesisUtterance(`Out of guesses. The word was ${target}. You may skip or try again.`);
      window.speechSynthesis?.speak(utter);
    } else {
      audioManager?.playWrong();
      // Speak per-letter feedback
      const feedback = upper.split('').map((ch, i) => {
        const state = getTileState(upper, target, i);
        const position = i === 0 ? 'First' : i === 1 ? 'Second' : 'Third';
        if (state === 'correct') return `${position} letter ${ch} is correct`;
        if (state === 'present') return `${position} letter ${ch} is in the word but wrong position`;
        return `${position} letter ${ch} is not in the word`;
      }).join('. ');
      const utter = new SpeechSynthesisUtterance(feedback + '. Try again.');
      utter.rate = 0.95;
      window.speechSynthesis?.speak(utter);
    }
  }, [current, guesses, target, solved, failed, audioManager, onSolve]);

  const handleKeyDown = useCallback((e) => {
    if (solved || failed) return;
    if (e.key === 'Enter') {
      if (current.length === 3) submitGuess();
      else {
        setShake(true);
        setTimeout(() => setShake(false), 400);
        audioManager?.playWallBump();
      }
    } else if (e.key === 'Backspace') {
      setCurrent(c => c.slice(0, -1));
    } else if (/^[a-zA-Z]$/.test(e.key) && current.length < 3) {
      setCurrent(c => (c + e.key).toUpperCase());
    }
  }, [current, solved, failed, submitGuess, audioManager]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Keyboard click sound per letter
  const handleLetterKey = (letter) => {
    if (current.length < 3 && !solved && !failed) {
      setCurrent(c => (c + letter).toUpperCase());
      audioManager?.playLetterHint(letter.charCodeAt(0) % 8, 8, false);
    }
  };

  const keyboardRows = [
    ['Q','W','E','R','T','Y','U','I','O','P'],
    ['A','S','D','F','G','H','J','K','L'],
    ['ENTER','Z','X','C','V','B','N','M','⌫'],
  ];

  return (
    <div className="wordle-overlay">
      <div className="wordle-panel">
        <div className="wordle-header">
          <h2>🔐 Puzzle Cell</h2>
          <p className="wordle-subtitle">Guess the 3-letter word to unlock the path</p>
          <button className="clue-btn" onClick={speakClue}>🔊 Repeat Audio Clue</button>
        </div>

        {/* Guess grid */}
        <div className="wordle-grid">
          {Array.from({ length: MAX_GUESSES }).map((_, rowIdx) => {
            const guess = guesses[rowIdx] ?? null;
            const isActive = rowIdx === guesses.length && !solved && !failed;
            const displayWord = isActive ? current.padEnd(3, ' ') : (guess ?? '   ');

            return (
              <div key={rowIdx} className={`wordle-row ${isActive && shake ? 'shake' : ''}`}>
                {Array.from({ length: 3 }).map((__, colIdx) => {
                  const letter = displayWord[colIdx] ?? ' ';
                  const state = guess ? getTileState(guess, target, colIdx) : '';
                  return (
                    <div
                      key={colIdx}
                      className={`wordle-tile ${state} ${isActive ? 'active-tile' : ''}`}
                      style={{ animationDelay: `${colIdx * 0.1}s` }}
                    >
                      {letter.trim()}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* On-screen keyboard */}
        <div className="wordle-keyboard">
          {keyboardRows.map((row, ri) => (
            <div key={ri} className="keyboard-row">
              {row.map(key => (
                <button
                  key={key}
                  className={`key-btn ${key.length > 1 ? 'key-wide' : ''}`}
                  onClick={() => {
                    if (key === 'ENTER') submitGuess();
                    else if (key === '⌫') setCurrent(c => c.slice(0,-1));
                    else handleLetterKey(key);
                  }}
                >
                  {key}
                </button>
              ))}
            </div>
          ))}
        </div>

        {(solved || failed) && (
          <div className={`result-banner ${solved ? 'banner-win' : 'banner-fail'}`}>
            {solved ? `🎉 Correct! Word was "${target}"` : `❌ Word was "${target}"`}
          </div>
        )}

        <div className="wordle-footer">
          <button className="skip-btn" onClick={onSkip}>Skip puzzle (no unlock)</button>
        </div>
      </div>
    </div>
  );
}
