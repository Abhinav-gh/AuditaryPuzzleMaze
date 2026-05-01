// wordleData.js
// Wordle word bank with clues for the AudioWordle puzzle game

export const WORD_BANK = [
    { word: "CAT", clue: "A common pet that meows" },
    { word: "DOG", clue: "A loyal pet that barks" },
    { word: "MAP", clue: "Shows roads and places" },
    { word: "RUN", clue: "Move quickly on foot" },
    { word: "SUN", clue: "Bright star in the sky" },
    //   { word: "BIG", clue: "Large in size" },
    { word: "FAN", clue: "Cools you down or admires someone" },
    //   { word: "HOP", clue: "Jump on one foot" },
    { word: "JAM", clue: "Sticky spread on toast" },
    { word: "KEY", clue: "What Unlocks a door?" },
    //   { word: "HIT", clue: "Striker//  or a successful song" },
    { word: "CUP", clue: "Holds your drink" },
];

/**
 * Get a random word from the word bank
 * @returns {Object} A word object with 'word' and 'clue' properties
 */
export function getRandomWord() {
    return WORD_BANK[Math.floor(Math.random() * WORD_BANK.length)];
}

/**
 * Get a word by index
 * @param {number} index - Index in the word bank
 * @returns {Object} A word object with 'word' and 'clue' properties
 */
export function getWordByIndex(index) {
    return WORD_BANK[index];
}

/**
 * Get all words (useful for debugging or admin purposes)
 * @returns {Array} Array of all word objects
 */
export function getAllWords() {
    return WORD_BANK;
}
