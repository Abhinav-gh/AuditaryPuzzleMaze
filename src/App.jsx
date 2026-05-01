// App.jsx — Puzzle Maze v5
// Changes:
//  - Mouse MOVEMENT direction (N/S/E/W) samples every 300ms, plays preview of cell in that direction
//  - Space anywhere (outside puzzle) = silence TTS narrator
//  - puzzleKey state for restarting puzzle without reverting player position
//  - Removed rhythm/simon looping ambient pulse (was annoying)
//  - Win screen has full action buttons
//  - All puzzle overlays get onRestart prop
//  - Global Space handler for TTS silencing

import React, { useState, useEffect, useRef, useCallback } from "react";
import { AudioManager } from "./AudioManager";
import { AudioWordle } from "./AudioWordle";
import { ChordPuzzle } from "./ChordPuzzle";
import { RhythmPuzzle } from "./RhythmPuzzle";
import { SimonPuzzle } from "./SimonPuzzle";
import { useTTS } from "./useTTS";
import {
  LEVELS,
  CELL,
  CELL_IS_PUZZLE,
  getCell,
  getAdjacentDangers,
  getOpenDirections,
} from "./mazeData";
import "./index.css";

const MOVE_DIRS = {
  ArrowUp: { dx: 0, dy: -1, label: "north" },
  W: { dx: 0, dy: -1, label: "north" },
  w: { dx: 0, dy: -1, label: "north" },
  ArrowDown: { dx: 0, dy: 1, label: "south" },
  S: { dx: 0, dy: 1, label: "south" },
  s: { dx: 0, dy: 1, label: "south" },
  ArrowLeft: { dx: -1, dy: 0, label: "west" },
  A: { dx: -1, dy: 0, label: "west" },
  a: { dx: -1, dy: 0, label: "west" },
  ArrowRight: { dx: 1, dy: 0, label: "east" },
  D: { dx: 1, dy: 0, label: "east" },
  d: { dx: 1, dy: 0, label: "east" },
};

const DIR_DELTA = {
  north: { dx: 0, dy: -1 },
  south: { dx: 0, dy: 1 },
  east: { dx: 1, dy: 0 },
  west: { dx: -1, dy: 0 },
};

function dist(ax, ay, bx, by) {
  return Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
}

function exitDir(px, py, exit) {
  const dx = exit.x - px,
    dy = exit.y - py;
  return (
    [dy < 0 && "north", dy > 0 && "south", dx > 0 && "east", dx < 0 && "west"]
      .filter(Boolean)
      .join("-") || "here"
  );
}

function panOf(dir) {
  return dir === "east" ? 0.8 : dir === "west" ? -0.8 : 0;
}

// Context-aware instructions
function buildInstructions(phase, levelId) {
  if (phase === "level-select")
    return `Level select screen. Press 1 for ${LEVELS[0].name} — ${LEVELS[0].description}. Press 2 for ${LEVELS[1].name} — ${LEVELS[1].description}. Press I to hear this again. Hold Escape to go back.`;
  if (phase === "playing")
    return `You're playing ${LEVELS[levelId - 1]?.name ?? "the maze"}. Use Arrow keys or W A S D to move. Press P for a directional audio ping to the exit. Move your mouse in any direction to hear a sound preview of what's there. Press I to repeat instructions. Press Space to silence the narrator. Puzzle cells start a mini game — press Escape to skip and be moved back. Danger cells growl when adjacent!`;
  if (phase === "wordle")
    return `Word puzzle. Listen to the phonetic clue, type a 3-letter word, press Enter. Press R to replay the clue, press I to repeat these instructions, press Space to silence narrator, and Escape to skip.`;
  if (phase === "chord")
    return `Chord puzzle. Keys A through K are piano notes C D E F G A B C. Hold 3 keys simultaneously to play a chord. Match the target chord. No attempt limit! Press R to replay the target chord, press I to repeat these instructions, press Space to silence narrator, and Escape to skip.`;
  if (phase === "rhythm")
    return `Rhythm puzzle. Listen to the beat pattern first, then wait for the turn prompt before tapping Space to reproduce it. Press R to replay the pattern, press I to repeat these instructions, press Space to silence narrator, and Escape to skip.`;
  if (phase === "simon")
    return `Simon Says puzzle. First explore arrow keys to learn their sounds. Then press Space to start. Repeat the note sequence using your arrow keys — answers register when you release the key. Press R to replay the sequence, press I to repeat these instructions, and Escape to skip.`;
  return `Puzzle Maze. Select a level to begin.`;
}

// Ambient type to play based on cell + nearby danger
function ambientFor(cellType, hasDanger) {
  if (hasDanger) return "danger_adj";
  switch (cellType) {
    case CELL.EXIT:
      return "exit";
    case CELL.WORDLE:
      return "wordle";
    case CELL.CHORD:
      return "chord";
    // RHYTHM and SIMON deliberately don't loop (was annoying)
    default:
      return "path";
  }
}

const PUZZLE_PHASES = ["wordle", "chord", "rhythm", "simon"];

export default function App() {
  const [screen, setScreen] = useState("splash"); // splash | level-select | playing | won
  const [phase, setPhase] = useState("menu"); // menu | playing | wordle | chord | rhythm | simon
  const [level, setLevel] = useState(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [moves, setMoves] = useState(0);
  const [narrative, setNarrative] = useState("Welcome to Puzzle Maze.");
  const [log, setLog] = useState([]);
  const [solvedPuzzles, setSolvedPuzzles] = useState({});
  const [visitedCells, setVisitedCells] = useState(new Set(["0,0"]));
  const [nearDanger, setNearDanger] = useState([]);
  const [puzzleKey, setPuzzleKey] = useState(0); // increment to remount puzzle

  const audioRef = useRef(null);
  const prevPosRef = useRef({ x: 0, y: 0 });
  const posRef = useRef({ x: 0, y: 0 });
  const phaseRef = useRef("menu");
  const levelRef = useRef(null);
  const mousePosRef = useRef(null); // last sampled mouse pos
  const mouseCurRef = useRef(null); // current mouse pos (tracked live)
  const screenRef = useRef("splash"); // current screen for global handlers

  const { speak } = useTTS();

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    posRef.current = pos;
  }, [pos]);
  useEffect(() => {
    levelRef.current = level;
  }, [level]);
  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);
  useEffect(() => {
    audioRef.current = new AudioManager();
  }, []);

  const addLog = useCallback((msg) => {
    setLog((prev) => [msg, ...prev].slice(0, 10));
    setNarrative(msg);
  }, []);

  // ── Ambient audio update ──────────────────────────────────────────────────
  const updateAmbient = useCallback((lv, x, y, dangers) => {
    if (!lv || !audioRef.current) return;
    const ct = getCell(lv, x, y);
    audioRef.current.stopAmbient();
    audioRef.current.playAmbient(ambientFor(ct, dangers.length > 0));
  }, []);

  // ── Danger check ──────────────────────────────────────────────────────────
  const checkDanger = useCallback(
    (lv, x, y) => {
      const dangers = getAdjacentDangers(lv, x, y);
      setNearDanger(dangers);
      if (dangers.length > 0) {
        dangers.forEach(({ dir }) =>
          audioRef.current.playDangerGrowl(panOf(dir), 0.45),
        );
        const dirs = dangers.map((d) => d.dir).join(" and ");
        addLog(`⚠️ Danger growling to the ${dirs}!`);
        speak(`Warning! Danger to the ${dirs}. Stay alert!`, {
          priority: true,
        });
        return dangers;
      }
      return [];
    },
    [addLog, speak],
  );

  // ── Mouse DIRECTION sound preview ─────────────────────────────────────────
  // Samples mouse position every 300ms; if moved > 20px, plays preview of
  // what's in that direction from the player.
  useEffect(() => {
    if (
      screen !== "playing" ||
      !PUZZLE_PHASES.concat("playing").includes(phase)
    )
      return;

    const trackMouse = (e) => {
      mouseCurRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", trackMouse);

    const interval = setInterval(() => {
      if (phaseRef.current !== "playing") return;
      const cur = mouseCurRef.current;
      const last = mousePosRef.current;
      if (!cur) return;
      if (!last) {
        mousePosRef.current = { ...cur };
        return;
      }

      const dx = cur.x - last.x;
      const dy = cur.y - last.y;
      mousePosRef.current = { ...cur };

      if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return; // not enough movement

      const dir =
        Math.abs(dx) > Math.abs(dy)
          ? dx > 0
            ? "east"
            : "west"
          : dy > 0
            ? "south"
            : "north";

      const lv = levelRef.current;
      if (!lv) return;
      const { x, y } = posRef.current;
      const d = DIR_DELTA[dir];
      const tx = x + d.dx,
        ty = y + d.dy;

      let cellType;
      if (tx < 0 || tx >= lv.cols || ty < 0 || ty >= lv.rows)
        cellType = CELL.WALL;
      else cellType = getCell(lv, tx, ty);

      audioRef.current?.playHoverPreview(cellType, dir);
    }, 1000);

    return () => {
      window.removeEventListener("mousemove", trackMouse);
      clearInterval(interval);
    };
  }, [screen, phase]);

  // ── Global Space and I = silence narrator / repeat instructions ───────────
  useEffect(() => {
    const handler = (e) => {
      // Space: silence TTS everywhere except splash screen
      if (e.code === "Space") {
        if (screenRef.current === "splash") return;
        if (phaseRef.current === "rhythm") return; // Rhythm uses Space for tapping
        if (window.speechSynthesis.speaking) {
          e.preventDefault();
          window.speechSynthesis.cancel();
        }
      }

      // I: Repeat instructions anywhere except splash and won screen
      if (e.key === "i" || e.key === "I") {
        if (phaseRef.current === "simon") return; // Simon handles I contextually
        if (screenRef.current !== "splash" && screenRef.current !== "won") {
          // If in menu phase, we are likely in level select etc.
          // The speakInstructions function will use phaseRef
          window.speechSynthesis?.cancel();
          const u = new SpeechSynthesisUtterance(
            buildInstructions(phaseRef.current, levelRef.current?.id ?? 1),
          );
          window.speechSynthesis?.speak(u);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Start level ────────────────────────────────────────────────────────────
  const startLevel = async (lv) => {
    await audioRef.current.init();
    setLevel(lv);
    levelRef.current = lv;
    setScreen("playing");
    setPhase("playing");
    phaseRef.current = "playing";
    setPos(lv.start);
    prevPosRef.current = lv.start;
    posRef.current = lv.start;
    setMoves(0);
    setVisitedCells(new Set([`${lv.start.x},${lv.start.y}`]));
    setSolvedPuzzles({});
    setNearDanger([]);
    setLog([]);
    setPuzzleKey(0);
    const dangers = checkDanger(lv, lv.start.x, lv.start.y);
    updateAmbient(lv, lv.start.x, lv.start.y, dangers);
    addLog(`${lv.name} started!`);
    speak(buildInstructions("playing", lv.id), { priority: true });
  };

  const resetToMenu = useCallback(() => {
    window.speechSynthesis?.cancel();
    try {
      audioRef.current?.stopAll();
    } catch {}
    audioRef.current = new AudioManager();
    setScreen("splash");
    setPhase("menu");
    setLevel(null);
    setNarrative("Welcome to Puzzle Maze.");
    setLog([]);
    setSolvedPuzzles({});
    setVisitedCells(new Set(["0,0"]));
    setPos({ x: 0, y: 0 });
    setNearDanger([]);
  }, []);

  // ── Global Hold Escape = Main Menu ─────────────────────────────────────────
  useEffect(() => {
    const escTimer = { current: null };
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && !e.repeat) {
        escTimer.current = setTimeout(() => {
          window.speechSynthesis?.cancel();
          resetToMenu();
          speak("Returned to main menu.", { priority: true });
        }, 1000);
      }
    };
    const handleKeyUp = (e) => {
      if (e.key === "Escape") clearTimeout(escTimer.current);
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      clearTimeout(escTimer.current);
    };
  }, [resetToMenu, speak]);

  // ── I = repeat instructions ────────────────────────────────────────────────
  const speakInstructions = useCallback(() => {
    window.speechSynthesis?.cancel();
    speak(buildInstructions(phaseRef.current, levelRef.current?.id ?? 1), {
      priority: true,
    });
  }, [speak]);

  // ── Movement keyboard ──────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "playing") return;

    const handleKey = (e) => {
      if (e.key === "p" || e.key === "P") {
        const lv = levelRef.current;
        const cur = posRef.current;
        if (!lv) return;
        const ed = exitDir(cur.x, cur.y, lv.exit);
        const d = dist(cur.x, cur.y, lv.exit.x, lv.exit.y);
        audioRef.current.playPing(ed, d);
        addLog(`📡 Ping → ${ed} (${d.toFixed(1)} away)`);
        speak(
          `Exit is to the ${ed.replace("-", " ")}. Distance ${d.toFixed(1)} cells.`,
        );
        return;
      }

      const dir = MOVE_DIRS[e.key];
      if (!dir) return;
      e.preventDefault();

      const lv = levelRef.current;
      const { x, y } = posRef.current;
      if (!lv) return;
      const nx = x + dir.dx,
        ny = y + dir.dy;

      if (nx < 0 || nx >= lv.cols || ny < 0 || ny >= lv.rows) {
        audioRef.current.playWallBump();
        addLog(`🚧 Boundary to the ${dir.label}`);
        speak(`Boundary to the ${dir.label}.`, { priority: true });
        return;
      }

      const ct = getCell(lv, nx, ny);

      if (ct === CELL.WALL) {
        audioRef.current.playWallBump();
        addLog(`🧱 Wall to the ${dir.label}`);
        speak(`Wall to the ${dir.label}.`, { priority: true });
        return;
      }

      if (ct === CELL.DANGER) {
        audioRef.current.playDangerHit();
        addLog(`💀 Stepped on DANGER — pushed back!`);
        speak(`You stepped on a creature — pushed back!`, { priority: true });
        return;
      }

      // Commit move
      prevPosRef.current = { x, y };
      const newPos = { x: nx, y: ny };
      setPos(newPos);
      posRef.current = newPos;
      setMoves((m) => m + 1);
      setVisitedCells((prev) => new Set([...prev, `${nx},${ny}`]));

      if (ct === CELL.EXIT) {
        audioRef.current.stopAmbient();
        audioRef.current.playGameOver(0.25); // Play Game_Over.mp3 — resumes AudioContext if suspended
        setScreen("won");
        addLog(`🏆 EXIT REACHED!`);
        speak(
          `Congratulations! You escaped the maze in ${moves + 1} moves! Press Enter to play again, L for level select, or hold Escape for the main menu.`,
          { priority: true },
        );
        return;
      }

      if (CELL_IS_PUZZLE(ct) && !solvedPuzzles[`${nx},${ny}`]) {
        audioRef.current.playPuzzleFound();
        const phaseName = {
          [CELL.WORDLE]: "wordle",
          [CELL.CHORD]: "chord",
          [CELL.RHYTHM]: "rhythm",
          [CELL.SIMON]: "simon",
        }[ct];
        const kindLabel = {
          [CELL.WORDLE]: "Word",
          [CELL.CHORD]: "Chord",
          [CELL.RHYTHM]: "Rhythm",
          [CELL.SIMON]: "Simon Says",
        }[ct];
        addLog(`🔐 ${kindLabel} Puzzle at (${nx},${ny})`);
        speak(`${kindLabel} puzzle found! Press I for instructions.`, {
          priority: true,
        });
        setPhase(phaseName);
        phaseRef.current = phaseName;
        audioRef.current.stopAmbient();
        return;
      }

      if (CELL_IS_PUZZLE(ct) && solvedPuzzles[`${nx},${ny}`]) {
        audioRef.current.playCoin();
      } else {
        audioRef.current.playFootstep();
      }

      const dangers = checkDanger(lv, nx, ny);
      updateAmbient(lv, nx, ny, dangers);
      const openD = getOpenDirections(lv, nx, ny).join(", ") || "none";
      addLog(`👣 Moved ${dir.label} → (${nx},${ny})`);
      speak(`Moved ${dir.label}. Open: ${openD}.`, { priority: true });
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [
    phase,
    moves,
    solvedPuzzles,
    speak,
    addLog,
    checkDanger,
    updateAmbient,
    speakInstructions,
  ]);

  // We removed local I listener, relies on global listener

  // ── Puzzle callbacks ───────────────────────────────────────────────────────
  const handlePuzzleSolve = useCallback(() => {
    const { x, y } = posRef.current;
    setSolvedPuzzles((prev) => ({ ...prev, [`${x},${y}`]: true }));
    setPhase("playing");
    phaseRef.current = "playing";
    audioRef.current.playCorrect();
    const lv = levelRef.current;
    const dangers = getAdjacentDangers(lv, x, y);
    setNearDanger(dangers);
    updateAmbient(lv, x, y, dangers);
    addLog("✅ Puzzle solved — path unlocked!");
    speak("Excellent! Puzzle solved. Keep going!", { priority: true });
  }, [addLog, speak, updateAmbient]);

  const handlePuzzleSkip = useCallback(() => {
    const prev = prevPosRef.current;
    setPos(prev);
    posRef.current = prev;
    setPhase("playing");
    phaseRef.current = "playing";
    const lv = levelRef.current;
    const dangers = getAdjacentDangers(lv, prev.x, prev.y);
    setNearDanger(dangers);
    updateAmbient(lv, prev.x, prev.y, dangers);
    addLog(`⏭️ Skipped — back to (${prev.x},${prev.y})`);
    speak("Puzzle skipped. Moved back.", { priority: true });
  }, [addLog, speak, updateAmbient]);

  // Restart: remount puzzle without moving player
  const handlePuzzleRestart = useCallback(() => {
    window.speechSynthesis?.cancel();
    setPuzzleKey((k) => k + 1);
  }, []);

  // ── Derived values ─────────────────────────────────────────────────────────
  const lv = level;
  const isInGame = screen === "playing";
  const exitDistance =
    isInGame && lv ? dist(pos.x, pos.y, lv.exit.x, lv.exit.y).toFixed(1) : "—";
  const exitDirection = isInGame && lv ? exitDir(pos.x, pos.y, lv.exit) : "—";
  const openDirs =
    isInGame && lv
      ? getOpenDirections(lv, pos.x, pos.y).join(", ") || "none"
      : "—";

  // ── Render maze ────────────────────────────────────────────────────────────
  function renderMaze() {
    if (!lv) return null;
    return (
      <div className="maze-grid" style={{ "--cols": lv.cols }}>
        {lv.maze.flatMap((row, ry) =>
          row.map((cell, cx) => {
            const isPlayer = pos.x === cx && pos.y === ry;
            const isExit = cx === lv.exit.x && ry === lv.exit.y;
            const visited = visitedCells.has(`${cx},${ry}`);
            const pSolved = solvedPuzzles[`${cx},${ry}`];
            const isDanger = cell === CELL.DANGER;
            const isNearD = nearDanger.some((d) => d.x === cx && d.y === ry);

            let cls = "maze-cell";
            if (cell === CELL.WALL) cls += " cell-wall";
            else if (isExit) cls += " cell-exit";
            else if (isDanger)
              cls += ` cell-danger${isNearD ? " cell-danger-alert" : ""}`;
            else if (cell === CELL.WORDLE && !pSolved) cls += " cell-puzzle";
            else if (cell === CELL.CHORD && !pSolved) cls += " cell-chord";
            else if (cell === CELL.RHYTHM && !pSolved) cls += " cell-rhythm";
            else if (cell === CELL.SIMON && !pSolved) cls += " cell-simon";
            else if (CELL_IS_PUZZLE(cell) && pSolved)
              cls += " cell-puzzle-solved";
            else cls += visited ? " cell-visited" : " cell-path";
            if (isPlayer) cls += " cell-player";

            return (
              <div
                key={`${cx}-${ry}`}
                className={cls}
                title={
                  isDanger
                    ? "DANGER"
                    : isExit
                      ? "Exit"
                      : ({
                          [CELL.WORDLE]: "Word Puzzle",
                          [CELL.CHORD]: "Chord Puzzle",
                          [CELL.RHYTHM]: "Rhythm Puzzle",
                          [CELL.SIMON]: "Simon Puzzle",
                          [CELL.WALL]: "Wall",
                        }[cell] ?? "Path")
                }
              >
                {isPlayer && <span className="player-dot">●</span>}
                {isExit && !isPlayer && <span>🚪</span>}
                {isDanger && !isPlayer && <span>{isNearD ? "🦖" : "💀"}</span>}
                {cell === CELL.WORDLE && !pSolved && !isPlayer && (
                  <span className="puzzle-icon">❓</span>
                )}
                {cell === CELL.CHORD && !pSolved && !isPlayer && (
                  <span className="puzzle-icon">🎹</span>
                )}
                {cell === CELL.RHYTHM && !pSolved && !isPlayer && (
                  <span className="puzzle-icon">🥁</span>
                )}
                {cell === CELL.SIMON && !pSolved && !isPlayer && (
                  <span className="puzzle-icon">🎮</span>
                )}
                {CELL_IS_PUZZLE(cell) && pSolved && !isPlayer && (
                  <span className="puzzle-icon solved-check">✓</span>
                )}
              </div>
            );
          }),
        )}
      </div>
    );
  }

  // useEffect(() => {
  //   if (screen === 'splash') {
  //     window.speechSynthesis?.cancel();

  //     const utter = new SpeechSynthesisUtterance(
  //       'Welcome to Puzzle Maze. Press Enter to choose a level.'
  //     );
  //     utter.rate = 0.9;

  //     window.speechSynthesis?.speak(utter);
  //   }
  // }, [screen]);
  useEffect(() => {
    if (screen !== "splash") return;

    const speakIntro = () => {
      const synth = window.speechSynthesis;

      synth.cancel();

      const utter = new SpeechSynthesisUtterance(
        "Welcome to Puzzle Maze. Press Enter to choose a level.",
      );
      utter.rate = 0.9;

      synth.speak(utter);

      // remove after first interaction (important)
      window.removeEventListener("keydown", speakIntro);
      window.removeEventListener("click", speakIntro);
    };

    window.addEventListener("keydown", speakIntro);
    window.addEventListener("click", speakIntro);

    return () => {
      window.removeEventListener("keydown", speakIntro);
      window.removeEventListener("click", speakIntro);
    };
  }, [screen]);

  useEffect(() => {
    const handler = (e) => {
      if (screen === "splash" && e.key === "Enter") {
        e.preventDefault();
        document.getElementById("choose-level-btn")?.click();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [screen]);

  const puzzleProps = {
    audioManager: audioRef.current,
    onSolve: handlePuzzleSolve,
    onSkip: handlePuzzleSkip,
    onRestart: handlePuzzleRestart,
  };

  return (
    <div className="app">
      {/* Puzzle overlays — key={puzzleKey} causes remount on restart */}
      {phase === "wordle" && (
        <AudioWordle key={`w-${puzzleKey}`} {...puzzleProps} />
      )}
      {phase === "chord" && (
        <ChordPuzzle key={`c-${puzzleKey}`} {...puzzleProps} />
      )}
      {phase === "rhythm" && (
        <RhythmPuzzle key={`r-${puzzleKey}`} {...puzzleProps} />
      )}
      {phase === "simon" && (
        <SimonPuzzle key={`s-${puzzleKey}`} {...puzzleProps} />
      )}

      {/* Header */}
      <header className="header">
        <div className="header-title">
          <span className="header-icon">🌀</span>
          <h1>Puzzle Maze</h1>
          {lv && <span className="level-badge">Lvl {lv.id}</span>}
        </div>
        <p className="header-sub">Audio-First Exploration · Ludic Design</p>
      </header>

      <main className="main-layout">
        {/* SPLASH */}
        {screen === "splash" && (
          <div className="splash-card">
            <div className="splash-icon">🌀</div>
            <h2>Welcome to Puzzle Maze</h2>
            <p className="splash-desc">
              An audio-first exploration game. Navigate mazes by sound, solve
              music puzzles, avoid lurking dangers.
            </p>
            <p className="splash-tip">
              🎧 Use headphones for the best experience
            </p>
            <button
              className="start-btn"
              id="choose-level-btn"
              onClick={() => {
                setScreen("level-select");
                const u = new SpeechSynthesisUtterance(
                  buildInstructions("level-select", 1),
                );
                window.speechSynthesis?.speak(u);
              }}
            >
              Choose Level →
            </button>
          </div>
        )}

        {/* LEVEL SELECT */}
        {screen === "level-select" && (
          <div className="level-select">
            <h2>Select Level</h2>
            <div className="level-cards">
              {LEVELS.map((lv, i) => (
                <button
                  key={lv.id}
                  className="level-card"
                  id={`level-${lv.id}-btn`}
                  onClick={async () => {
                    audioRef.current = new AudioManager();
                    await startLevel(lv);
                  }}
                >
                  <div className="level-num">Level {lv.id}</div>
                  <div className="level-card-name">{lv.name}</div>
                  <div className="level-card-desc">{lv.description}</div>
                  <div className="level-size">
                    {lv.rows}×{lv.cols} maze
                  </div>
                  <kbd className="level-key">{i + 1}</kbd>
                </button>
              ))}
            </div>
            <button className="quit-btn" onClick={() => setScreen("splash")}>
              ↩ Back
            </button>
            {/* <p className="splash-tip small">Press <kbd>1</kbd> or <kbd>2</kbd> to select · <kbd>I</kbd> for instructions</p> */}
            <p className="splash-tip small">
              Press <kbd>1</kbd> or <kbd>2</kbd> to select · <kbd>I</kbd> for
              instructions · Hold <kbd>Esc</kbd> to go back
            </p>
            <LevelSelectKeys
              onSelect={(lv) => {
                audioRef.current = new AudioManager();
                startLevel(lv);
              }}
            />
          </div>
        )}

        {/* PLAYING */}
        {screen === "playing" && (
          <>
            <section className="maze-section" aria-label="Maze grid">
              {renderMaze()}
              <div className="maze-legend">
                <span>
                  ● <span>You</span>
                </span>
                <span>
                  🚪 <span>Exit</span>
                </span>
                <span>
                  ❓ <span>Word</span>
                </span>
                <span>
                  🎹 <span>Chord</span>
                </span>
                <span>
                  🥁 <span>Rhythm</span>
                </span>
                <span>
                  🎮 <span>Simon</span>
                </span>
                <span>
                  💀 <span>Danger</span>
                </span>
              </div>
            </section>

            <section className="info-panel">
              <div className="status-panel">
                <div
                  className="narrative-box"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <p className="narrative-label">🎙️ Narrator</p>
                  <p className="narrative-text">{narrative}</p>
                </div>
                <div className="stats-row">
                  <div className="stat-card">
                    <span className="stat-label">Position</span>
                    <span className="stat-value">
                      ({pos.x},{pos.y})
                    </span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-label">Moves</span>
                    <span className="stat-value">{moves}</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-label">Exit dist.</span>
                    <span className="stat-value">{exitDistance}</span>
                  </div>
                </div>
                <div className="open-paths-card">
                  <div>
                    <span className="stat-label">Open paths</span>
                    <span className="open-dirs">{openDirs}</span>
                  </div>
                  <div>
                    <span className="stat-label">Exit →</span>
                    <span className="open-dirs" style={{ color: "#22c55e" }}>
                      {exitDirection}
                    </span>
                  </div>
                </div>
                {nearDanger.length > 0 && (
                  <div className="danger-warning" role="alert">
                    🦖 Danger to the{" "}
                    <strong>{nearDanger.map((d) => d.dir).join(" & ")}</strong>!
                  </div>
                )}
                <div className="hud-shortcuts">
                  <span>
                    <kbd>↑↓←→</kbd> Move
                  </span>
                  <span>
                    <kbd>P</kbd> Ping
                  </span>
                  <span>
                    <kbd>I</kbd> Instructions
                  </span>
                  <span>
                    <kbd>Space</kbd> Silence narrator
                  </span>
                </div>
                <div className="event-log" role="log">
                  <p className="log-label">Event Log</p>
                  {log.map((e, i) => (
                    <p
                      key={i}
                      className={`log-entry ${i === 0 ? "log-latest" : ""}`}
                    >
                      {e}
                    </p>
                  ))}
                </div>
                <button className="quit-btn" onClick={resetToMenu}>
                  ↩ Quit to Menu
                </button>
              </div>
            </section>
          </>
        )}

        {/* WIN */}
        {screen === "won" && (
          <WinScreen
            lv={lv}
            moves={moves}
            resetToMenu={resetToMenu}
            startLevel={startLevel}
            audioRef={audioRef}
            setScreen={setScreen}
            setPhase={setPhase}
          />
        )}
      </main>
    </div>
  );
}

// Helper: keyboard shortcuts on level select screen
function LevelSelectKeys({ onSelect }) {
  useEffect(() => {
    const h = (e) => {
      if (e.key === "1") onSelect(LEVELS[0]);
      if (e.key === "2") onSelect(LEVELS[1]);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onSelect]);
  return null;
}

function WinScreen({
  lv,
  moves,
  resetToMenu,
  startLevel,
  audioRef,
  setScreen,
  setPhase,
}) {
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Enter") {
        audioRef.current = new AudioManager();
        startLevel(lv);
      }
      if (e.key === "l" || e.key === "L") {
        window.speechSynthesis?.cancel();
        try {
          audioRef.current?.stopAll();
        } catch {}
        audioRef.current = new AudioManager();
        setScreen("level-select");
        setPhase("menu");
        const u = new SpeechSynthesisUtterance(
          buildInstructions("level-select", 1),
        );
        window.speechSynthesis?.speak(u);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [lv, startLevel, audioRef, setScreen, setPhase]);

  return (
    <div className="win-card-full">
      <div className="win-emoji">🏆</div>
      <h2>You Escaped!</h2>
      <p>
        Level <strong>{lv?.id}</strong> cleared in <strong>{moves}</strong>{" "}
        moves.
      </p>
      <p className="splash-tip small" style={{ marginTop: "1rem" }}>
        Press <kbd>Enter</kbd> to Play Again · <kbd>L</kbd> for Level Select ·
        Hold <kbd>Esc</kbd> for Menu
      </p>
      <div className="win-actions">
        <button
          className="start-btn"
          id="play-again-btn"
          onClick={() => {
            audioRef.current = new AudioManager();
            startLevel(lv);
          }}
        >
          🔄 Play Again
        </button>
        <button
          className="start-btn level2"
          id="level-select-btn"
          onClick={() => {
            window.speechSynthesis?.cancel();
            try {
              audioRef.current?.stopAll();
            } catch {}
            audioRef.current = new AudioManager();
            setScreen("level-select");
            setPhase("menu");
            const u = new SpeechSynthesisUtterance(
              buildInstructions("level-select", 1),
            );
            window.speechSynthesis?.speak(u);
          }}
        >
          📋 Level Select
        </button>
        <button className="quit-btn mt" id="menu-btn" onClick={resetToMenu}>
          ↩ Main Menu
        </button>
      </div>
    </div>
  );
}
