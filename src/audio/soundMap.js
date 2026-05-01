// soundMap.js — Audio Asset Mapping
//
// HOW TO USE:
//   1. Drop your audio file (mp3, ogg, wav, mp4-audio) into /public/sounds/
//   2. Set the `file` property below to the path, e.g. '/sounds/footstep.mp3'
//   3. Leave `file: null` to keep the built-in synthesized sound.
//
// The game will automatically load all mapped files on start and use them
// instead of the synthesized fallback.
//
// FORMAT: { file: '/sounds/yourfile.mp3' | ['/sounds/1.mp3', '/sounds/2.mp3'] | null, description: '...' }

export const SOUND_MAP = {
  footstep: { file: null, description: 'Played on each successful step' },
  wallBump: { file: ['/sounds/wall_hit_minecraft_anvil.mp3', '/sounds/Roblox_oof.mp3'], description: 'Played when walking into a wall or boundary' },
  coin: { file: null, description: 'Played when passing through an already-solved puzzle cell' },
  puzzleFound: { file: null, description: 'Played when a new unsolved puzzle cell is triggered' },
  chordPuzzle: { file: '/sounds/Chord_puzzle_sound.mp3', description: 'Played when a chord puzzle is triggered' },
  correct: { file: ['/sounds/GTA_San_andreas_theme.mp3'], description: 'Correct answer in any puzzle' },
  wrong: { file: ['/sounds/bruh.mp3', '/sounds/boing.mp3'], description: 'Wrong answer in any puzzle' },
  victory: { file: '/sounds/Game_over.mp3', description: 'Player reaches the exit — win jingle' },
  dangerGrowl: { file: null, description: 'Danger creature nearby — proximity warning growl' },
  dangerHit: { file: '/sounds/Screaming_beaver.mp3', description: 'Player steps ON a danger cell — pushed back' },
  wasted: { file: ['/sounds/GTA_Wasted.mp3'], description: 'Played when player dies on a danger cell' },
  ping: { file: null, description: 'On-demand directional ping toward exit (press P)' },
};

