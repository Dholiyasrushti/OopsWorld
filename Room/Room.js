// const Room = require("../Models/Room");
// const {createPawns} = require("../Pawns/Pawns");
// const { COLORS_2P, COLORS_4P } = require("../Constants/constants");

// async function createRoom(players, deck, maxPlayers) {
//   const colors = maxPlayers === 2 ? COLORS_2P : COLORS_4P;

//   const playersWithData = players.map((p, i) => ({
//     ...p,
//     color: colors[i],
//     pawns: createPawns(colors[i]),
//     homeCount: 0
//   }));
//   // console.log("deck",deck)
//   const roomId = "room_" + Math.random().toString(36).substring(2, 10);
// let room;
//   try {
//   room = await Room.create({
//     roomId,
//     maxPlayers,
//     players: playersWithData,
//     cards: deck,
//     status: "STARTED",
//     turnIndex: 0
//   });
//   // console.log("✅ Room created:", room);
// } catch (err) {
//   console.error("❌ Room creation failed:", err);
// }
// return room;  
// }

// module.exports = {createRoom};

const Room = require("../Models/Room");
const { getLimits, COLORS_2P, COLORS_4P } = require("../Constants/constants");

async function createRoom(players, deck, maxPlayers) {
  // 1. Correct colors aur limits (offsets) nikaalein
  const colors = maxPlayers === 2 ? COLORS_2P : COLORS_4P;
  const limits = getLimits(maxPlayers);

  const playersWithData = players.map((p, i) => {
    const playerColor = colors[i];
    const startIdx = limits.offsets[i]; // E.g., 2 players ke liye [1, 20]

    return {
      ...p,
      color: playerColor,
      homeCount: 0,
      // 2. Pawns create karein with startIndex (NaN error fix karne ke liye)
      pawns: [1, 2, 3].map(id => ({
        pawnId: id,
        color: playerColor,
        startIndex: startIdx, // 🔥 Yeh field offset logic ke liye zaroori hai
        position: -1,
        status: "BASE"
      }))
    };
  });

  const roomId = "room_" + Math.random().toString(36).substring(2, 10);
  console.log("room_id",roomId)
  const firstPlayerId = playersWithData[0]?.user_id;
  try {
    const room = await Room.create({
      roomId,
      maxPlayers,
      players: playersWithData,
      cards: deck,
      status: "STARTED",
      turnIndex: firstPlayerId
    });
    return room;
  } catch (err) {
    console.error("❌ Room creation failed:", err);
    return null;
  }
}

module.exports = { createRoom };
