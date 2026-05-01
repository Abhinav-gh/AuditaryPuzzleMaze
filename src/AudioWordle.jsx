// AudioWordle.jsx v4
// Accessibility improvements:
//  - Escape = skip (shown in UI)
//  - 1 = replay audio clue (shown in UI)
//  - 2 = instructions (shown in UI)
//  - Number keys used instead of letters to avoid conflicts with guesses
//  - All shortcuts listed in a visible shortcuts bar
//  - ARIA roles for screen reader support

import React, { useState, useEffect, useCallback } from "react";
import { getRandomWord } from "./wordleData";

// WORD_BANK is now imported from wordleData.js

const MAX_GUESSES = 4;

function getTileState(guess, target, index) {
  if (guess[index] === target[index]) return "correct";
  if (target.includes(guess[index])) return "present";
  return "absent";
}

function buildClueText(targetObj) {
  return targetObj.clue;
}

export function AudioWordle({ audioManager, onSolve, onSkip, onRestart }) {
  const [target] = useState(() => getRandomWord());
  const [guesses, setGuesses] = useState([]);
  const [current, setCurrent] = useState("");
  const [solved, setSolved] = useState(false);
  const [failed, setFailed] = useState(false);
  const [shake, setShake] = useState(false);

  const speakClue = useCallback(() => {
    window.speechSynthesis?.cancel();
    const clue = buildClueText(target);
    const utter = new SpeechSynthesisUtterance(
      `Audio clue: ${clue}. Type your 3-letter guess and press Enter.`,
    );
    utter.rate = 0.85;
    window.speechSynthesis?.speak(utter);
  }, [target]);

  // Auto-speak on mount
  useEffect(() => {
    audioManager?.playPuzzleFound();
    const msg = `Word puzzle unlocked! Guess the three-letter word using the audio clue. You have four attempts. Press 1 at any time to hear the clue again. Press 2 to repeat these instructions. Press Escape to skip.`;
    const utter = new SpeechSynthesisUtterance(msg);
    utter.rate = 0.9;
    window.speechSynthesis?.speak(utter);
    // Speak the actual clue after intro
    setTimeout(() => speakClue(), 3500);
  }, []);

  const submitGuess = useCallback(() => {
    if (current.length !== 3 || solved || failed) return;
    const upper = current.toUpperCase();
    const newGuesses = [...guesses, upper];
    setGuesses(newGuesses);
    setCurrent("");

    if (upper === target.word) {
      setSolved(true);
      audioManager?.playCorrect();
      const utter = new SpeechSynthesisUtterance(
        `Correct! The word was ${target.word}. Puzzle solved! Path unlocked.`,
      );
      utter.rate = 0.85;
      // Wait for narrator to finish before closing puzzle
      utter.onend = () => {
        onSolve();
      };
      window.speechSynthesis?.speak(utter);
    } else if (newGuesses.length >= MAX_GUESSES) {
      setFailed(true);
      audioManager?.playWrong();
      const utter = new SpeechSynthesisUtterance(
        `Out of guesses. The word was ${target.word}. You may skip or the path remains locked.`,
      );
      utter.rate = 0.85;
      window.speechSynthesis?.speak(utter);
    } else {
      audioManager?.playWrong();
      const remaining = MAX_GUESSES - newGuesses.length;
      const feedback = upper
        .split("")
        .map((ch, i) => {
          const state = getTileState(upper, target.word, i);
          const pos = ["First", "Second", "Third"][i];
          if (state === "correct")
            return `${pos} letter ${ch}: correct position`;
          if (state === "present")
            return `${pos} letter ${ch}: in the word but wrong position`;
          return `${pos} letter ${ch}: not in the word`;
        })
        .join(". ");
      const utter = new SpeechSynthesisUtterance(
        `${feedback}. ${remaining} ${remaining === 1 ? "guess" : "guesses"} remaining.`,
      );
      utter.rate = 0.95;
      window.speechSynthesis?.speak(utter);
    }
  }, [current, guesses, target, solved, failed, audioManager, onSolve]);

  // Global keyboard handler
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") {
        if (solved) {
          onSolve();
          return;
        }
        onSkip();
        return;
      }
      if (e.key === "1") {
        speakClue();
        return;
      }
      if (e.key === "2") {
        const msg = `Press 1 to hear the clue. Press 2 for instructions. Type a 3-letter word and press Enter to submit. Press Escape to skip.`;
        const utter = new SpeechSynthesisUtterance(msg);
        utter.rate = 0.9;
        window.speechSynthesis?.speak(utter);
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
        }
        return;
      }
      if (solved || failed) return;
      if (e.key === "Enter") {
        if (current.length === 3) submitGuess();
        else {
          setShake(true);
          setTimeout(() => setShake(false), 400);
          audioManager?.playWallBump();
        }
      } else if (e.key === "Backspace") {
        setCurrent((c) => c.slice(0, -1));
      } else if (/^[a-zA-Z]$/.test(e.key) && current.length < 3) {
        setCurrent((c) => (c + e.key).toUpperCase());
        audioManager?.playLetterHint(e.key.toUpperCase().charCodeAt(0) % 8);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [current, solved, failed, submitGuess, speakClue, onSkip, audioManager]);

  const handleOnScreenKey = (key) => {
    if (solved || failed) return;
    if (key === "ENTER") submitGuess();
    else if (key === "⌫") setCurrent((c) => c.slice(0, -1));
    else if (current.length < 3) {
      setCurrent((c) => (c + key).toUpperCase());
      audioManager?.playLetterHint(key.charCodeAt(0) % 8);
    }
  };

  const keyboardRows = [
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "⌫"],
  ];

  return (
    <div
      className="wordle-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Word Puzzle"
    >
      <div className="wordle-panel">
        <div className="wordle-header">
          <h2>🔐 Word Puzzle</h2>
          <p className="wordle-subtitle">
            Guess the 3-letter word to unlock the path
          </p>
          <button
            className="clue-btn"
            onClick={speakClue}
            aria-label="Replay audio clue"
          >
            🔊 Replay Audio Clue <span className="key-hint">1</span>
          </button>
        </div>

        {/* Guess grid */}
        <div className="wordle-grid" role="group" aria-label="Guess grid">
          {Array.from({ length: MAX_GUESSES }).map((_, rowIdx) => {
            const guess = guesses[rowIdx] ?? null;
            const isActive = rowIdx === guesses.length && !solved && !failed;
            const displayWord = isActive
              ? current.padEnd(3, " ")
              : (guess ?? "   ");
            return (
              <div
                key={rowIdx}
                className={`wordle-row ${isActive && shake ? "shake" : ""}`}
                aria-label={
                  guess
                    ? `Guess ${rowIdx + 1}: ${guess}`
                    : isActive
                      ? "Current guess row"
                      : "Empty row"
                }
              >
                {Array.from({ length: 3 }).map((_, colIdx) => {
                  const letter = displayWord[colIdx] ?? " ";
                  const state = guess
                    ? getTileState(guess, target.word, colIdx)
                    : "";
                  return (
                    <div
                      key={colIdx}
                      className={`wordle-tile ${state} ${isActive ? "active-tile" : ""}`}
                      style={{ animationDelay: `${colIdx * 0.1}s` }}
                      aria-label={
                        state ? `${letter}: ${state}` : letter.trim() || "empty"
                      }
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
        <div
          className="wordle-keyboard"
          role="group"
          aria-label="On-screen keyboard"
        >
          {keyboardRows.map((row, ri) => (
            <div key={ri} className="keyboard-row">
              {row.map((key) => (
                <button
                  key={key}
                  className={`key-btn ${key.length > 1 ? "key-wide" : ""}`}
                  onClick={() => handleOnScreenKey(key)}
                  aria-label={key}
                >
                  {key}
                </button>
              ))}
            </div>
          ))}
        </div>

        {(solved || failed) && (
          <div
            className={`result-banner ${solved ? "banner-win" : "banner-fail"}`}
            role="status"
          >
            {solved
              ? `🎉 Correct! Word was "${target.word}"`
              : `❌ Word was "${target.word}"`}
          </div>
        )}

        {/* Keyboard shortcuts bar */}
        <div className="puzzle-shortcuts">
          <span>
            <kbd>Enter</kbd> Submit
          </span>
          <span>
            <kbd>1</kbd> Replay clue
          </span>
          <span>
            <kbd>2</kbd> Instructions
          </span>
          <span>
            <kbd>Space</kbd> Silence narrator
          </span>
          <span>
            <kbd>Esc</kbd> Skip
          </span>
        </div>

        <div className="wordle-footer puzzle-footer-row">
          <button className="restart-btn" onClick={onRestart}>
            🔄 Restart
          </button>
          <button className="skip-btn flex1" onClick={onSkip}>
            Skip (move back)
          </button>
        </div>
      </div>
    </div>
  );
}
