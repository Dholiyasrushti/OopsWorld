
module.exports = {
  COLORS_2P: ["red", "blue"],
  COLORS_4P: ["red", "green", "yellow", "blue"],

  getLimits: (playerCount) => {
    if (playerCount === 4) {
      return {
        boardEnd: 58,
        homeEnd: 64,
        offsets: [0, 15, 30, 45] // 4 Players ke start points
      };
    }
    // 2 Players: Total 39 boxes on outer board
    return {
      boardEnd: 38,
      homeEnd: 44,
      offsets: [0, 20] // Player 1 starts at 1, Player 2 starts at 21
    };
  }
};