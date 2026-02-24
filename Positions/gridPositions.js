const { BOARD_END, HOME_END } = require("../Constants/constants");

/**
 * Generate board grid mapping for player colors
 * 2 players: 11x11, 4 players: 16x16
 */
function getGridSize(playerCount) {
  return playerCount === 2 ? 11 : 16;
}

// Example starting positions per color (can customize)
const START_POSITIONS_2P = {
  red: 1,
  blue: 1
};

const START_POSITIONS_4P = {
  red: 1,
  green: 1,
  yellow: 1,
  blue: 1
};

function getStartPosition(color, playerCount) {
  if (playerCount == 2) return START_POSITIONS_2P[color];
  return START_POSITIONS_4P[color];
}

module.exports = { getGridSize, getStartPosition };
