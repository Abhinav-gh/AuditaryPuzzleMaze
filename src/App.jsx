// App.jsx — Puzzle Maze v2
// Visual + Audio + TTS narration throughout.
// 5x5 grid, puzzle cells trigger Audio Wordle, TTS describes every event.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AudioManager } from './AudioManager';
import { AudioWordle } from './AudioWordle';
import { useTTS } from './useTTS';
import { MAZE, ROWS, COLS, START, EXIT, CELL, getCell } from './mazeData';
import './index.css';

const DIRECTIONS = {
  ArrowUp:    { dx: 0, dy: -1, label: 'north' },
  ArrowDown:  { dx: 0, dy: 1,  label: 'south' },
  ArrowLeft:  { dx: -1, dy: 0, label: 'west'  },
  ArrowRight: { dx: 1, dy: 0,  label: 'east'  },
  w: { dx: 0, dy: -1, label: 'north' },
  s: { dx: 0, dy: 1,  label: 'south' },
  a: { dx: -1, dy: 0, label: 'west'  },
  d: { dx: 1, dy: 0,  label: 'east'  },
  W: { dx: 0, dy: -1, label: 'north' },
  S: { dx: 0, dy: 1,  label: 'south' },
  A: { dx: -1, dy: 0, label: 'west'  },
  D: { dx: 1, dy: 0,  label: 'east'  },
};

const CELL_LABELS = {
  [CELL.PATH]:   'path',
  [CELL.WALL]:   'wall',
  [CELL.EXIT]:   'exit',
  [CELL.PUZZLE]: 'puzzle',
};

// Which puzzle cells have been solved?
const initialSolvedPuzzles = {};

function getDistance(ax, ay, bx, by) {
  return Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
}

function getMazeCellFlags(x, y) {
  // Returns accessible directions as text
  const dirs = [
    { key: 'ArrowUp', label: 'north' },
    { key: 'ArrowDown', label: 'south' },
    { key: 'ArrowLeft', label: 'west' },
    { key: 'ArrowRight', label: 'east' },
  ];
  return dirs
    .filter(({ key }) => {
      const { dx, dy } = DIRECTIONS[key];
      const cell = getCell(x + dx, y + dy);
      return cell !== null && cell !== CELL.WALL;
    })
    .map(d => d.label)
    .join(', ');
}

export default function App() {
  const [phase, setPhase] = useState('menu'); // menu | playing | puzzle | won
  const [pos, setPos] = useState(START);
  const [moves, setMoves] = useState(0);
  const [narrative, setNarrative] = useState('Welcome to Puzzle Maze. Press Start to begin.');
  const [log, setLog] = useState([]);
  const [solvedPuzzles, setSolvedPuzzles] = useState({ ...initialSolvedPuzzles });
  const [activePuzzleCell, setActivePuzzleCell] = useState(null);
  const [visitedCells, setVisitedCells] = useState(new Set(['0,0']));

  const audioRef = useRef(null);
  const { speak, cancel } = useTTS();

  // Init AudioManager once
  useEffect(() => {
    audioRef.current = new AudioManager();
  }, []);

  const addLog = useCallback((msg) => {
    setLog(prev => [msg, ...prev].slice(0, 8));
    setNarrative(msg);
  }, []);

  const startGame = async () => {
    await audioRef.current.init();
    setPhase('playing');
    setPos(START);
    setMoves(0);
    setVisitedCells(new Set(['0,0']));
    setSolvedPuzzles({});
    const msg = 'Game started! You are at position zero zero. The exit is at the bottom right. Use arrow keys or W A S D to move. Listen carefully.';
    addLog('Game started. Navigate to the exit!');
    speak(msg, { priority: true });
    audioRef.current.startBeacon();
    const dist = getDistance(START.x, START.y, EXIT.x, EXIT.y);
    audioRef.current.updateBeaconRate(dist);
  };

  const resetGame = () => {
    audioRef.current.stopAll();
    cancel();
    audioRef.current = new AudioManager();
    setPhase('menu');
    setPos(START);
    setMoves(0);
    setLog([]);
    setNarrative('Welcome to Puzzle Maze. Press Start to begin.');
    setSolvedPuzzles({});
    setActivePuzzleCell(null);
    setVisitedCells(new Set(['0,0']));
  };

  // Keyboard movement
  useEffect(() => {
    if (phase !== 'playing') return;

    const handleKey = (e) => {
      const dir = DIRECTIONS[e.key];
      if (!dir) return;
      e.preventDefault();

      const newX = pos.x + dir.dx;
      const newY = pos.y + dir.dy;

      // Boundary check
      if (newX < 0 || newX >= COLS || newY < 0 || newY >= ROWS) {
        audioRef.current.playWallBump();
        const msg = `Boundary to the ${dir.label}. Cannot go further.`;
        addLog(`🚧 Boundary — can't go ${dir.label}`);
        speak(msg, { priority: true });
        return;
      }

      const cellType = getCell(newX, newY);

      if (cellType === CELL.WALL) {
        audioRef.current.playWallBump();
        const msg = `Wall to the ${dir.label}. Try another direction.`;
        addLog(`🧱 Wall to the ${dir.label}`);
        speak(msg, { priority: true });
        return;
      }

      // Move
      const newPos = { x: newX, y: newY };
      setPos(newPos);
      setMoves(m => m + 1);
      setVisitedCells(prev => new Set([...prev, `${newX},${newY}`]));

      const dist = getDistance(newX, newY, EXIT.x, EXIT.y);
      audioRef.current.updateBeaconRate(dist);

      if (cellType === CELL.EXIT) {
        audioRef.current.stopBeacon();
        audioRef.current.playVictory();
        setPhase('won');
        const winMsg = `Congratulations! You reached the exit in ${moves + 1} moves. You escaped the maze!`;
        addLog(`🏆 EXIT REACHED! ${moves + 1} moves`);
        speak(winMsg, { priority: true });
        return;
      }

      if (cellType === CELL.PUZZLE && !solvedPuzzles[`${newX},${newY}`]) {
        // Puzzle cell: stop movement, trigger wordle
        audioRef.current.playPuzzleFound();
        const openDirs = getMazeCellFlags(newX, newY);
        const msg = `You stepped on a puzzle cell at column ${newX + 1}, row ${newY + 1}. Solve the Audio Wordle puzzle to continue!`;
        addLog(`🔐 Puzzle cell! (${newX},${newY}) — Solve to unlock`);
        speak(msg, { priority: true });
        setActivePuzzleCell({ x: newX, y: newY });
        setPhase('puzzle');
      } else {
        audioRef.current.playFootstep();
        if (cellType === CELL.PUZZLE && solvedPuzzles[`${newX},${newY}`]) {
          audioRef.current.playCoin();
        }
        const openDirs = getMazeCellFlags(newX, newY);
        const msg = `Moved ${dir.label}. Now at column ${newX + 1}, row ${newY + 1}. Open paths: ${openDirs}.`;
        addLog(`👣 Moved ${dir.label} → (${newX},${newY})`);
        speak(msg);
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [phase, pos, moves, solvedPuzzles, speak, addLog]);

  const handlePuzzleSolve = useCallback(() => {
    if (!activePuzzleCell) return;
    const key = `${activePuzzleCell.x},${activePuzzleCell.y}`;
    setSolvedPuzzles(prev => ({ ...prev, [key]: true }));
    setActivePuzzleCell(null);
    setPhase('playing');
    audioRef.current.playCoin();
    const msg = `Excellent! Puzzle solved. The path is now unlocked. Keep going!`;
    addLog('✅ Puzzle solved — path unlocked!');
    speak(msg, { priority: true });
  }, [activePuzzleCell, speak, addLog]);

  const handlePuzzleSkip = useCallback(() => {
    setActivePuzzleCell(null);
    setPhase('playing');
    const msg = `Puzzle skipped. The cell remains locked. Find another route.`;
    addLog('⏭️ Puzzle skipped');
    speak(msg, { priority: true });
    // Put player back one step (push them back so they must re-approach to retry)
  }, [speak, addLog]);

  // Description panel: which directions are open
  const openDirs = phase === 'playing' ? getMazeCellFlags(pos.x, pos.y) : '—';
  const dist = phase === 'playing' ? getDistance(pos.x, pos.y, EXIT.x, EXIT.y).toFixed(1) : '—';

  return (
    <div className="app">
      {/* Puzzle overlay */}
      {phase === 'puzzle' && (
        <AudioWordle
          audioManager={audioRef.current}
          onSolve={handlePuzzleSolve}
          onSkip={handlePuzzleSkip}
        />
      )}

      {/* Header */}
      <header className="header">
        <div className="header-title">
          <span className="header-icon">🌀</span>
          <h1>Puzzle Maze</h1>
        </div>
        <p className="header-sub">Audio-First Exploration · Ludic Design</p>
      </header>

      <main className="main-layout">
        {/* Maze Visual */}
        <section className="maze-section" aria-label="Maze grid">
          <div className="maze-grid" style={{ '--cols': COLS }}>
            {MAZE.flatMap((row, ry) =>
              row.map((cell, cx) => {
                const isPlayer = pos.x === cx && pos.y === ry;
                const isExit = cx === EXIT.x && ry === EXIT.y;
                const visited = visitedCells.has(`${cx},${ry}`);
                const puzzleSolved = solvedPuzzles[`${cx},${ry}`];
                let cls = 'maze-cell';
                if (cell === CELL.WALL) cls += ' cell-wall';
                else if (isExit) cls += ' cell-exit';
                else if (cell === CELL.PUZZLE) cls += puzzleSolved ? ' cell-puzzle-solved' : ' cell-puzzle';
                else cls += visited ? ' cell-visited' : ' cell-path';
                if (isPlayer) cls += ' cell-player';
                return (
                  <div key={`${cx}-${ry}`} className={cls} title={CELL_LABELS[cell]}>
                    {isPlayer && <span className="player-dot">●</span>}
                    {isExit && !isPlayer && <span className="exit-icon">🚪</span>}
                    {cell === CELL.PUZZLE && !puzzleSolved && !isPlayer && <span className="puzzle-icon">❓</span>}
                    {cell === CELL.PUZZLE && puzzleSolved && !isPlayer && <span className="puzzle-icon">✓</span>}
                  </div>
                );
              })
            )}
          </div>
          <p className="maze-legend">
            <span className="legend-item"><span className="leg cell-player-eg">●</span> You</span>
            <span className="legend-item"><span className="leg cell-exit-eg">🚪</span> Exit</span>
            <span className="legend-item"><span className="leg cell-puzzle-eg">❓</span> Puzzle</span>
            <span className="legend-item"><span className="leg cell-wall-eg"></span> Wall</span>
          </p>
        </section>

        {/* Right panel */}
        <section className="info-panel">
          {phase === 'menu' && (
            <div className="menu-card">
              <h2>How to Play</h2>
              <ul className="how-to-list">
                <li>🎯 Navigate the 5×5 maze to reach the exit 🚪</li>
                <li>⬆️ Use Arrow Keys or <kbd>W A S D</kbd> to move</li>
                <li>🔊 Every action is narrated — use headphones!</li>
                <li>❓ Puzzle cells trigger <strong>Audio Wordle</strong> — solve to unlock the path</li>
                <li>📍 The exit beacon pings faster as you get closer</li>
              </ul>
              <button id="start-btn" className="start-btn" onClick={startGame}>
                🎮 Start Game (Enable Audio)
              </button>
            </div>
          )}

          {(phase === 'playing' || phase === 'puzzle') && (
            <div className="status-panel">
              {/* Narrative box */}
              <div className="narrative-box" aria-live="polite">
                <p className="narrative-label">🎙️ Narrator</p>
                <p className="narrative-text">{narrative}</p>
              </div>

              {/* Stats row */}
              <div className="stats-row">
                <div className="stat-card">
                  <span className="stat-label">Position</span>
                  <span className="stat-value">({pos.x}, {pos.y})</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Moves</span>
                  <span className="stat-value">{moves}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Exit dist.</span>
                  <span className="stat-value">{dist}</span>
                </div>
              </div>

              {/* Open paths */}
              <div className="open-paths-card">
                <span className="stat-label">Open paths</span>
                <span className="open-dirs">{openDirs || 'none'}</span>
              </div>

              {/* Event log */}
              <div className="event-log">
                <p className="log-label">Event Log</p>
                {log.map((entry, i) => (
                  <p key={i} className={`log-entry ${i === 0 ? 'log-latest' : ''}`}>{entry}</p>
                ))}
              </div>

              <button className="quit-btn" onClick={resetGame}>↩ Quit to Menu</button>
            </div>
          )}

          {phase === 'won' && (
            <div className="win-card">
              <div className="win-emoji">🏆</div>
              <h2>You Escaped!</h2>
              <p>Completed in <strong>{moves}</strong> moves.</p>
              <button className="start-btn" onClick={startGame}>Play Again</button>
              <button className="quit-btn mt" onClick={resetGame}>Back to Menu</button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
