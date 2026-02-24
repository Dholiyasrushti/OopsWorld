// const { Server } = require("socket.io");
// const User = require("../Models/Users");
// const RandomUser = require("../Models/RandomUser");
// const Card = require("../Models/Card");
// const Room = require("../Models/Room");
// const { getLimits } = require("../Constants/constants");
// const getAvatarById = require("../Utils/getAvatarById");
// const { generateShuffledDeck } = require("../Utils/cardUtils");
// const { createRoom } = require("../Room/Room");
// const calculatePawnMove = require("../Pawns/calculatePawnMove");
// require("dotenv").config();

// module.exports = (server) => {
//   const io = new Server(server, { cors: { origin: "*" } });
//   const waitingRooms = new Map();
//   const onlineUsers = new Map();

//   // --- 1. BOT TURN HANDLER ---
//   const handleBotTurn = async (roomId) => {
//     try {
//       const room = await Room.findOne({ roomId });
//       if (!room || room.status === "FINISHED") return;

//       const currentPlayer = room.players[room.turnIndex];
//       if (!currentPlayer || !currentPlayer.bot) return;

//       console.log(`\n🤖 [BOT TURN] Name: ${currentPlayer.name}`);

//       setTimeout(async () => {
//         const currentRoom = await Room.findOne({ roomId });
//         if (!currentRoom || currentRoom.cards.length === 0) return;

//         // BOT HAMESHA LINE KA PEHLA CARD UTHAYEGA
//         const cardToPlay = currentRoom.cards[0];

//         // Bot sirf FORWARD move karega, power use nahi karega
//         // SEVEN -> 7 steps, SORRY -> 4 steps (as per card DB), ELEVEN -> steps
//         const botPawn = currentPlayer.pawns.find(p => p.status === "ACTIVE") || currentPlayer.pawns[0];

//         console.log(`🤖 Bot playing ${cardToPlay.card_name} normally...`);

//         await processPlayCard({
//           roomId,
//           cardId: cardToPlay._id.toString(),
//           pawnId: botPawn.pawnId,
//           chosenMoveType: "FORWARD", // Bot powers (Swap/Split) use nahi karega
//           isBot: true
//         });
//       }, 10000);
//     } catch (err) {
//       console.error("Bot AI Error:", err);
//     }
//   };


//   const processPlayCard = async (data) => {
//     const { roomId, cardId, pawnId, chosenMoveType, targetPawnId, targetUserId, splits } = data;

//     try {
//       const room = await Room.findOne({ roomId });
//       if (!room || room.status === "FINISHED") return;

//       const player = room.players[room.turnIndex];
//       const limits = getLimits(room.players.length);
//       const card = room.cards.find(c => c._id.toString() === cardId);
//       if (!card) return;

//       const slidePoints = [9, 14, 19, 24, 29, 34];
//       const slideInfo4P = {
//         14: 3,
//         23: 4,
//         29: 3,
//         38: 4,
//         44: 3,
//         53: 4
//       };

//       let updateFields = {};
//       let nextTurn = (room.turnIndex + 1) % room.players.length;

//       // 🛠 OVERRIDE: 2-Player mode requires 40 steps for symmetric geometry (1 vs 21)
//       // User sees 39, but math needs 40 to make P2(32) hit P1(12) AND P2(16) hit P1(36).
//       if (room.players.length === 2) {
//         limits.boardEnd = 40;
//       } else if (room.players.length === 4) {
//         limits.boardEnd = 60;
//       }

//       // --- Helpers ---
//       const getGlobal = (localPos, startIdx) => {
//         if (localPos <= 0 || localPos > limits.boardEnd) return localPos;
//         return ((localPos + startIdx - 2) % limits.boardEnd) + 1;
//       };

//       const getLocal = (globalPos, startIdx) => {
//         if (globalPos <= 0 || globalPos > limits.boardEnd) return globalPos;
//         let local = (globalPos - startIdx + 1);
//         while (local <= 0) local += limits.boardEnd;
//         while (local > limits.boardEnd) local -= limits.boardEnd;
//         return local;
//       };

//       const handleKilling = (myLocalPos, myStartIdx) => {
//         const myGlobal = getGlobal(myLocalPos, myStartIdx);
//         room.players.forEach((opp, oppIdx) => {
//           if (opp.user_id.toString() === player.user_id.toString()) return;
//           opp.pawns.forEach((oppPawn, pIdx) => {
//             if (oppPawn.status === "ACTIVE") {
//               const oppGlobal = getGlobal(oppPawn.position, oppPawn.startIndex);
//               if (oppGlobal === myGlobal) {
//                 console.log(`⚔️ [KILL] Player ${player.name} killed Opponent ${opp.name}'s pawn at Global ${myGlobal}`);
//                 updateFields[`players.${oppIdx}.pawns.${pIdx}.position`] = 1; // Base is 1
//                 updateFields[`players.${oppIdx}.pawns.${pIdx}.status`] = "BASE";
//               }
//             }
//           });
//         });
//       };

//       const checkSlideAndKill = (pos, startIdx) => {
//         if (room.players.length === 4 && slideInfo4P[pos]) {
//           const slideLen = slideInfo4P[pos];
//           const slideEnd = pos + slideLen;
//           console.log(`🎢 [SLIDE 4P] Position ${pos} matches slide point. Sliding ${slideLen} steps to ${slideEnd}...`);
//           // Kill all pawns on the path (including start and end)
//           for (let i = pos; i <= slideEnd; i++) {
//             handleKilling(i, startIdx);
//           }
//           return slideEnd;
//         } else if (room.players.length === 2 && slidePoints.includes(pos)) {
//           const slideEnd = pos + 3;
//           console.log(`🎢 [SLIDE] Position ${pos} matches slide point. Sliding to ${slideEnd}...`);
//           for (let i = pos; i <= slideEnd; i++) {
//             handleKilling(i, startIdx);
//           }
//           return slideEnd;
//         } else {
//           handleKilling(pos, startIdx);
//           return pos;
//         }
//       };

//       // --- CASE 3: ELEVEN SWAP (OFFSET ONLY IF > 18) ---
//       if (card.card_name === "ELEVEN" && chosenMoveType === "SWAP") {
//         const oppIdx = room.players.findIndex(p => p.user_id.toString() === targetUserId);
//         const opponent = room.players[oppIdx];
//         const targetPawnIdx = opponent.pawns.findIndex(p => p.pawnId === targetPawnId);
//         const targetPawn = opponent.pawns[targetPawnIdx];

//         const myPawnIdx = player.pawns.findIndex(p => p.pawnId === Number(pawnId));
//         const myPawn = player.pawns[myPawnIdx];

//         // 1. Dono ki absolute (Board) positions nikaalein
//         const myGlobal = getGlobal(myPawn.position, myPawn.startIndex);
//         const oppGlobal = getGlobal(targetPawn.position, targetPawn.startIndex);

//         // 2. Swapped Global ko respective Local mein badlein
//         let myNewLocal = getLocal(oppGlobal, myPawn.startIndex);
//         let oppNewLocal = getLocal(myGlobal, targetPawn.startIndex);


//         // 🛠 Condition: Agar position 20 to 27 ke beech hai, tabhi +1 karein (User Request) - REMOVED
//         // if (myNewLocal >= 20 && myNewLocal < 22) myNewLocal += 1;
//         // if (oppNewLocal >= 20 && oppNewLocal < 22) oppNewLocal += 1;

//         // Ensure limit
//         if (myNewLocal > limits.boardEnd) myNewLocal -= limits.boardEnd;
//         if (oppNewLocal > limits.boardEnd) oppNewLocal -= limits.boardEnd;

//         const myFinalPos = checkSlideAndKill(myNewLocal, myPawn.startIndex);
//         const oppFinalPos = checkSlideAndKill(oppNewLocal, targetPawn.startIndex);

//         console.log(`[DEBUG SWAP] Player ${player.name} (Idx: ${room.turnIndex}) moves to ${myFinalPos}`);
//         console.log(`[DEBUG SWAP] Opponent (Idx: ${oppIdx}) moves to ${oppFinalPos}`);

//         updateFields[`players.${room.turnIndex}.pawns.${myPawnIdx}.position`] = myFinalPos;
//         updateFields[`players.${room.turnIndex}.pawns.${myPawnIdx}.status`] = "ACTIVE"; // ✅ FORCE ACTIVE
//         updateFields[`players.${oppIdx}.pawns.${targetPawnIdx}.position`] = oppFinalPos;
//         updateFields[`players.${oppIdx}.pawns.${targetPawnIdx}.status`] = "ACTIVE"; // ✅ FORCE ACTIVE
//         console.log("[DEBUG SWAP] updateFields:", updateFields);
//       }

//       // --- CASE 2: SORRY BUMP (OFFSET ONLY IF > 20) ---
//       else if (card.card_name === "SORRY" && chosenMoveType === "BUMP") {
//         const oppIdx = room.players.findIndex(p => p.user_id.toString() === targetUserId);
//         const opponent = room.players[oppIdx];
//         const targetPawnIdx = opponent.pawns.findIndex(p => p.pawnId === targetPawnId);
//         const targetPawn = opponent.pawns[targetPawnIdx];
//         const myPawnIdx = player.pawns.findIndex(p => p.pawnId === Number(pawnId));
//         const myPawn = player.pawns[myPawnIdx];
//         const targetGlobal = getGlobal(targetPawn.position, targetPawn.startIndex);

//         let myNewLocal = getLocal(targetGlobal, myPawn.startIndex);

//         // 🛠 Condition for Sorry Bump (User Request) - REMOVED
//         // if (myNewLocal >= 20 && myNewLocal < 22) myNewLocal += 1;

//         if (myNewLocal > limits.boardEnd) myNewLocal -= limits.boardEnd;

//         const finalPos = checkSlideAndKill(myNewLocal, myPawn.startIndex);
//         updateFields[`players.${room.turnIndex}.pawns.${myPawnIdx}.position`] = finalPos;
//         updateFields[`players.${room.turnIndex}.pawns.${myPawnIdx}.status`] = "ACTIVE";
//         updateFields[`players.${oppIdx}.pawns.${targetPawnIdx}.position`] = 1; // Base is 1
//         updateFields[`players.${oppIdx}.pawns.${targetPawnIdx}.status`] = "BASE";
//       }

//       // (Case 1 and 4 rest same)
//       else if (card.card_name === "SEVEN" && chosenMoveType === "SPLIT") {
//         if (!splits) return;
//         splits.forEach((s, index) => {
//           const pNode = player.pawns.find(p => p.pawnId === s.pawnId);
//           const updated = calculatePawnMove(pNode, { ...card, forward_steps: s.steps }, room.players.length, "FORWARD");
//           let finalPos = updated.position;
//           if (updated.status === "ACTIVE") finalPos = checkSlideAndKill(updated.position, pNode.startIndex);
//           const pawnIndex = player.pawns.findIndex(p => p.pawnId === s.pawnId);
//           updateFields[`players.${room.turnIndex}.pawns.${pawnIndex}.position`] = finalPos;
//           updateFields[`players.${room.turnIndex}.pawns.${pawnIndex}.status`] = updated.status;
//           if (updated.status === "HOME") player.homeCount++;
//         });
//         updateFields[`players.${room.turnIndex}.homeCount`] = player.homeCount;
//       }
//       else {
//         const myPawnIdx = player.pawns.findIndex(p => p.pawnId === Number(pawnId));
//         const myPawn = player.pawns[myPawnIdx];
//         let updated = calculatePawnMove(myPawn, card, room.players.length, chosenMoveType);
//         if (updated.status === "ACTIVE") updated.position = checkSlideAndKill(updated.position, myPawn.startIndex);
//         updateFields[`players.${room.turnIndex}.pawns.${myPawnIdx}.position`] = updated.position;
//         updateFields[`players.${room.turnIndex}.pawns.${myPawnIdx}.status`] = updated.status;
//         if (updated.status === "HOME") updateFields[`players.${room.turnIndex}.homeCount`] = (player.homeCount || 0) + 1;
//       }

//       updateFields["turnIndex"] = nextTurn;

//       const updatedRoom = await Room.findOneAndUpdate(
//         { roomId },
//         { $set: updateFields, $pop: { cards: -1 } },
//         { new: true }
//       );

//       if (updatedRoom) {
//         // 🏆 WIN CONDITION CHECK
//         // User Request: 3 pawns at HOME (44) -> Winner -> Delete Room
//         // Check current player's homeCount
//         const currentPlayer = updatedRoom.players[updatedRoom.turnIndex === 0 ? room.players.length - 1 : updatedRoom.turnIndex - 1]; // Previous turn was "current player" who just moved
//         // Actually, turnIndex has already advanced in updateFields. So we need to check the player who JUST moved.
//         // We know 'player' variable holds the data BEFORE the update, but we updated homeCount in DB.
//         // Let's rely on the updatedRoom. find the player who moved.

//         // Logic: TurnIndex increment ho chuka hai. So the player who moved is at (turnIndex - 1)
//         let prevTurnIndex = updatedRoom.turnIndex - 1;
//         if (prevTurnIndex < 0) prevTurnIndex = updatedRoom.players.length - 1;

//         const winningPlayer = updatedRoom.players[prevTurnIndex];

//         if (winningPlayer.homeCount >= 3) {
//           console.log(`🏆 [WINNER] Player ${winningPlayer.name} has won! Deleting room...`);

//           // 1. Set Winner locally for response
//           updatedRoom.winner = winningPlayer.user_id;
//           updatedRoom.status = "FINISHED";

//           // 2. Emit Winner
//           io.to(roomId).emit("gameStart", { room: updatedRoom });

//           // 3. Delete Room from DB
//           await Room.deleteOne({ roomId });

//           // 4. Clean up memory
//           waitingRooms.delete(updatedRoom.maxPlayers);
//           // onlineUsers cleanup logic if needed...
//           return; // Stop further processing (like Bot turn)
//         }

//         io.to(roomId).emit("gameStart", { room: updatedRoom });
//         if (updatedRoom.players[updatedRoom.turnIndex].bot) handleBotTurn(roomId);
//       }
//     } catch (err) {
//       console.error("Play Card Error:", err);
//     }
//   };
//   io.on("connection", (socket) => {
//     // OLD JOIN GAME LOGIC (Restored as requested)
//     socket.on("joinGame", async ({ user_id, maxPlayers }) => {
//       try {
//         const user = await User.findOne({ user_id }).lean();
//         if (!user) return socket.emit("error", { message: "User not found" });
//         socket.user_id = user_id;

//         if (!waitingRooms.has(maxPlayers)) waitingRooms.set(maxPlayers, { players: [], timer: null });
//         const roomData = waitingRooms.get(maxPlayers);
//         if (roomData.players.find(p => p.user_id === user_id)) return;

//         const currentUser = {
//           user_id: user.user_id,
//           name: user.username,
//           socketId: socket.id,
//           avatar: user.avatar ? process.env.BASE_URL + getAvatarById(user.avatar) : null,
//           profile_pic: user.profile_pic ? process.env.BASE_URL + user.profile_pic : null,
//           bot: false
//         };

//         roomData.players.push(currentUser);
//         onlineUsers.set(user_id, socket.id);

//         if (roomData.players.length === maxPlayers) {
//           clearTimeout(roomData.timer);
//           const cardsFromDB = await Card.find({});
//           const room = await createRoom(roomData.players, generateShuffledDeck(cardsFromDB), maxPlayers);
//           room.players.forEach(p => io.sockets.sockets.get(p.socketId)?.join(room.roomId));
//           io.to(room.roomId).emit("gameStart", { room });
//           waitingRooms.delete(maxPlayers);
//           return;
//         }

//         socket.emit("waiting", { joined: roomData.players.length, needed: maxPlayers });

//         if (!roomData.timer) {
//           roomData.timer = setTimeout(async () => {
//             if (roomData.players.length >= maxPlayers) return;
//             const count = await RandomUser.countDocuments();
//             if (count === 0) return;

//             while (roomData.players.length < maxPlayers) {
//               const botDB = await RandomUser.findOne().skip(Math.floor(Math.random() * count)).lean();
//               roomData.players.push({
//                 user_id: `bot_${Date.now()}_${roomData.players.length}`,
//                 name: botDB.username,
//                 avatar: botDB.avatar ? process.env.BASE_URL + getAvatarById(botDB.avatar) : null,
//                 bot: true
//               });
//             }

//             const room = await createRoom(roomData.players, generateShuffledDeck(await Card.find({})), roomData.players.length);
//             room.players.forEach(p => { if (!p.bot) io.sockets.sockets.get(p.socketId)?.join(room.roomId); });
//             io.to(room.roomId).emit("gameStart", { room });
//             if (room.players[room.turnIndex].bot) handleBotTurn(room.roomId);
//             waitingRooms.delete(maxPlayers);
//           }, 30000); // 30s wait
//         }
//       } catch (err) { console.error(err); }
//     });
//     // --- Start Playcard LOGIC ---
//     socket.on("playCard", (data) => processPlayCard(data));

//     // --- CHAT SYSTEM LOGIC ---
//     socket.on("sendMessage", async ({ roomId, message }) => {
//       try {
//         const room = await Room.findOne({ roomId });
//         // console.log("room",room)
//         if (!room) return;

//         const sender = room.players.find(p => p.user_id === socket.user_id);
//         // console.log("sender",sender)
//         if (!sender) return;

//         const chatData = {
//           sender_id: sender.user_id,
//           sender_name: sender.name,
//           sender_avatar: sender.avatar || "",
//           bot: sender.bot || false,
//           message: message,
//           createdAt: new Date()
//         };

//         // 1. Database update karein aur updated document ko variable mein lein
//         const updatedRoom = await Room.findOneAndUpdate(
//           { roomId },
//           { $push: { chat: chatData } },
//           { new: true } // 🔥 Yeh updated document return karega
//         );

//         // 2. Poori updated room object broadcast karein
//         io.to(roomId).emit("receiveMessage", updatedRoom);

//         // console.log(`💬 [CHAT & ROOM UPDATED] Room ${roomId} - ${sender.name}: ${message}`);
//       } catch (err) {
//         console.error("Chat Update Error:", err);
//       }
//     });

//     // --- RESHUFFLE DECK LOGIC ---
//     socket.on("reshuffleDeck", async ({ roomId }) => {
//       try {
//         // 1. Database se cards uthao
//         const cardsFromDB = await Card.find({});
//         if (!cardsFromDB || cardsFromDB.length === 0) {
//           return socket.emit("error", { message: "No cards found in database to reshuffle" });
//         }

//         // 2. Naya shuffled deck generate karo
//         // Note: generateShuffledDeck function aapke paas pehle se define hai
//         const newDeck = generateShuffledDeck(cardsFromDB);

//         // 3. Database mein room ko update karo
//         const updatedRoom = await Room.findOneAndUpdate(
//           { roomId },
//           { $set: { cards: newDeck } },
//           { new: true }
//         );

//         if (!updatedRoom) {
//           return socket.emit("error", { message: "Room not found" });
//         }

//         // 4. Sabhi players ko updated room bhej do taaki unke paas naye cards aa jayein
//         io.to(roomId).emit("gameStart", { room: updatedRoom });

//         console.log(`♻️ [DECK RESHUFFLED] Room ${roomId} cards have been reset.`);
//       } catch (err) {
//         console.error("Reshuffle Error:", err);
//         socket.emit("error", { message: "Failed to reshuffle deck" });
//       }
//     });
//   });
// };






const { Server } = require("socket.io");
const User = require("../Models/Users");
const RandomUser = require("../Models/RandomUser");
const Card = require("../Models/Card");
const Room = require("../Models/Room");
const { getLimits } = require("../Constants/constants");
const getAvatarById = require("../Utils/getAvatarById");
const { generateShuffledDeck } = require("../Utils/cardUtils");
const { createRoom } = require("../Room/Room");
const calculatePawnMove = require("../Pawns/calculatePawnMove");
const jwt = require("jsonwebtoken");
require("dotenv").config();

module.exports = (server) => {
  const io = new Server(server, { cors: { origin: "*" } });

  io.use((socket, next) => {
    console.log("--- New Handshake Attempt ---");
    // console.log("token",token)
    // console.log("socket",socket)
    // 1. Check karein token mil raha hai ya nahi
    const token = socket.handshake.auth.token || socket.handshake.headers.token;
    console.log("Token status:", token ? "Token Received" : "Token is MISSING");

    if (!token) {
      console.error("DEBUG: Middleware stopped because token is missing.");
      return next(new Error("Token missing"));
    }

    try {
      // 2. Check karein secret key sahi hai
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log("DEBUG: Token verified successfully. User ID:", decoded.user_id);

      socket.verified_id = decoded.user_id;
      next(); // Agar ye call nahi hua, toh io.on("connection") kabhi nahi chalega
    } catch (err) {
      // 3. Catch error details (jaise expired token ya galat secret)
      console.error("DEBUG: JWT Verification Failed:", err.message);
      next(new Error("Invalid Token"));
    }
  });
  const waitingRooms = new Map();
  const onlineUsers = new Map();

  const handleBotTurn = async (roomId) => {
    try {
      const room = await Room.findOne({ roomId });
      if (!room || room.status === "FINISHED") return;
      const currentPlayer = room.players[room.turnIndex];
      if (!currentPlayer || !currentPlayer.bot) return;

      setTimeout(async () => {
        const currentRoom = await Room.findOne({ roomId });
        if (!currentRoom || currentRoom.cards.length === 0) return;
        const cardToPlay = currentRoom.cards[0];
        const botPawn = currentPlayer.pawns.find(p => p.status === "ACTIVE") || currentPlayer.pawns[0];

        await processPlayCard({
          roomId,
          cardId: cardToPlay._id.toString(),
          pawnId: botPawn.pawnId,
          chosenMoveType: "FORWARD",
          isBot: true
        });
      }, 5000);
    } catch (err) {
      console.error("Bot AI Error:", err);
    }
  };


  const getCleanRoom = (fullRoom) => {
      return {
        roomId: fullRoom.roomId,
        maxPlayers: fullRoom.maxPlayers,
        status: fullRoom.status,
        turnIndex: fullRoom.turnIndex,
        winner: fullRoom.winner,
        players: fullRoom.players.map(p => ({
          user_id: p.user_id,
          name: p.name,
          bot: p.bot,
          color: p.color,
          pawns: p.pawns,
          homeCount: p.homeCount
        }))
      };
    };
  // const processPlayCard = async (data) => {
  //   const { roomId, cardId, pawnId, chosenMoveType, targetPawnId, targetUserId, splits } = data;
  //   try {
  //     const room = await Room.findOne({ roomId });
  //     if (!room || room.status === "FINISHED") return;

  //     const player = room.players[room.turnIndex];
  //     const limits = getLimits(room.players.length);
  //     const card = room.cards.find(c => c._id.toString() === cardId);
  //     if (!card) return;

  //     const slidePoints = [9, 14, 19, 24, 29, 34];
  //     const slideInfo4P = { 14: 3, 23: 4, 29: 3, 38: 4, 44: 3, 53: 4 };

  //     if (room.players.length === 2) {
  //       limits.boardEnd = 40;
  //     } else if (room.players.length === 4) {
  //       limits.boardEnd = 60;
  //     }

  //     // --- FIX: Global/Local Logic for Start 2 ---
  //     const getGlobal = (localPos, startIdx) => {
  //       if (localPos <= 0 || localPos > limits.boardEnd) return localPos;
  //       // Formula: ((Local - Offset) + (Start - 1)) % End
  //       return ((localPos - 2 + startIdx - 1 + limits.boardEnd) % limits.boardEnd) + 1;
  //     };

  //     const getLocal = (globalPos, startIdx) => {
  //       if (globalPos <= 0 || globalPos > limits.boardEnd) return globalPos;
  //       let local = (globalPos - startIdx + 2);
  //       while (local < 2) local += limits.boardEnd;
  //       while (local > limits.boardEnd + 1) local -= limits.boardEnd;
  //       return local;
  //     };

  //     const handleKilling = (myLocalPos, myStartIdx) => {
  //       const myGlobal = getGlobal(myLocalPos, myStartIdx);
  //       room.players.forEach((opp, oppIdx) => {
  //         if (opp.user_id.toString() === player.user_id.toString()) return;
  //         opp.pawns.forEach((oppPawn, pIdx) => {
  //           if (oppPawn.status === "ACTIVE") {
  //             const oppGlobal = getGlobal(oppPawn.position, oppPawn.startIndex);
  //             if (oppGlobal === myGlobal) {
  //               updateFields[`players.${oppIdx}.pawns.${pIdx}.position`] = 1;
  //               updateFields[`players.${oppIdx}.pawns.${pIdx}.status`] = "BASE";
  //             }
  //           }
  //         });
  //       });
  //     };

  //     const checkSlideAndKill = (pos, startIdx) => {
  //       let finalPos = pos;
  //       if (room.players.length === 4 && slideInfo4P[pos]) {
  //         const slideLen = slideInfo4P[pos];
  //         finalPos = pos + slideLen;
  //         for (let i = pos; i <= finalPos; i++) handleKilling(i, startIdx);
  //       } else if (room.players.length === 2 && slidePoints.includes(pos)) {
  //         finalPos = pos + 3;
  //         for (let i = pos; i <= finalPos; i++) handleKilling(i, startIdx);
  //       } else {
  //         handleKilling(pos, startIdx);
  //       }
  //       return finalPos;
  //     };

  //     let updateFields = {};
  //     let nextTurn = (room.turnIndex + 1) % room.players.length;

  //     // --- ELEVEN SWAP ---
  //     if (card.card_name === "ELEVEN" && chosenMoveType === "SWAP") {
  //       const oppIdx = room.players.findIndex(p => p.user_id.toString() === targetUserId);
  //       const opponent = room.players[oppIdx];
  //       const targetPawnIdx = opponent.pawns.findIndex(p => p.pawnId === targetPawnId);
  //       const targetPawn = opponent.pawns[targetPawnIdx];
  //       const myPawnIdx = player.pawns.findIndex(p => p.pawnId === Number(pawnId));
  //       const myPawn = player.pawns[myPawnIdx];

  //       const myGlobal = getGlobal(myPawn.position, myPawn.startIndex);
  //       const oppGlobal = getGlobal(targetPawn.position, targetPawn.startIndex);

  //       let myNewLocal = getLocal(oppGlobal, myPawn.startIndex);
  //       let oppNewLocal = getLocal(myGlobal, targetPawn.startIndex);

  //       const myFinalPos = checkSlideAndKill(myNewLocal, myPawn.startIndex);
  //       const oppFinalPos = checkSlideAndKill(oppNewLocal, targetPawn.startIndex);

  //       updateFields[`players.${room.turnIndex}.pawns.${myPawnIdx}.position`] = myFinalPos;
  //       updateFields[`players.${room.turnIndex}.pawns.${myPawnIdx}.status`] = "ACTIVE";
  //       updateFields[`players.${oppIdx}.pawns.${targetPawnIdx}.position`] = oppFinalPos;
  //       updateFields[`players.${oppIdx}.pawns.${targetPawnIdx}.status`] = "ACTIVE";
  //     }

  //     // --- SORRY BUMP ---
  //     else if (card.card_name === "SORRY" && chosenMoveType === "BUMP") {
  //       const oppIdx = room.players.findIndex(p => p.user_id.toString() === targetUserId);
  //       const opponent = room.players[oppIdx];
  //       const targetPawnIdx = opponent.pawns.findIndex(p => p.pawnId === targetPawnId);
  //       const targetPawn = opponent.pawns[targetPawnIdx];
  //       const myPawnIdx = player.pawns.findIndex(p => p.pawnId === Number(pawnId));
  //       const myPawn = player.pawns[myPawnIdx];

  //       const targetGlobal = getGlobal(targetPawn.position, targetPawn.startIndex);
  //       let myNewLocal = getLocal(targetGlobal, myPawn.startIndex);

  //       const finalPos = checkSlideAndKill(myNewLocal, myPawn.startIndex);
  //       updateFields[`players.${room.turnIndex}.pawns.${myPawnIdx}.position`] = finalPos;
  //       updateFields[`players.${room.turnIndex}.pawns.${myPawnIdx}.status`] = "ACTIVE";
  //       updateFields[`players.${oppIdx}.pawns.${targetPawnIdx}.position`] = 1;
  //       updateFields[`players.${oppIdx}.pawns.${targetPawnIdx}.status`] = "BASE";
  //     }

  //     // --- SEVEN SPLIT ---
  //     else if (card.card_name === "SEVEN" && chosenMoveType === "SPLIT") {
  //       if (!splits) return;
  //       splits.forEach((s) => {
  //         const pNode = player.pawns.find(p => p.pawnId === s.pawnId);
  //         const updated = calculatePawnMove(pNode, { ...card, forward_steps: s.steps }, room.players.length, "FORWARD");
  //         let finalPos = updated.position;
  //         if (updated.status === "ACTIVE") finalPos = checkSlideAndKill(updated.position, pNode.startIndex);
  //         const pawnIndex = player.pawns.findIndex(p => p.pawnId === s.pawnId);
  //         updateFields[`players.${room.turnIndex}.pawns.${pawnIndex}.position`] = finalPos;
  //         updateFields[`players.${room.turnIndex}.pawns.${pawnIndex}.status`] = updated.status;
  //         if (updated.status === "HOME") player.homeCount = (player.homeCount || 0) + 1;
  //       });
  //       updateFields[`players.${room.turnIndex}.homeCount`] = player.homeCount;
  //     }

  //     // --- NORMAL FORWARD/BACKWARD ---
  //     else {
  //       const myPawnIdx = player.pawns.findIndex(p => p.pawnId === Number(pawnId));
  //       const myPawn = player.pawns[myPawnIdx];
  //       let updated = calculatePawnMove(myPawn, card, room.players.length, chosenMoveType);
  //       if (updated.status === "ACTIVE") updated.position = checkSlideAndKill(updated.position, myPawn.startIndex);
  //       updateFields[`players.${room.turnIndex}.pawns.${myPawnIdx}.position`] = updated.position;
  //       updateFields[`players.${room.turnIndex}.pawns.${myPawnIdx}.status`] = updated.status;
  //       if (updated.status === "HOME") updateFields[`players.${room.turnIndex}.homeCount`] = (player.homeCount || 0) + 1;
  //     }

  //     updateFields["turnIndex"] = nextTurn;

  //     const updatedRoom = await Room.findOneAndUpdate(
  //       { roomId },
  //       { $set: updateFields, $pop: { cards: -1 } },
  //       { new: true }
  //     );

  //     if (updatedRoom) {
  //       let prevTurnIndex = updatedRoom.turnIndex - 1;
  //       if (prevTurnIndex < 0) prevTurnIndex = updatedRoom.players.length - 1;
  //       const winningPlayer = updatedRoom.players[prevTurnIndex];

  //       if (winningPlayer.homeCount >= 3) {
  //         updatedRoom.winner = winningPlayer.user_id;
  //         updatedRoom.status = "FINISHED";
  //         io.to(roomId).emit("gameStart", { room: updatedRoom });
  //         await Room.deleteOne({ roomId });
  //         return;
  //       }

  //       io.to(roomId).emit("gameStart", { room: updatedRoom });
  //       if (updatedRoom.players[updatedRoom.turnIndex].bot) handleBotTurn(roomId);
  //     }
  //   } catch (err) {
  //     console.error("Play Card Error:", err);
  //   }
  // };


  // const processPlayCard = async (data) => {
  //   const { roomId, cardId, pawnId, chosenMoveType, targetPawnId, targetUserId, splits } = data;

  //   try {
  //     const room = await Room.findOne({ roomId });
  //     if (!room) return;

  //     const player = room.players[room.turnIndex];
  //     const limits = getLimits(room.players.length);
  //     const card = room.cards.find(c => c._id.toString() === cardId);

  //     // Board configuration
  //     if (room.players.length === 2) limits.boardEnd = 40;
  //     else if (room.players.length === 4) limits.boardEnd = 60;

  //     // --- HELPERS FOR POSITIONING ---
  //     const getGlobal = (localPos, startIdx) => {
  //       if (localPos <= 0 || localPos > limits.boardEnd) return localPos;
  //       // Start 2 logic: 2 local should be exactly startIdx global
  //       return ((localPos - 2 + startIdx - 1 + limits.boardEnd) % limits.boardEnd) + 1;
  //     };

  //     const getLocal = (globalPos, startIdx) => {
  //       if (globalPos <= 0 || globalPos > limits.boardEnd) return globalPos;
  //       let local = (globalPos - startIdx + 2);
  //       while (local < 2) local += limits.boardEnd;
  //       while (local > limits.boardEnd + 1) local -= limits.boardEnd;
  //       return local;
  //     };

  //     const handleKilling = (myLocalPos, myStartIdx) => {
  //       const myGlobal = getGlobal(myLocalPos, myStartIdx);
  //       room.players.forEach((opp, oppIdx) => {
  //         if (opp.user_id.toString() === player.user_id.toString()) return;
  //         opp.pawns.forEach((oppPawn, pIdx) => {
  //           if (oppPawn.status === "ACTIVE") {
  //             const oppGlobal = getGlobal(oppPawn.position, oppPawn.startIndex);
  //             if (oppGlobal === myGlobal) {
  //               updateFields[`players.${oppIdx}.pawns.${pIdx}.position`] = 1;
  //               updateFields[`players.${oppIdx}.pawns.${pIdx}.status`] = "BASE";
  //             }
  //           }
  //         });
  //       });
  //     };

  //     const checkSlideAndKill = (pos, startIdx) => {
  //       let finalPos = pos;
  //       let slideSteps = 0;

  //       if (room.players.length === 2) {
  //         // --- 2 PLAYER LOGIC ---
  //         // Points: 9, 14, 19, 24, 29, 34 | Sab mein +3 steps
  //         const slidePoints2P = [9, 14, 19, 24, 29, 34];
  //         if (slidePoints2P.includes(pos)) {
  //           slideSteps = 3;
  //         }
  //       } else if (room.players.length === 4) {
  //         // --- 4 PLAYER LOGIC ---
  //         // 14(+3), 23(+4), 29(+3), 38(+4), 44(+3), 53(+4)
  //         const slidePoints4P = {
  //           14: 3,
  //           23: 4,
  //           29: 3,
  //           38: 4,
  //           44: 3,
  //           53: 4
  //         };
  //         if (slidePoints4P[pos]) {
  //           slideSteps = slidePoints4P[pos];
  //         }
  //       }

  //       // Agar slideSteps 0 se zyada hai, matlab slide mil gayi
  //       if (slideSteps > 0) {
  //         finalPos = pos + slideSteps;
  //         console.log(`🎢 [SLIDE] Player ${room.players.length} Mode: Sliding from ${pos} to ${finalPos} (+${slideSteps})`);

  //         // Slide ke beech mein aane wale sabhi opponents ko kill karo
  //         for (let i = pos; i <= finalPos; i++) {
  //           handleKilling(i, startIdx);
  //         }
  //       } else {
  //         // Normal land, sirf usi spot par kill check karo
  //         handleKilling(pos, startIdx);
  //       }

  //       return finalPos;
  //     };

  //     let updateFields = {};
  //     const myPawnIdx = player.pawns.findIndex(p => p.pawnId === Number(pawnId));
  //     const myPawn = player.pawns[myPawnIdx];

  //     // --- MOVEMENT EXECUTION ---
  //     if (card.card_name === "ELEVEN" && chosenMoveType === "SWAP") {
  //       const oppIdx = room.players.findIndex(p => p.user_id.toString() === targetUserId);
  //       const opponent = room.players[oppIdx];
  //       const targetPawnIdx = opponent.pawns.findIndex(p => p.pawnId === targetPawnId);
  //       const targetPawn = opponent.pawns[targetPawnIdx];
  //       const myPawnIdx = player.pawns.findIndex(p => p.pawnId === Number(pawnId));
  //       const myPawn = player.pawns[myPawnIdx];

  //       const myGlobal = getGlobal(myPawn.position, myPawn.startIndex);
  //       const oppGlobal = getGlobal(targetPawn.position, targetPawn.startIndex);

  //       let myNewLocal = getLocal(oppGlobal, myPawn.startIndex);
  //       let oppNewLocal = getLocal(myGlobal, targetPawn.startIndex);

  //       const myFinalPos = checkSlideAndKill(myNewLocal, myPawn.startIndex);
  //       const oppFinalPos = checkSlideAndKill(oppNewLocal, targetPawn.startIndex);

  //       updateFields[`players.${room.turnIndex}.pawns.${myPawnIdx}.position`] = myFinalPos;
  //       updateFields[`players.${room.turnIndex}.pawns.${myPawnIdx}.status`] = "ACTIVE";
  //       updateFields[`players.${oppIdx}.pawns.${targetPawnIdx}.position`] = oppFinalPos;
  //       updateFields[`players.${oppIdx}.pawns.${targetPawnIdx}.status`] = "ACTIVE";
  //     }

  //     // --- SORRY BUMP ---
  //     else if (card.card_name === "SORRY" && chosenMoveType === "BUMP") {
  //       const oppIdx = room.players.findIndex(p => p.user_id.toString() === targetUserId);
  //       const opponent = room.players[oppIdx];
  //       const targetPawnIdx = opponent.pawns.findIndex(p => p.pawnId === targetPawnId);
  //       const targetPawn = opponent.pawns[targetPawnIdx];
  //       const myPawnIdx = player.pawns.findIndex(p => p.pawnId === Number(pawnId));
  //       const myPawn = player.pawns[myPawnIdx];

  //       const targetGlobal = getGlobal(targetPawn.position, targetPawn.startIndex);
  //       let myNewLocal = getLocal(targetGlobal, myPawn.startIndex);

  //       const finalPos = checkSlideAndKill(myNewLocal, myPawn.startIndex);
  //       updateFields[`players.${room.turnIndex}.pawns.${myPawnIdx}.position`] = finalPos;
  //       updateFields[`players.${room.turnIndex}.pawns.${myPawnIdx}.status`] = "ACTIVE";
  //       updateFields[`players.${oppIdx}.pawns.${targetPawnIdx}.position`] = 1;
  //       updateFields[`players.${oppIdx}.pawns.${targetPawnIdx}.status`] = "BASE";
  //     }

  //     // --- SEVEN SPLIT ---
  //     else if (card.card_name === "SEVEN" && chosenMoveType === "SPLIT") {
  //       if (!splits) return;
  //       splits.forEach((s) => {
  //         const pNode = player.pawns.find(p => p.pawnId === s.pawnId);
  //         const updated = calculatePawnMove(pNode, { ...card, forward_steps: s.steps }, room.players.length, "FORWARD");
  //         let finalPos = updated.position;
  //         if (updated.status === "ACTIVE") finalPos = checkSlideAndKill(updated.position, pNode.startIndex);
  //         const pawnIndex = player.pawns.findIndex(p => p.pawnId === s.pawnId);
  //         updateFields[`players.${room.turnIndex}.pawns.${pawnIndex}.position`] = finalPos;
  //         updateFields[`players.${room.turnIndex}.pawns.${pawnIndex}.status`] = updated.status;
  //         if (updated.status === "HOME") player.homeCount = (player.homeCount || 0) + 1;
  //       });
  //       updateFields[`players.${room.turnIndex}.homeCount`] = player.homeCount;
  //     }

  //     else {
  //       // Normal Move (Like EIGHT steps)
  //       let updated = calculatePawnMove(myPawn, card, room.players.length, chosenMoveType);

  //       // 8 steps + 3 slide logic:
  //       if (updated.status === "ACTIVE") {
  //         updated.position = checkSlideAndKill(updated.position, myPawn.startIndex);
  //       }

  //       updateFields[`players.${room.turnIndex}.pawns.${myPawnIdx}.position`] = updated.position;
  //       updateFields[`players.${room.turnIndex}.pawns.${myPawnIdx}.status`] = updated.status;
  //     }

  //     // Next Turn
  //     updateFields["turnIndex"] = (room.turnIndex + 1) % room.players.length;

  //     const updatedRoom = await Room.findOneAndUpdate(
  //       { roomId },
  //       { $set: updateFields, $pop: { cards: -1 } },
  //       { new: true }
  //     );

  //     if (updatedRoom) {
  //       // 🏆 WIN CONDITION CHECK
  //       // User Request: 3 pawns at HOME (44) -> Winner -> Delete Room
  //       // Check current player's homeCount
  //       const currentPlayer = updatedRoom.players[updatedRoom.turnIndex === 0 ? room.players.length - 1 : updatedRoom.turnIndex - 1]; // Previous turn was "current player" who just moved
  //       // Actually, turnIndex has already advanced in updateFields. So we need to check the player who JUST moved.
  //       // We know 'player' variable holds the data BEFORE the update, but we updated homeCount in DB.
  //       // Let's rely on the updatedRoom. find the player who moved.

  //       // Logic: TurnIndex increment ho chuka hai. So the player who moved is at (turnIndex - 1)
  //       let prevTurnIndex = updatedRoom.turnIndex - 1;
  //       if (prevTurnIndex < 0) prevTurnIndex = updatedRoom.players.length - 1;

  //       const winningPlayer = updatedRoom.players[prevTurnIndex];

  //       if (winningPlayer.homeCount >= 3) {
  //         console.log(`🏆 [WINNER] Player ${winningPlayer.name} has won! Deleting room...`);

  //         // 1. Set Winner locally for response
  //         updatedRoom.winner = winningPlayer.user_id;
  //         updatedRoom.status = "FINISHED";

  //         // 2. Emit Winner
  //         io.to(roomId).emit("gameStart", { room: updatedRoom });

  //         // 3. Delete Room from DB
  //         await Room.deleteOne({ roomId });

  //         // 4. Clean up memory
  //         waitingRooms.delete(updatedRoom.maxPlayers);
  //         // onlineUsers cleanup logic if needed...
  //         return; // Stop further processing (like Bot turn)
  //       }

  //       io.to(roomId).emit("gameStart", { room: updatedRoom });
  //       if (updatedRoom.players[updatedRoom.turnIndex].bot) handleBotTurn(roomId);
  //     }
  //   } catch (err) {
  //     console.error("Move Error:", err);
  //   }
  // };

  const processPlayCard = async (data) => {
    const { roomId, cardId, pawnId, chosenMoveType, targetPawnId, targetUserId, splits } = data;

    try {
      const room = await Room.findOne({ roomId });
      if (!room) return;

      const player = room.players[room.turnIndex];
      const limits = getLimits(room.players.length);
      const card = room.cards.find(c => c._id.toString() === cardId);

      // Board configuration
      if (room.players.length === 2) limits.boardEnd = 39;
      else if (room.players.length === 4) limits.boardEnd = 60;

      // --- HELPERS FOR POSITIONING (FIXED FOR START 1) ---
      // const getGlobal = (localPos, startIdx) => {
      //   // Agar pawn base (1) mein hai ya safety zones mein, global coordinate boardEnd se bahar hota hai
      //   if (localPos <= -1 || localPos > limits.boardEnd) return localPos;

      //   // Agar startIndex 2 hai, aur localPos 2 hai, toh result startIdx (2) aana chahiye.
      //   // Formula: ((Local - 2) + (StartIdx - 1)) % BoardEnd + 1
      //   // Lekin aapka start 1 hai, toh hum simplify karenge:
      //   console.log("localPos ",((localPos - (-1) + startIdx - 0 + limits.boardEnd) % limits.boardEnd) + 1);
      //   return ((localPos - (-1) + startIdx - 0 + limits.boardEnd) % limits.boardEnd) + 1;
      // };

      // const getLocal = (globalPos, startIdx) => {
      //   if (globalPos <= -1 || globalPos > limits.boardEnd) return globalPos;

      //   // Reverse calculation to find where this global sits relative to my start
      //   let local = (globalPos - startIdx + 0);
      //   while (local < -1) local += limits.boardEnd;
      //   while (local > limits.boardEnd + 1) local -= limits.boardEnd;
      //   console.log("local",local)
      //   return local;
      // };


      // const getGlobal = (localPos, startIdx) => {
      //   // Agar pawn base (-1) mein hai, toh ek unique global ID return karein
      //   // Maan lijiye base global ID hum "BASE_ID + startIdx" rakhte hain
      //   if (localPos === -1) return `BASE_${startIdx}`;

      //   // Safety zone positions (40+) ko direct return karein
      //   if (localPos > 39) return localPos;

      //   // Normal board logic (0-38)
      //   // Formula: (localPos + startIdx) % totalBoardLength
      //   return (localPos + startIdx) % 40;
      // };
const getGlobal = (localPos, startIdx) => {
    // Agar pawn base (-1) mein hai, ek unique number return karein (e.g. -100)
    if (localPos === -1) return -100;

    // Safety zone (40+) ke liye position ko shift kar dein taaki wo board se na takraye
    if (localPos > 39) return 100 + localPos;

    // Normal board logic (0-39)
    // Start index offset add karke total board length (40) se modulo karein
    return (localPos + startIdx) % 40;
};
      // const getLocal = (globalPos, startIdx) => {
      //   // Agar global position base string hai, toh local -1 return karein
      //   if (typeof globalPos === 'string' && globalPos.startsWith("BASE")) {
      //     return -1;
      //   }

      //   if (globalPos > 39) return globalPos;

      //   // Reverse formula to get local from global
      //   let local = (globalPos - startIdx + 40) % 40;

      //   // 🔥 Skip 39 logic: Agar swap ke baad result 39 aaye, toh rule ke mutabik jump
      //   if (local === 39) return 40;

      //   return local;
      // };


      const getLocal = (globalPos, startIdx) => {
    // Base check: Agar swap base se hua hai
    if (globalPos === -100) return -1;

    // Safety Zone check: Agar global 100 se upar hai
    if (globalPos > 100) return globalPos - 100;

    // Board calculation: (Global - StartIndex + 40) % 40
    let local = (globalPos - startIdx + 40) % 40;

    // Skip 39 logic: Agar exactly 39 par land ho, toh aage bhej dein
    // Note: Agar aap 39 ko normal rasta maante hain toh ise hata dein
    if (local === 39) return 40;

    return local;
};
      // const handleKilling = (myLocalPos, myStartIdx) => {
      //   const myGlobal = getGlobal(myLocalPos, myStartIdx);
      //   room.players.forEach((opp, oppIdx) => {
      //     if (opp.user_id.toString() === player.user_id.toString()) return;
      //     opp.pawns.forEach((oppPawn, pIdx) => {
      //       if (oppPawn.status === "ACTIVE") {
      //         const oppGlobal = getGlobal(oppPawn.position, oppPawn.startIndex);
      //         if (oppGlobal === myGlobal) {
      //           updateFields[`players.${oppIdx}.pawns.${pIdx}.position`] = -1;
      //           updateFields[`players.${oppIdx}.pawns.${pIdx}.status`] = "BASE";
      //         }
      //       }
      //     });
      //   });
      // };


      const handleKilling = (myLocalPos, myStartIdx) => {
    const myGlobal = getGlobal(myLocalPos, myStartIdx);
    
    room.players.forEach((opp, oppIdx) => {
        opp.pawns.forEach((oppPawn, pIdx) => {
            // Khud ke pawns ko kill nahi karna hai
            if (oppPawn.status === "ACTIVE") {
                const oppGlobal = getGlobal(oppPawn.position, oppPawn.startIndex);
                
                // 🔥 Kill tabhi hoga jab Global Pos same ho PAR Pawn ki ID alag ho
                // Isse swap wala pawn khud ko nahi marega
                if (oppGlobal === myGlobal) {
                    // Check if it's not the same pawn (using unique pawn identifier)
                    // Agar aapke paas pawnId unique hai toh:
                    // if (oppPawn.pawnId === currentMovingPawnId) return;

                    updateFields[`players.${oppIdx}.pawns.${pIdx}.position`] = -1;
                    updateFields[`players.${oppIdx}.pawns.${pIdx}.status`] = "BASE";
                }
            }
        });
    });
};
      const checkSlideAndKill = (pos, startIdx) => {
        let finalPos = pos;
        let slideSteps = 0;

        if (room.players.length === 2) {
          const slidePoints2P = [8, 13, 18, 23, 28, 33];
          if (slidePoints2P.includes(pos)) {
            slideSteps = 3;
          }
        } else if (room.players.length === 4) {
          const slidePoints4P = { 13: 3, 22: 4, 28: 3, 37: 4, 43: 3, 52: 4 };
          if (slidePoints4P[pos]) {
            slideSteps = slidePoints4P[pos];
          }
        }

        if (slideSteps > 0) {
          finalPos = pos + slideSteps;
          for (let i = pos; i <= finalPos; i++) {
            handleKilling(i, startIdx);
          }
        } else {
          handleKilling(pos, startIdx);
        }
        return finalPos;
      };

      let updateFields = {};
      const myPawnIdx = player.pawns.findIndex(p => p.pawnId === Number(pawnId));
      const myPawn = player.pawns[myPawnIdx];

      // --- MOVEMENT EXECUTION ---
      // if (card.card_name === "ELEVEN" && chosenMoveType === "SWAP") {
      //   const oppIdx = room.players.findIndex(p => p.user_id.toString() === targetUserId);
      //   const opponent = room.players[oppIdx];
      //   const targetPawnIdx = opponent.pawns.findIndex(p => p.pawnId === targetPawnId);
      //   const targetPawn = opponent.pawns[targetPawnIdx];
      //   console.log("myPawn",myPawn.position,myPawn.startIndex)
      //   console.log("targetPawn",targetPawn.position,targetPawn.startIndex)
      //   // Global positions check
      //   const myGlobal = getGlobal(myPawn.position, myPawn.startIndex);
      //   const oppGlobal = getGlobal(targetPawn.position, targetPawn.startIndex);

      //   console.log("myPawn",oppGlobal,myPawn.startIndex)
      //   console.log("targetPawn",myGlobal,targetPawn.startIndex)
      //   // 🔥 FIX: Direct global-to-local translation
      //   let myNewLocal = getLocal(oppGlobal, myPawn.startIndex);
      //   let oppNewLocal = getLocal(myGlobal, targetPawn.startIndex);

      //   console.log("myPawn",myNewLocal)
      //   console.log("targetPawn",oppNewLocal)
      //   // Slide check apply karein swap ke baad
      //   const myFinalPos = checkSlideAndKill(myNewLocal, myPawn.startIndex);
      //   const oppFinalPos = checkSlideAndKill(oppNewLocal, targetPawn.startIndex);

      //   updateFields[`players.${room.turnIndex}.pawns.${myPawnIdx}.position`] = myFinalPos;
      //   updateFields[`players.${room.turnIndex}.pawns.${myPawnIdx}.status`] = "ACTIVE";
      //   updateFields[`players.${oppIdx}.pawns.${targetPawnIdx}.position`] = oppFinalPos;
      //   updateFields[`players.${oppIdx}.pawns.${targetPawnIdx}.status`] = "ACTIVE";
      // }



      //     if (card.card_name === "ELEVEN" && chosenMoveType === "SWAP") {
      //         const oppIdx = room.players.findIndex(p => p.user_id.toString() === targetUserId);
      //         const opponent = room.players[oppIdx];
      //         const targetPawnIdx = opponent.pawns.findIndex(p => p.pawnId === targetPawnId);
      //         const targetPawn = opponent.pawns[targetPawnIdx];
      //     const myGlobal = getGlobal(myPawn.position, myPawn.startIndex);
      //     const oppGlobal = getGlobal(targetPawn.position, targetPawn.startIndex);

      //     // Swap local positions
      //     let myNewLocal = getLocal(oppGlobal, myPawn.startIndex);
      //     let oppNewLocal = getLocal(myGlobal, targetPawn.startIndex);

      //     // Update My Pawn
      //     updateFields[`players.${room.turnIndex}.pawns.${myPawnIdx}.position`] = myNewLocal;
      //     updateFields[`players.${room.turnIndex}.pawns.${myPawnIdx}.status`] = (myNewLocal === -1) ? "BASE" : (myNewLocal > 38 ? "SAFETY" : "ACTIVE");

      //     // Update Opponent Pawn
      //     updateFields[`players.${oppIdx}.pawns.${targetPawnIdx}.position`] = oppNewLocal;
      //     updateFields[`players.${oppIdx}.pawns.${targetPawnIdx}.status`] = (oppNewLocal === -1) ? "BASE" : (oppNewLocal > 38 ? "SAFETY" : "ACTIVE");

      //     // Slide check sirf tab karein agar naya position BASE nahi hai
      //     if (myNewLocal !== -1) checkSlideAndKill(myNewLocal, myPawn.startIndex);
      // }

      // if (card.card_name === "ELEVEN" && chosenMoveType === "SWAP") {
      //   const oppIdx = room.players.findIndex(p => p.user_id.toString() === targetUserId);
      //   const opponent = room.players[oppIdx];
      //   const targetPawnIdx = opponent.pawns.findIndex(p => p.pawnId === targetPawnId);
      //   const targetPawn = opponent.pawns[targetPawnIdx];
      //   const myGlobal = getGlobal(myPawn.position, myPawn.startIndex);
      //   const oppGlobal = getGlobal(targetPawn.position, targetPawn.startIndex);

      //   // Swap local positions
      //   let myNewLocal = getLocal(oppGlobal, myPawn.startIndex);
      //   let oppNewLocal = getLocal(myGlobal, targetPawn.startIndex);

      //   // 🔥 FIX: Check if the new position is BASE (-1)
      //   const myNewStatus = (myNewLocal === -1) ? "BASE" : (myNewLocal > 38 ? "SAFETY" : "ACTIVE");
      //   const oppNewStatus = (oppNewLocal === -1) ? "BASE" : (oppNewLocal > 38 ? "SAFETY" : "ACTIVE");

      //   // Update My Pawn
      //   updateFields[`players.${room.turnIndex}.pawns.${myPawnIdx}.position`] = myNewLocal;
      //   updateFields[`players.${room.turnIndex}.pawns.${myPawnIdx}.status`] = myNewStatus;

      //   // Update Opponent Pawn
      //   updateFields[`players.${oppIdx}.pawns.${targetPawnIdx}.position`] = oppNewLocal;
      //   updateFields[`players.${oppIdx}.pawns.${targetPawnIdx}.status`] = oppNewStatus;

      //   // Kill check (Sirf active positions ke liye)
      //   if (myNewStatus === "ACTIVE") checkSlideAndKill(myNewLocal, myPawn.startIndex);
      //   if (oppNewStatus === "ACTIVE") checkSlideAndKill(oppNewLocal, targetPawn.startIndex);
      // }


      if (card.card_name === "ELEVEN" && chosenMoveType === "SWAP") {
    const oppIdx = room.players.findIndex(p => p.user_id.toString() === targetUserId);
    const opponent = room.players[oppIdx];
    const targetPawnIdx = opponent.pawns.findIndex(p => p.pawnId === targetPawnId);
    const targetPawn = opponent.pawns[targetPawnIdx];

    const myGlobal = getGlobal(myPawn.position, myPawn.startIndex);
    const oppGlobal = getGlobal(targetPawn.position, targetPawn.startIndex);

    // Swap local positions
    let myNewLocal = getLocal(oppGlobal, myPawn.startIndex);
    let oppNewLocal = getLocal(myGlobal, targetPawn.startIndex);

    const myNewStatus = (myNewLocal === -1) ? "BASE" : (myNewLocal > 38 ? "SAFETY" : "ACTIVE");
    const oppNewStatus = (oppNewLocal === -1) ? "BASE" : (oppNewLocal > 38 ? "SAFETY" : "ACTIVE");

    // 🔥 VVIP FIX: Update memory before calling Kill check
    // Taki handleKilling ko Pawn 2 apni nayi position par dikhe, purani par nahi
    myPawn.position = myNewLocal;
    myPawn.status = myNewStatus;
    targetPawn.position = oppNewLocal;
    targetPawn.status = oppNewStatus;

    // Ab kill check karein (PawnId pass karne ki zaroorat nahi padegi)
    if (myNewStatus === "ACTIVE") checkSlideAndKill(myNewLocal, myPawn.startIndex);
    if (oppNewStatus === "ACTIVE") checkSlideAndKill(oppNewLocal, targetPawn.startIndex);

    // Database updates prepare karein
    updateFields[`players.${room.turnIndex}.pawns.${myPawnIdx}.position`] = myNewLocal;
    updateFields[`players.${room.turnIndex}.pawns.${myPawnIdx}.status`] = myNewStatus;
    updateFields[`players.${oppIdx}.pawns.${targetPawnIdx}.position`] = oppNewLocal;
    updateFields[`players.${oppIdx}.pawns.${targetPawnIdx}.status`] = oppNewStatus;
}

      else if (card.card_name === "SORRY" && chosenMoveType === "BUMP") {
        const oppIdx = room.players.findIndex(p => p.user_id.toString() === targetUserId);
        const opponent = room.players[oppIdx];
        const targetPawnIdx = opponent.pawns.findIndex(p => p.pawnId === targetPawnId);
        const targetPawn = opponent.pawns[targetPawnIdx];

        const targetGlobal = getGlobal(targetPawn.position, targetPawn.startIndex);
        let myNewLocal = getLocal(targetGlobal, myPawn.startIndex);

        const finalPos = checkSlideAndKill(myNewLocal, myPawn.startIndex);
        updateFields[`players.${room.turnIndex}.pawns.${myPawnIdx}.position`] = finalPos;
        updateFields[`players.${room.turnIndex}.pawns.${myPawnIdx}.status`] = "ACTIVE";
        updateFields[`players.${oppIdx}.pawns.${targetPawnIdx}.position`] = -1;
        updateFields[`players.${oppIdx}.pawns.${targetPawnIdx}.status`] = "BASE";
      }

      else if (card.card_name === "SEVEN" && chosenMoveType === "SPLIT") {
        if (!splits) return;
        splits.forEach((s) => {
          const pNode = player.pawns.find(p => p.pawnId === s.pawnId);
          const updated = calculatePawnMove(pNode, { ...card, forward_steps: s.steps }, room.players.length, "FORWARD");
          let finalPos = updated.position;
          if (updated.status === "ACTIVE") finalPos = checkSlideAndKill(updated.position, pNode.startIndex);
          const pawnIndex = player.pawns.findIndex(p => p.pawnId === s.pawnId);
          updateFields[`players.${room.turnIndex}.pawns.${pawnIndex}.position`] = finalPos;
          updateFields[`players.${room.turnIndex}.pawns.${pawnIndex}.status`] = updated.status;
          if (updated.status === "HOME") player.homeCount = (player.homeCount || 0) + 1;
        });
        updateFields[`players.${room.turnIndex}.homeCount`] = player.homeCount;
      }

      else {
        let updated = calculatePawnMove(myPawn, card, room.players.length, chosenMoveType);
        if (updated.status === "ACTIVE") {
          updated.position = checkSlideAndKill(updated.position, myPawn.startIndex);
        }
        updateFields[`players.${room.turnIndex}.pawns.${myPawnIdx}.position`] = updated.position;
        updateFields[`players.${room.turnIndex}.pawns.${myPawnIdx}.status`] = updated.status;

        if (updated.status === "HOME") player.homeCount = (player.homeCount || 0) + 1;
        updateFields[`players.${room.turnIndex}.homeCount`] = player.homeCount;
      }

      // Turn logic and Win condition check
      updateFields["turnIndex"] = (room.turnIndex + 1) % room.players.length;

      const updatedRoom = await Room.findOneAndUpdate(
        { roomId },
        { $set: updateFields, $pop: { cards: -1 } },
        { new: true }
      );

      if (updatedRoom) {
        // 🏆 WIN CONDITION CHECK
        // User Request: 3 pawns at HOME (44) -> Winner -> Delete Room
        // Check current player's homeCount
        // const currentPlayer = updatedRoom.players[updatedRoom.turnIndex === 0 ? room.players.length - 1 : updatedRoom.turnIndex - 1]; // Previous turn was "current player" who just moved
        // Actually, turnIndex has already advanced in updateFields. So we need to check the player who JUST moved.
        // We know 'player' variable holds the data BEFORE the update, but we updated homeCount in DB.
        // Let's rely on the updatedRoom. find the player who moved.

        // Logic: TurnIndex increment ho chuka hai. So the player who moved is at (turnIndex - 1)
        let prevTurnIndex = updatedRoom.turnIndex - 1;
        if (prevTurnIndex < 0) prevTurnIndex = updatedRoom.players.length - 1;

        const winningPlayer = updatedRoom.players[prevTurnIndex];

        if (winningPlayer.homeCount >= 3) {
          console.log(`🏆 [WINNER] Player ${winningPlayer.name} has won! Deleting room...`);

          // 1. Set Winner locally for response
          updatedRoom.winner = winningPlayer.user_id;
          updatedRoom.status = "FINISHED";

          // 2. Emit Winner
          io.to(roomId).emit("gameStart", { room: updatedRoom });

          // 3. Delete Room from DB
          await Room.deleteOne({ roomId });

          // 4. Clean up memory
          waitingRooms.delete(updatedRoom.maxPlayers);
          // onlineUsers cleanup logic if needed...
          return; // Stop further processing (like Bot turn)
        }

        io.to(roomId).emit("gameStart", { room: updatedRoom });
        if (updatedRoom.players[updatedRoom.turnIndex].bot) handleBotTurn(roomId);
      }
    } catch (err) {
      console.error("Move Error:", err);
    }
  };
  io.on("connection", (socket) => {
    // console.log("connection",socket)

    socket.on("joinGame", async ({ user_id, maxPlayers, gamelobby_id }) => {
      try {
        // console.log("user_id", user_id)
        if (user_id != socket.verified_id) { // Yahan !== ki jagah != use karein testing ke liye
          // console.log("Mismatch detected!");
          return socket.emit("error", { message: "Unauthorized: ID mismatch detected!" });
        }
        const user = await User.findOne({ user_id }).lean();
        if (!user) return socket.emit("error", { message: "User not found" });
        socket.user_id = user_id;

        if (!waitingRooms.has(maxPlayers)) waitingRooms.set(maxPlayers, { players: [], timer: null });
        const roomData = waitingRooms.get(maxPlayers);
        if (roomData.players.find(p => p.user_id === user_id)) return;

        roomData.players.push({
          user_id: user.user_id,
          name: user.username,
          socketId: socket.id,
          avatar: user.avatar ? process.env.BASE_URL + getAvatarById(user.avatar) : null,
          bot: false
        });
        console.log("user.username",user.username)
        if (roomData.players.length === maxPlayers) {
          clearTimeout(roomData.timer);
          const room = await createRoom(roomData.players, generateShuffledDeck(await Card.find({})), maxPlayers);
          room.players.forEach(p => io.sockets.sockets.get(p.socketId)?.join(room.roomId));
          io.to(room.roomId).emit("gameStart", { room: getCleanRoom(room) });
          waitingRooms.delete(maxPlayers);
        }
        socket.emit("waiting", { joined: roomData.players.length, needed: maxPlayers });
        if (!roomData.timer) {
          roomData.timer = setTimeout(async () => {
            if (roomData.players.length >= maxPlayers) return;
            const count = await RandomUser.countDocuments();
            if (count === 0) return;

            while (roomData.players.length < maxPlayers) {
              const botDB = await RandomUser.findOne().skip(Math.floor(Math.random() * count)).lean();
              roomData.players.push({
                user_id: `bot_${Date.now()}_${roomData.players.length}`,
                name: botDB.username,
                avatar: botDB.avatar ? process.env.BASE_URL + getAvatarById(botDB.avatar) : null,
                bot: true
              });
            }

            const room = await createRoom(roomData.players, generateShuffledDeck(await Card.find({})), roomData.players.length);
            room.players.forEach(p => { if (!p.bot) io.sockets.sockets.get(p.socketId)?.join(room.roomId); });
            // console.log("room",room)
            io.to(room.roomId).emit("gameStart", { room: getCleanRoom(room) });
            if (room.players[room.turnIndex].bot) handleBotTurn(room.roomId);
            waitingRooms.delete(maxPlayers);
          }, 30000); // 30s wait
        }


      } catch (err) { console.error(err); }
    });

    socket.on("playCard", (data) => processPlayCard(data));

    socket.on("sendMessage", async ({ roomId, message }) => {
      const room = await Room.findOne({ roomId });
      if (!room) return;
      const sender = room.players.find(p => p.user_id === socket.user_id);
      const chatData = { sender_id: sender.user_id, sender_name: sender.name, message, createdAt: new Date() };
      const updatedRoom = await Room.findOneAndUpdate({ roomId }, { $push: { chat: chatData } }, { new: true });
      io.to(roomId).emit("receiveMessage", updatedRoom);
    });

    socket.on("reshuffleDeck", async ({ roomId }) => {
      const cards = await Card.find({});
      const updatedRoom = await Room.findOneAndUpdate({ roomId }, { $set: { cards: generateShuffledDeck(cards) } }, { new: true });
      io.to(roomId).emit("gameStart", { room: updatedRoom });
    });
  });
};