const { BOARD_END, HOME_END } = require("../Constants/constants");


function createPawns(color) {
  return [1, 2, 3].map(i => ({
    pawnId: i,
    color,
    position: 0, // BASE
    status: "BASE"
  }));
}





function movePawn(pawn, dice) {
  if (pawn.status === "HOME") return { moved: false, reason: "ALREADY_HOME" };

  // BASE → ACTIVE
  if (pawn.status === "BASE") {
    if (dice === 6) {
      pawn.status = "ACTIVE";
      pawn.position = 1;
      return { moved: true, status: pawn.status, position: pawn.position };
    }
    return { moved: false, reason: "NEED_6" };
  }

  // ACTIVE → BOARD
  if (pawn.status === "ACTIVE") {
    const nextPos = pawn.position + dice;

    if (nextPos > BOARD_END) {
      pawn.status = "SAFETY";
      pawn.position = BOARD_END + (nextPos - BOARD_END);
    } else {
      pawn.position = nextPos;
    }
    return { moved: true, status: pawn.status, position: pawn.position };
  }

  // SAFETY → HOME
  if (pawn.status === "SAFETY") {
    const nextPos = pawn.position + dice;
    if (nextPos > HOME_END) return { moved: false, reason: "OVER_MOVE" };

    pawn.position = nextPos;
    if (pawn.position === HOME_END) pawn.status = "HOME";

    return { moved: true, status: pawn.status, position: pawn.position };
  }
}
function checkWinner(player) {
  return player.pawns.filter(p => p.status === "HOME").length === 3;
}

module.exports = {
  createPawns,movePawn,checkWinner
};
