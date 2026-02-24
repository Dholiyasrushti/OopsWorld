const { Server } = require("socket.io");
const User = require("../Models/Users");
const RandomUser = require("../Models/RandomUser");
const Card = require("../Models/Card");
const Room = require("../Models/Room");
const GameWallet = require("../Models/GameWallet");
// const { getLimits } = require("../Constants/constants");
// const getAvatarById = require("../Utils/getAvatarById");
const { generateShuffledDeck } = require("../Utils/cardUtils");
const { createRoom } = require("../Room/Room");
const calculatePawnMove = require("../Pawns/calculatePawnMove");
const jwt = require("jsonwebtoken");
require("dotenv").config();

module.exports = (server) => {
  const io = new Server(server, {
    cors: { origin: "*" },
    pingTimeout: 60000,    // 60 seconds (Client response ka wait karega)
    pingInterval: 25000    // 25 seconds (Har 25 sec mein check karega)
  });
  io.use((socket, next) => {
    //   console.log("--- New Handshake Attempt ---");

    //   // 1. Check karein token mil raha hai ya nahi
    const token = socket.handshake.auth.token || socket.handshake.headers.token;
    //   console.log("Token status:", token ? "Token Received" : "Token is MISSING");

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
  const handleBotTurn = async (roomId) => {
    try {
      const room = await Room.findOne({ roomId });
      if (!room || room.status === "FINISHED") return;

      const currentPlayer = room.players.find(p => p.user_id.toString() === room.turnIndex.toString());
      if (!currentPlayer || !currentPlayer.bot) return;
      const isContinuingSeven = room.sevenSplitUsed > 0 && room.sevenSplitUsed < 7;

      // const initialDelay = isContinuingSeven ? 1000 : 4000;
      // ⏳ Turn start delay
      // setTimeout(async () => {
      // emitCardOpen(io, room, roomId);
      if (!isContinuingSeven) {
        emitCardOpen(io, room, roomId);
      }

      // ⏳ Card open delay
      setTimeout(async () => {
        const currentRoom = await Room.findOne({ roomId });
        if (!currentRoom || currentRoom.cards.length === 0) return;

        const card = currentRoom.cards[0];
        let bestMove = evaluateBestMove(currentRoom, currentPlayer, card);

        if (bestMove) {
          await processPlayCard({
            roomId,
            cardId: card._id.toString(),
            pawnId: bestMove.pawnId,
            chosenMoveType: bestMove.moveType,
            targetPawnId: bestMove.targetPawnId,
            targetUserId: bestMove.targetUserId,
            splits: bestMove.splits,
            isBot: true
          });
        }
      }, 3000);
      // }, 1000);

    } catch (err) {
      console.error("Bot AI Error:", err);
      if (typeof socket !== 'undefined' && socket.emit) {
        socket.emit("error", { message: "Internal server error: " + err.message });
      }
    }
  };
  const evaluateBestMove = (room, player, card) => {
    try {
      // Basic validation taaki undefined objects par loop na chale
      if (!room || !player || !card) {
        console.warn("evaluateBestMove: Missing parameters");
        return null;
      }

      let moves = [];
      const isFourPlayer = room.players.length === 4;
      const safetyEntrance = isFourPlayer ? 59 : 39;

      player.pawns.forEach((pawn, idx) => {
        try {
          if (pawn.status === "HOME") return;

          // --- 1. SORRY CARD ---
          if (card.card_name === "SORRY") {
            // SCENARIO A: BUMP (Agar pawn BASE mein hai)
            if (pawn.status === "BASE") {
              room.players.forEach(opp => {
                if (opp.user_id.toString() !== player.user_id.toString()) {
                  opp.pawns.forEach(oppPawn => {
                    if (oppPawn.status === "ACTIVE") {
                      moves.push({
                        pawnId: pawn.pawnId,
                        moveType: "BUMP",
                        targetPawnId: oppPawn.pawnId,
                        targetUserId: opp.user_id,
                        weight: 1000 // Sabse zyada priority
                      });
                    }
                  });
                }
              });
            }

            // SCENARIO B: FORWARD 4
            if (pawn.status === "ACTIVE" || pawn.status === "SAFETY") {
              let testMove = calculatePawnMove(pawn, { ...card, forward_steps: 4 }, room.players.length, "FORWARD");
              if (!testMove.error) {
                let weight = 45;
                if (testMove.status === "HOME") weight += 500;
                moves.push({ pawnId: pawn.pawnId, moveType: "FORWARD", weight: weight });
              }
            }
          }

          // --- 2. ELEVEN CARD ---
          else if (card.card_name === "ELEVEN") {
            if (pawn.status === "ACTIVE") {
              room.players.forEach(opp => {
                if (opp.user_id.toString() !== player.user_id.toString()) {
                  opp.pawns.forEach(oppPawn => {
                    if (oppPawn.status === "ACTIVE") {
                      let weight = (oppPawn.position > pawn.position) ? 150 : 40;
                      moves.push({
                        pawnId: pawn.pawnId,
                        moveType: "SWAP",
                        targetPawnId: oppPawn.pawnId,
                        targetUserId: opp.user_id,
                        weight: weight
                      });
                    }
                  });
                }
              });
            }

            let testMove = calculatePawnMove(pawn, card, room.players.length, "FORWARD");
            if (!testMove.error) {
              let weight = 60;
              if (testMove.status === "HOME") weight += 500;
              moves.push({ pawnId: pawn.pawnId, moveType: "FORWARD", weight: weight });
            }
          }
          // --- 3. SEVEN CARD ---
          else if (card.card_name === "SEVEN") {
            const used = room.sevenSplitUsed || 0;
            const remainingTotal = 7 - used;
            const movablePawns = player.pawns.filter(p => p.status !== "HOME");
            const lastMovedPawn = player.pawns.find(p => p.isMove === true);
            const lastPawnId = lastMovedPawn ? lastMovedPawn.pawnId : null;

            movablePawns.forEach((p) => {
              if (used > 0) {
                // Scenario: Split already started, moving the last part
                let testMove = calculatePawnMove(p, { ...card, forward_steps: remainingTotal }, room.players.length, "FORWARD", player); // Added player for self-block check

                if (!testMove.error) {
                  let weight = 900;
                  if (lastPawnId !== null && p.pawnId === lastPawnId) weight = 500;
                  moves.push({
                    pawnId: p.pawnId,
                    moveType: "SPLIT",
                    splits: [{ pawnId: p.pawnId, steps: remainingTotal }],
                    weight: weight
                  });
                }
              } else {
                // Scenario: First move of the Seven split
                for (let i = 1; i <= 7; i++) {
                  // calculatePawnMove internally check karega ki destination par apna pawn toh nahi
                  let firstMove = calculatePawnMove(p, { ...card, forward_steps: i }, room.players.length, "FORWARD", player);

                  if (!firstMove.error) {
                    let weight = 50 + i;
                    if (firstMove.status === "HOME") weight += 500;

                    if (i < 7) {
                      const remaining = 7 - i;
                      const otherPawns = movablePawns.filter(op => op.pawnId !== p.pawnId);
                      let canCompleteSplit = false;

                      otherPawns.forEach(otherPawn => {
                        // Check if the second pawn can move the remaining steps without being blocked
                        let secondMove = calculatePawnMove(otherPawn, { ...card, forward_steps: remaining }, room.players.length, "FORWARD", player);
                        if (!secondMove.error) {
                          canCompleteSplit = true;
                          if (secondMove.status === "HOME") weight += 400;
                        }
                      });

                      if (canCompleteSplit) {
                        weight += 200;
                        // 💡 LOGIC: Agar steps aise hain jo block nahi kar rahe, toh is combination ko add karein
                        moves.push({
                          pawnId: p.pawnId,
                          moveType: "SPLIT",
                          splits: [{ pawnId: p.pawnId, steps: i }],
                          weight: weight
                        });
                      }
                    } else {
                      // Move full 7 steps with one pawn
                      moves.push({ pawnId: p.pawnId, moveType: "SPLIT", splits: [{ pawnId: p.pawnId, steps: 7 }], weight: weight });
                    }
                  }
                }
              }
            });
          }

          // --- 4. TEN CARD ---
          else if (card.card_name === "TEN") {
            if (pawn.status === "ACTIVE" || pawn.status === "SAFETY") {
              // let testMoveForward = calculatePawnMove(pawn, card, room.players.length, "FORWARD");
              let testMoveForward = calculatePawnMove(pawn, card, room.players.length, "FORWARD", player); // added player
              if (!testMoveForward.error) {
                let weight = 60;
                if (testMoveForward.status === "HOME") weight += 200;
                moves.push({ pawnId: pawn.pawnId, moveType: "FORWARD", weight: weight });
              }
              // let testMoveBackward = calculatePawnMove(pawn, card, room.players.length, "BACKWARD");
              let testMoveBackward = calculatePawnMove(pawn, card, room.players.length, "BACKWARD", player); // added player
              if (!testMoveBackward.error) {
                let backWeight = (pawn.position < 5) ? 110 : 20;
                moves.push({ pawnId: pawn.pawnId, moveType: "BACKWARD", weight: backWeight });
              }
            } else {
              let testMoveForward = calculatePawnMove(pawn, card, room.players.length, "FORWARD", player); // added player
              if (!testMoveForward.error) {
                let weight = 60;
                if (testMoveForward.status === "HOME") weight += 200;
                moves.push({ pawnId: pawn.pawnId, moveType: "FORWARD", weight: weight });
              }
            }
          }

          // --- 5. GENERAL / NORMAL CARDS ---
          else {
            // let testMove = calculatePawnMove(pawn, card, room.players.length, card.move_type || "FORWARD");
            let testMove = calculatePawnMove(pawn, card, room.players.length, card.move_type || "FORWARD", player); // added player
            if (!testMove.error) {
              let weight = 10;
              if (testMove.status === "HOME") weight += 500;
              else if (pawn.status === "BASE" && testMove.status === "ACTIVE") weight += 100;
              else {
                if (pawn.status === "ACTIVE") weight += 30;
                if (pawn.status === "SAFETY") weight += 40;
                if (pawn.position > (safetyEntrance - 10)) weight += 50;
              }
              moves.push({
                pawnId: pawn.pawnId,
                moveType: card.move_type || "FORWARD",
                weight: weight
              });
            }
          }
        } catch (pawnIterationError) {
          console.error(`Error evaluating move for pawn index ${idx}:`, pawnIterationError.message);
        }
      });

      // Best move select karein
      if (moves.length > 0) {
        moves.sort((a, b) => b.weight - a.weight);
        return moves[0];
      }
      return null;

    } catch (error) {
      console.error("CRITICAL ERROR in evaluateBestMove:", error.message);
      return null;
    }
  };



  const getCleanRoom = (fullRoom) => {
    return {
      roomId: fullRoom.roomId,
      maxPlayers: fullRoom.maxPlayers,
      status: fullRoom.status,
      turnIndex: fullRoom.turnIndex,
      winner: fullRoom.winner,
      chosenMoveType: fullRoom.chosenMoveType,
      fultimer: 30,
      alertTimer: 20,
      autocardpicktimer: 25,
      autoplaycardTimer: 22,
      players: fullRoom.players.map(p => ({
        user_id: p.user_id,
        name: p.name,
        bot: p.bot,
        avatar: p.avatar,
        homeCount: p.homeCount || 0,
        cosmetic: p.cosmetic,
        cosmetic_value: p.cosmetic_value,
        pawns: p.pawns.map(pawn => ({
          pawnId: pawn.pawnId,
          position: pawn.position,
          status: pawn.status,
          startIndex: pawn.startIndex,
          isMove: pawn.isMove,
          isSlider: pawn.isSlider,
          baseposition: pawn.baseposition
        }))
      }))
    };
  };

  const emitCardOpen = async (io, roomdata, roomId) => {
    try {
      let currentRoomState = roomdata;

      // 1. Deck Re-shuffle logic
      if (!roomdata?.cards || roomdata?.cards.length === 0) {
        const cards = await Card.find({});
        currentRoomState = await Room.findOneAndUpdate(
          { roomId },
          { $set: { cards: generateShuffledDeck(cards) } },
          { new: true }
        );
      }

      const openedCard = currentRoomState.cards[0];

      // 2. Reset Pawns State (isMove/isSlider reset)
      // Hum direct update use karenge taaki extra findOne na karna pade
      const room = await Room.findOneAndUpdate(
        { roomId },
        {
          $set: {
            "players.$[].pawns.$[].isMove": false,
            "players.$[].pawns.$[].isSlider": false
          }
        },
        { new: true }
      );

      if (!room) return;

      const currentPlayer = room.players.find(
        (p) => p.user_id.toString() === room.turnIndex.toString()
      );

      // 3. Emit Card Open Event
      io.to(room.roomId).emit("cardOpen", {
        user_id: currentPlayer ? currentPlayer.user_id : room.turnIndex,
        card: {
          card_id: openedCard._id,
          card_name: openedCard.card_name,
          card_value: openedCard.card_value,
          move_type: openedCard.move_type,
          forward_steps: openedCard.forward_steps,
          backward_steps: openedCard.backward_steps,
          is_split: openedCard.is_split,
          is_swap: openedCard.is_swap,
          description: openedCard.description
        }
      });

      // 4. CHECK VALID MOVES (Including Self-Blocking)
      let canMove = false;
      const playerCount = room.players.length;

      if (currentPlayer) {
        const activePawns = currentPlayer.pawns.filter(p => p.status !== "HOME");

        for (let pawn of activePawns) {
          // 💡 CHANGE: Passing 'currentPlayer' here
          let moveResult = calculatePawnMove(pawn, openedCard, playerCount, null, currentPlayer);

          if (!moveResult.error) {
            canMove = true;
            break;
          }
        }
      }

      // 5. AUTO SKIP LOGIC
      if (!canMove) {
        console.log(`User ${room.turnIndex} has no valid moves. Auto-skipping in 3s...`);

        setTimeout(async () => {
          try {
            const freshRoom = await Room.findOne({ roomId });
            if (!freshRoom) return;

            const currentIndex = freshRoom.players.findIndex(
              (p) => p.user_id.toString() === freshRoom.turnIndex.toString()
            );

            // const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % freshRoom.players.length;
            let nextIndex = (currentIndex + 1) % freshRoom.players.length;
            let checkCount = 0;

            // Jab tak player hasLeft ho ya rank mil chuki ho, tab tak skip karo
            while (
              (freshRoom.players[nextIndex].hasLeft || freshRoom.players[nextIndex].rank) &&
              checkCount < freshRoom.players.length
            ) {
              nextIndex = (nextIndex + 1) % freshRoom.players.length;
              checkCount++;
            }
            const nextPlayerId = freshRoom.players[nextIndex].user_id;

            const updatedRoom = await Room.findOneAndUpdate(
              { roomId },
              {
                $set: {
                  turnIndex: nextPlayerId,
                  sevenSplitUsed: 0,
                  "players.$[].pawns.$[].isMove": false,
                  "players.$[].pawns.$[].isSlider": false
                },
                $pop: { cards: -1 }
              },
              { new: true }
            ).lean();

            const movingPlayerId = freshRoom.turnIndex;

            io.to(roomId).emit("playCard", {
              room: {
                ...getCleanRoom(updatedRoom),
                movingPlayerId: movingPlayerId
              }
            });

            io.to(roomId).emit("userTurn", {
              turnIndex: updatedRoom.turnIndex,
              room: getCleanRoom(updatedRoom),
              fultimer: 30,
              alertTimer: 20,
              autocardpicktimer: 25,
              autoplaycardTimer: 22
            });

            // Bot check for next turn
            const nextPlayer = updatedRoom.players.find(
              (p) => p.user_id.toString() === updatedRoom.turnIndex.toString()
            );

            if (nextPlayer && nextPlayer.bot) {
              setTimeout(() => {
                handleBotTurn(roomId);
              }, 2000);
            }
          } catch (innerErr) {
            console.error("Error in emitCardOpen setTimeout:", innerErr);
          }
        }, 3000);
      }
    } catch (err) {
      console.error("CRITICAL ERROR in emitCardOpen:", err);
      if (typeof socket !== 'undefined' && socket.emit) {
        socket.emit("error", { message: "Internal server error: " + err.message });
      }
      // socket.emit("error", { message: "Internal server error: " + err.message });
    }
  };
  const processPlayCard = async (data) => {
    const { roomId, cardId, pawnId, chosenMoveType, targetPawnId, targetUserId, splits } = data;

    try {
      const room = await Room.findOne({ roomId });
      if (!room) return;

      const currentPlayerIndex = room.players.findIndex(p => p.user_id.toString() === room.turnIndex.toString());
      const player = room.players[currentPlayerIndex];
      const card = room.cards.find(c => c._id.toString() === cardId);

      const isFourPlayer = room.players.length === 4;
      const totalCells = isFourPlayer ? 60 : 40;
      const safetyThreshold = isFourPlayer ? 58 : 38;
      const safetyEntrance = isFourPlayer ? 59 : 39;

      const getGlobal = (localPos, startIdx) => {
        if (localPos === -1) return -100;
        if (localPos > safetyThreshold) return 1000 + localPos;
        return (localPos + startIdx) % totalCells;
      };

      const getLocal = (globalPos, startIdx) => {
        if (globalPos === -100) return -1;
        if (globalPos > 1000) return globalPos - 1000;
        let local = (globalPos - startIdx + totalCells) % totalCells;
        if (local === safetyEntrance) return safetyEntrance + 1;
        return local;
      };

      let updateFields = {};
      let shouldUpdateTurn = true;
      let shouldPopCard = true;

   

      // currentUserId add kiya taaki pata chale ki moving player kaun hai
      const handleKilling = (myLocalPos, myStartIdx, currentMovingPawnId, currentUserId, isSliderMove = false) => {
        const myGlobal = getGlobal(myLocalPos, myStartIdx);

        room.players.forEach((playerObj, playerIdx) => {
          // Player ID ko string mein convert karke check karein
          console.log("playerObj.user_id-- ", playerObj.user_id.toString(), "--currentUserId -", currentUserId.toString(), " - --isSliderMove- ", isSliderMove)
          const isSamePlayer = playerObj.user_id.toString() === currentUserId.toString();

          // AGAR Slider nahi hai aur player SAME hai, to skip karein (Friendly fire off)
          if (!isSliderMove && isSamePlayer) return;

          playerObj.pawns.forEach((targetPawn, pIdx) => {
            // 1. Target ACTIVE hona chahiye
            // 2. Wo wahi pawn nahi hona chahiye jo move kar raha hai
            // if (targetPawn.status === "ACTIVE" && targetPawn.pawnId.toString() !== currentMovingPawnId.toString()) {
            if (targetPawn.status === "ACTIVE") {

              const targetGlobal = getGlobal(targetPawn.position, targetPawn.startIndex);

              if (targetGlobal == myGlobal) {
                console.log(`Killing: Player ${playerIdx} Pawn ${pIdx} bumped to BASE`);

                updateFields[`players.${playerIdx}.pawns.${pIdx}.position`] = -1;
                updateFields[`players.${playerIdx}.pawns.${pIdx}.status`] = "BASE";
                updateFields[`players.${playerIdx}.pawns.${pIdx}.isMove`] = true;
                updateFields[`players.${playerIdx}.pawns.${pIdx}.isSlider`] = false;

                targetPawn.position = -1;
                targetPawn.status = "BASE";
              }
            }
          });
        });
      };
      const checkSlideAndKill = (pos, startIdx, movingPawnId, currentUserId) => {
        let finalPos = pos;
        let slideSteps = 0;

        if (!isFourPlayer) {
          const slidePoints2P = [7, 12, 17, 22, 27, 32];
          if (slidePoints2P.includes(pos)) slideSteps = 3;
        } else {
          const slidePoints4P = { 12: 3, 20: 4, 27: 3, 35: 4, 43: 3, 50: 4 };
          if (slidePoints4P[pos]) slideSteps = slidePoints4P[pos];
        }

        const slided = slideSteps > 0;

        if (slided) {
          finalPos = pos + slideSteps;
          // Slider hai: Loop chalega aur isSliderMove = true bhejenge
          for (let i = pos; i <= finalPos; i++) {
            handleKilling(i, startIdx, movingPawnId, currentUserId, true);
          }
        } else {
          // Slider nahi hai: Normal landing, isSliderMove = false bhejenge
          handleKilling(pos, startIdx, movingPawnId, currentUserId, false);
        }

        return { finalPos, slided };
      };
      const myPawnIdx = player.pawns.findIndex(p => p.pawnId === Number(pawnId));
      const myPawn = player.pawns[myPawnIdx];

      // --- MOVE EXECUTION ---

      // 1. ELEVEN SWAP
      if (card?.card_name === "ELEVEN" && chosenMoveType === "SWAP") {
        const oppIdx = room.players.findIndex(p => p.user_id.toString() === targetUserId);
        const opponent = room.players[oppIdx];
        const targetPawnIdx = opponent.pawns.findIndex(p => p.pawnId === targetPawnId);
        const targetPawn = opponent.pawns[targetPawnIdx];

        const myGlobal = getGlobal(myPawn.position, myPawn.startIndex);
        const oppGlobal = getGlobal(targetPawn.position, targetPawn.startIndex);

        let myNewLocal = getLocal(oppGlobal, myPawn.startIndex);
        let oppNewLocal = getLocal(myGlobal, targetPawn.startIndex);

        const myNewStatus = (myNewLocal === -1) ? "BASE" : (myNewLocal > safetyThreshold ? "SAFETY" : "ACTIVE");
        const oppNewStatus = (oppNewLocal === -1) ? "BASE" : (oppNewLocal > safetyThreshold ? "SAFETY" : "ACTIVE");

        let myIsSlider = false;
        let oppIsSlider = false;

        if (myNewStatus === "ACTIVE") {
          updateFields[`players.${currentPlayerIndex}.pawns.${myPawnIdx}.baseposition`] = myNewLocal;
          console.log("ELEVEN My -------------- myNewLocal, myPawn.startIndex, pawnId, player.user_id", myNewLocal, myPawn.startIndex, pawnId, player.user_id)
          const res = checkSlideAndKill(myNewLocal, myPawn.startIndex, pawnId, player.user_id);
          myNewLocal = res.finalPos;
          myIsSlider = res.slided;
        }
        if (oppNewStatus === "ACTIVE") {
          updateFields[`players.${oppIdx}.pawns.${targetPawnIdx}.baseposition`] = oppNewLocal;
          console.log("ELEVEN Oop -------------- oppNewLocal, targetPawn.startIndex, pawnId, targetUserId", oppNewLocal, targetPawn.startIndex, pawnId, targetUserId)
          const res = checkSlideAndKill(oppNewLocal, targetPawn.startIndex, pawnId, targetUserId);
          oppNewLocal = res.finalPos;
          oppIsSlider = res.slided;
        }

        updateFields[`players.${currentPlayerIndex}.pawns.${myPawnIdx}.position`] = myNewLocal;
        updateFields[`players.${currentPlayerIndex}.pawns.${myPawnIdx}.status`] = myNewStatus;
        updateFields[`players.${currentPlayerIndex}.pawns.${myPawnIdx}.isMove`] = true;
        updateFields[`players.${currentPlayerIndex}.pawns.${myPawnIdx}.isSlider`] = myIsSlider;

        updateFields[`players.${oppIdx}.pawns.${targetPawnIdx}.position`] = oppNewLocal;
        updateFields[`players.${oppIdx}.pawns.${targetPawnIdx}.status`] = oppNewStatus;
        updateFields[`players.${oppIdx}.pawns.${targetPawnIdx}.isMove`] = true;
        updateFields[`players.${oppIdx}.pawns.${targetPawnIdx}.isSlider`] = oppIsSlider;
      }

      // 2. SORRY BUMP
      else if (card?.card_name === "SORRY" && chosenMoveType === "BUMP") {
        const oppIdx = room.players.findIndex(p => p.user_id.toString() === targetUserId);
        const opponent = room.players[oppIdx];
        const targetPawnIdx = opponent.pawns.findIndex(p => p.pawnId === targetPawnId);
        const targetPawn = opponent.pawns[targetPawnIdx];

        const targetGlobal = getGlobal(targetPawn.position, targetPawn.startIndex);
        let myNewLocal = getLocal(targetGlobal, myPawn.startIndex);

        // const res = checkSlideAndKill(myNewLocal, myPawn.startIndex, pawnId);
        // SORRY BUMP Section mein:
        updateFields[`players.${currentPlayerIndex}.pawns.${myPawnIdx}.baseposition`] = myNewLocal;
        console.log("Soory  ------------------  myNewLocal, myPawn.startIndex, pawnId, player.user_id", myNewLocal, myPawn.startIndex, pawnId, player.user_id)
        const res = checkSlideAndKill(myNewLocal, myPawn.startIndex, pawnId, player.user_id);
        myNewLocal = res.finalPos;

        updateFields[`players.${currentPlayerIndex}.pawns.${myPawnIdx}.position`] = myNewLocal;
        updateFields[`players.${currentPlayerIndex}.pawns.${myPawnIdx}.status`] = "ACTIVE";
        updateFields[`players.${currentPlayerIndex}.pawns.${myPawnIdx}.isMove`] = true;
        updateFields[`players.${currentPlayerIndex}.pawns.${myPawnIdx}.isSlider`] = res.slided;

        updateFields[`players.${oppIdx}.pawns.${targetPawnIdx}.position`] = -1;
        updateFields[`players.${oppIdx}.pawns.${targetPawnIdx}.status`] = "BASE";
        updateFields[`players.${oppIdx}.pawns.${targetPawnIdx}.isMove`] = true;
        updateFields[`players.${oppIdx}.pawns.${targetPawnIdx}.isSlider`] = false;
      }

      // 3. SEVEN SPLIT
      else if (card?.card_name === "SEVEN" && chosenMoveType === "SPLIT") {
        if (!splits || splits.length === 0) return;

        let currentUsedSteps = room.sevenSplitUsed || 0;
        let moveSteps = splits[0].steps;
        let newTotalUsed = currentUsedSteps + moveSteps;
        if (newTotalUsed > 7) return;

        const targetPawn = player.pawns.find(p => p.pawnId === splits[0].pawnId);
        const tIdx = player.pawns.findIndex(p => p.pawnId === splits[0].pawnId);

        let updated = calculatePawnMove(targetPawn, { ...card, forward_steps: moveSteps }, room.players.length, "FORWARD");

        if (updated.error) return io.to(roomId).emit("error", { message: updated.error, pawnId: pawnId });

        let slided = false;
        if (updated.status === "ACTIVE") {
          console.log("sru pawnId", pawnId, "player.user_id", player.user_id)
          updateFields[`players.${currentPlayerIndex}.pawns.${tIdx}.baseposition`] = updated.position;
          console.log("seven  -------------------   updated.position, targetPawn.startIndex, pawnId, player.user_id", updated.position, targetPawn.startIndex, pawnId, player.user_id)
          const res = checkSlideAndKill(updated.position, targetPawn.startIndex, pawnId, player.user_id);
          updated.position = res.finalPos; // FIX: Assigning number, not object
          slided = res.slided;
        }

        player.pawns.forEach((p, index) => {
          updateFields[`players.${currentPlayerIndex}.pawns.${index}.isMove`] = false;
          updateFields[`players.${currentPlayerIndex}.pawns.${index}.isSlider`] = false;
        });

        updateFields[`players.${currentPlayerIndex}.pawns.${tIdx}.position`] = updated.position;
        updateFields[`players.${currentPlayerIndex}.pawns.${tIdx}.status`] = updated.status;
        updateFields[`players.${currentPlayerIndex}.pawns.${tIdx}.isMove`] = true;
        updateFields[`players.${currentPlayerIndex}.pawns.${tIdx}.isSlider`] = slided;

        if (updated.status === "HOME") player.homeCount = (player.homeCount || 0) + 1;
        updateFields[`players.${currentPlayerIndex}.homeCount`] = player.homeCount;

        if (newTotalUsed < 7) {
          shouldUpdateTurn = false;
          shouldPopCard = false;
          updateFields["sevenSplitUsed"] = newTotalUsed;
        } else {
          updateFields["sevenSplitUsed"] = 0;
        }
      }

      // 4. NORMAL MOVE
      else {
        let updated = calculatePawnMove(myPawn, card, room.players.length, chosenMoveType);
        if (updated.error) return io.to(roomId).emit("error", { message: updated.error, pawnId: pawnId });

        let slided = false;
        if (updated.status === "ACTIVE") {
          // const res = checkSlideAndKill(updated.position, myPawn.startIndex);
          updateFields[`players.${currentPlayerIndex}.pawns.${myPawnIdx}.baseposition`] = updated.position;
          console.log("noraml  -----------------   updated.position, myPawn.startIndex, pawnId, player.user_id", updated.position, myPawn.startIndex, pawnId, player.user_id)
          const res = checkSlideAndKill(updated.position, myPawn.startIndex, pawnId, player.user_id);
          updated.position = res.finalPos; // FIX: Assigning number, not object
          slided = res.slided;
        }

        updateFields[`players.${currentPlayerIndex}.pawns.${myPawnIdx}.position`] = updated.position;
        updateFields[`players.${currentPlayerIndex}.pawns.${myPawnIdx}.status`] = updated.status;
        updateFields[`players.${currentPlayerIndex}.pawns.${myPawnIdx}.isMove`] = true;
        updateFields[`players.${currentPlayerIndex}.pawns.${myPawnIdx}.isSlider`] = slided;

        if (updated.status === "HOME") player.homeCount = (player.homeCount || 0) + 1;
        updateFields[`players.${currentPlayerIndex}.homeCount`] = player.homeCount;
      }

      // --- TURN LOGIC & DB SYNC ---
      if (shouldUpdateTurn) {
        // const nextIndex = (currentPlayerIndex + 1) % room.players.length;

        let nextIndex = (currentPlayerIndex + 1) % room.players.length;
        let checkCount = 0;

        // 🔄 Skip players who have left or already finished (rank)
        while ((room.players[nextIndex].hasLeft) && checkCount < room.players.length) {
          nextIndex = (nextIndex + 1) % room.players.length;
          checkCount++;
        }
        updateFields["turnIndex"] = room.players[nextIndex].user_id;
        updateFields["chosenMoveType"] = chosenMoveType;
      }
      // console.log("sru  chosenMoveType", chosenMoveType)
      updateFields["chosenMoveType"] = chosenMoveType;
      const queryObj = { $set: updateFields };
      if (shouldPopCard) queryObj.$pop = { cards: -1 };

      const updatedRoom = await Room.findOneAndUpdate({ roomId }, queryObj, { new: true });

      if (updatedRoom) {
        const activePlayerAfterMove = updatedRoom.players.find(p => p.user_id.toString() === updatedRoom.turnIndex.toString());
        const activePlayerAfterMoveIdx = updatedRoom.players.findIndex(p => p.user_id.toString() === updatedRoom.turnIndex.toString());

        const checkIdx = shouldUpdateTurn ?
          (activePlayerAfterMoveIdx - 1 < 0 ? updatedRoom.players.length - 1 : activePlayerAfterMoveIdx - 1) :
          activePlayerAfterMoveIdx;

        const winningPlayer = updatedRoom.players[checkIdx];

        if (winningPlayer.homeCount >= 3) {
          updatedRoom.winner = winningPlayer.user_id;
          updatedRoom.status = "FINISHED";
          // io.to(roomId).emit("playCard", { room: getCleanRoom(updatedRoom) });
          const movingPlayerId = room.turnIndex;

          io.to(roomId).emit("playCard", {
            room: {
              ...getCleanRoom(updatedRoom), // Purana room data fetch karein
              movingPlayerId: movingPlayerId // Room ke andar move karne wale ki ID add kar di
            }
          });
          return;
        }


        // io.to(roomId).emit("playCard", { room: getCleanRoom(updatedRoom) });
        const movingPlayerId = room.turnIndex;

        io.to(roomId).emit("playCard", {
          room: {
            ...getCleanRoom(updatedRoom), // Purana room data fetch karein
            movingPlayerId: movingPlayerId // Room ke andar move karne wale ki ID add kar di
          }
        });
      }

    } catch (err) {
      console.error("Move Error:", err);
      socket.emit("error", { message: "Internal server error: " + err.message });
    }
  };
  async function calculateAndDistributePrize(room, io) {
    try {
      // GameLobby se prize details nikaalein
      const lobby = await GameWallet.findById(room.gamelobby_id);
      if (!lobby) return;

      const totalPrizeCoins = lobby.coinsWon;
      const totalPrizeTrophies = lobby.trophiesWon;

      // Sirf us player ko dhundein jiski rank 1 hai (Winner)
      const winner = room.players.find(p => p.rank === 1);

      if (winner) {
        // 1. Player object mein reward set karein (taaki frontend ko dikhe)
        winner.rewardCoins = totalPrizeCoins;
        winner.rewardTrophies = totalPrizeTrophies;

        // 2. Database mein coins aur trophies PLUS (+) karein
        if (!winner.bot) {
          await User.updateOne(
            { user_id: winner.user_id },
            {
              $inc: {
                coins: totalPrizeCoins,
                trophies: totalPrizeTrophies
              }
            }
          );
          console.log(`Prize Added: ${totalPrizeCoins} coins to ${winner.name}`);
        }
      }

      // Baki players ke liye rewards 0 set karein taaki undefined na aaye
      room.players.forEach(p => {
        if (p.rank !== 1) {
          p.rewardCoins = 0;
          p.rewardTrophies = 0;
        }
      });

    } catch (err) {
      console.error("Prize Distribution Error:", err);
    }
  }
  io.on("connection", (socket) => {

    socket.on("joinGame", async ({ user_id, maxPlayers, gamelobby_id }) => {
      try {
        if (user_id != socket.verified_id) {
          return socket.emit("error", { message: "Unauthorized!" });
        }
        // console.log("user_id",user_id)
        const user = await User.findOne({ user_id }).lean();
        const lobby = await GameWallet.findById(gamelobby_id).lean();

        if (!user || !lobby) return socket.emit("error", { message: "Data not found" });

        const entryFee = lobby.entryCoinsUsed;
        const diamondFee = lobby.diamondsWon || 0; // Check your schema for diamond field name

        if (user.coins < entryFee) {
          return socket.emit("error", { message: "Insufficient coins!" });
        }

        // --- Lobby-wise Room Logic ---
        // Unique key banayein: "2_lobbyID123"
        const roomKey = `${maxPlayers}_${gamelobby_id}`;

        if (!waitingRooms.has(roomKey)) {
          waitingRooms.set(roomKey, { players: [], timer: null });
        }

        const roomData = waitingRooms.get(roomKey);

        // Duplicate join check
        if (roomData.players.find(p => p.user_id === user_id)) return;

        roomData.players.push({
          user_id: user.user_id,
          name: user.username,
          socketId: socket.id,
          avatar: user.avatar,
          cosmetic: user.cosmetic,
          cosmetic_value: user.cosmetic_value,
          bot: false
        });

        // Helper: Sab real players ke paise katne ke liye
        const processDeduction = async (playersList) => {
          const realPlayers = playersList.filter(p => !p.bot);
          const userIds = realPlayers.map(p => p.user_id);

          // Bulk update for all real players in the room
          await User.updateMany(
            { user_id: { $in: userIds } },
            { $inc: { coins: -entryFee, diamonds: -diamondFee } }
          );
        };



        if (roomData.players.length === maxPlayers) {

          clearTimeout(roomData.timer);[]

          socket.emit("waiting", { joined: roomData.players.length, needed: maxPlayers });

          const room = await createRoom(roomData.players, generateShuffledDeck(await Card.find({})), maxPlayers);

          // Join Socket Room
          room.players.forEach(p => io.sockets.sockets.get(p.socketId)?.join(room.roomId));

          // Start Game
          setTimeout(() => {
            io.to(room.roomId).emit("gameStart", { room: getCleanRoom(room) });
          }, 15000); // 15000 ms = 15 seconds

          // Paise deduct karein
          await processDeduction(room.players);

          waitingRooms.delete(roomKey);
          return;
        }
        // console.log("player 1 user_id", user_id)
        socket.emit("waiting", { joined: roomData.players.length, needed: maxPlayers });

        // Case 2: Timer start (if first player)
        if (!roomData.timer) {
          roomData.timer = setTimeout(async () => {
            const currentRoomData = waitingRooms.get(roomKey);
            if (!currentRoomData || currentRoomData.players.length >= maxPlayers) return;

            // Bot filling logic
            const count = await RandomUser.countDocuments();
            while (currentRoomData.players.length < maxPlayers) {
              const botDB = await RandomUser.findOne().skip(Math.floor(Math.random() * count)).lean();
              currentRoomData.players.push({
                user_id: `bot_${botDB._id}`,
                name: botDB.username,
                avatar: botDB.avatar,
                cosmetic: botDB.cosmetic,
                cosmetic_value: botDB.cosmetic_value,
                bot: true
              });
            }

            const room = await createRoom(currentRoomData.players, generateShuffledDeck(await Card.find({})), maxPlayers);
            room.players.forEach(p => { if (!p.bot) io.sockets.sockets.get(p.socketId)?.join(room.roomId); });

            io.to(room.roomId).emit("gameStart", { room: getCleanRoom(room) });
            // 1. turnIndex (ID) ke zariye player dhoondo
            const currentPlayer = room.players.find(
              (p) => p.user_id.toString() === room.turnIndex.toString()
            );

            // 2. Agar player mil gaya aur wo bot hai, toh function call karo
            if (currentPlayer && currentPlayer.bot) {
              handleBotTurn(room.roomId);
            }

            // Paise deduct karein
            await processDeduction(room.players);

            waitingRooms.delete(roomKey);
          }, 10000);
        }

      } catch (err) {
        console.error(err);
      }
    });
   
    socket.on("cardOpen", async ({ user_id, roomId }) => {
      try {
        // 1. Reset Pawns State (isMove/isSlider reset) aur Room fetch
        // Hum direct findOneAndUpdate use kar rahe hain taaki extra database call na karni pade
        const room = await Room.findOneAndUpdate(
          { roomId },
          {
            $set: {
              "players.$[].pawns.$[].isMove": false,
              "players.$[].pawns.$[].isSlider": false
            }
          },
          { new: true }
        );

        if (!room) return socket.emit("error", { message: "Room not found" });

        const currentPlayer = room.players.find(
          (p) => p.user_id.toString() === room.turnIndex.toString()
        );

        // Turn validation
        if (!currentPlayer || currentPlayer.user_id.toString() !== user_id.toString()) {
          return socket.emit("error", { message: "It's not your turn!" });
        }

        // 2. CHECK DECK & RE-SHUFFLE
        let currentRoomState = room;
        if (!room.cards || room.cards.length === 0) {
          console.log("Deck empty! Re-shuffling...");
          const cards = await Card.find({});
          currentRoomState = await Room.findOneAndUpdate(
            { roomId },
            { $set: { cards: generateShuffledDeck(cards) } },
            { new: true }
          );
        }

        const openedCard = currentRoomState.cards[0];

        // 3. Emit Card Open (Sabko card dikhao)
        io.to(roomId).emit("cardOpen", {
          user_id: user_id,
          card: openedCard
        });

        // 4. CHECK VALID MOVES (Including Self-Blocking)
        let canMove = false;
        const playerCount = currentRoomState.players.length;

        // Pawns filter karein jo abhi tak HOME nahi pahunche hain
        const activePawns = currentPlayer.pawns.filter(p => p.status !== "HOME");

        for (let pawn of activePawns) {
          /** * 💡 CHANGE: 'currentPlayer' pass kiya gaya hai taaki calculatePawnMove 
           * check kar sake ki landing position par apna hi doosra pawn toh nahi hai.
           */
          let moveResult = calculatePawnMove(pawn, openedCard, playerCount, null, currentPlayer);

          // Agar error nahi hai, matlab valid move mil gayi
          if (!moveResult.error) {
            canMove = true;
            break;
          }
        }

        // 5. AUTO SKIP LOGIC
        if (!canMove) {
          console.log(`User ${user_id} has no valid moves with card ${openedCard.card_name}. Skipping in 4s...`);

          setTimeout(async () => {
            try {
              // Room data fresh fetch karein
              const freshRoom = await Room.findOne({ roomId });
              if (!freshRoom) return;

              const currentIndex = freshRoom.players.findIndex(
                (p) => p.user_id.toString() === freshRoom.turnIndex.toString()
              );

              // Next player index calculate karein
              // const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % freshRoom.players.length;
              let nextIndex = (currentIndex + 1) % freshRoom.players.length;
              let checkCount = 0;

              // Jab tak player hasLeft ho ya rank mil chuki ho, tab tak skip karo
              while (
                (freshRoom.players[nextIndex].hasLeft || freshRoom.players[nextIndex].rank) &&
                checkCount < freshRoom.players.length
              ) {
                nextIndex = (nextIndex + 1) % freshRoom.players.length;
                checkCount++;
              }

              const nextPlayerId = freshRoom.players[nextIndex].user_id;

              // Update DB: Turn badlein aur pehla card remove karein
              const updatedRoom = await Room.findOneAndUpdate(
                { roomId },
                {
                  $set: {
                    turnIndex: nextPlayerId,
                    sevenSplitUsed: 0,
                    "players.$[].pawns.$[].isMove": false,
                    "players.$[].pawns.$[].isSlider": false
                  },
                  $pop: { cards: -1 }
                },
                { new: true }
              ).lean();

              const movingPlayerId = freshRoom.turnIndex;

              io.to(roomId).emit("playCard", {
                room: {
                  ...getCleanRoom(updatedRoom),
                  movingPlayerId: movingPlayerId
                }
              });

              io.to(roomId).emit("userTurn", {
                turnIndex: nextPlayerId,
                room: getCleanRoom(updatedRoom),
                fultimer: 30,
                alertTimer: 20,
                autocardpicktimer: 25,
                autoplaycardTimer: 22
              });

              // Bot check logic for next turn
              const nextPlayerObj = updatedRoom.players.find(
                (p) => p.user_id.toString() === updatedRoom.turnIndex.toString()
              );

              if (nextPlayerObj && nextPlayerObj.bot) {
                handleBotTurn(roomId);
              }
            } catch (innerErr) {
              console.error("Error in cardOpen auto-skip timeout:", innerErr);
            }
          }, 4000);
        }

      } catch (err) {
        console.error("Error in cardOpen event:", err);
        socket.emit("error", { message: "Internal server error" });
      }
    });
    socket.on("playCard", (data) => processPlayCard(data));
    socket.on("userTurn", async ({ roomId }) => {
      try {
        // 1. Room ka data fetch karein
        const room = await Room.findOne({ roomId }).lean();

        if (!room) {
          return socket.emit("error", { message: "Room not found" });
        }

        const winnerPlayer = room.players.find(p => p.homeCount >= 3);

        if (winnerPlayer) {
          // Internal rank set karein prize distribution ke liye
          const winnerIndex = room.players.findIndex(p => p.user_id === winnerPlayer.user_id);
          room.players[winnerIndex].rank = 1;

          // Status update karein
          const updatedRoom = await Room.findOneAndUpdate(
            { roomId },
            { $set: { status: "FINISHED", winner: winnerPlayer.user_id } },
            { new: true }
          ).lean();

          // Lobby se plus (+) coins/trophies distribute karein
          await calculateAndDistributePrize(updatedRoom, io);

          // Emit GameWinner aur return kar dein (Taaki turn emit na ho)
          return io.to(roomId).emit("GameWinner", {
            room: getCleanRoom(updatedRoom),
            winnerId: winnerPlayer.user_id,
            results: updatedRoom.players.map(p => ({
              user_id: p.user_id,
              name: p.name,
              isWinner: p.user_id === winnerPlayer.user_id,
              rewardCoins: p.rewardCoins || 0,
              rewardTrophies: p.rewardTrophies || 0
            }))
          });
        }
        io.to(roomId).emit("userTurn", {
          turnIndex: room.turnIndex, // Current user_id jiski turn hai
          room: getCleanRoom(room), // Extra safety ke liye pura room state
          fultimer: 30,
          alertTimer: 20,
          autocardpicktimer: 25,
          autoplaycardTimer: 22
        });

        // console.log(`Current turn in room ${roomId} is: ${room.turnIndex}`);
        const currentPlayer = room.players.find(
          (p) => p.user_id.toString() === room.turnIndex.toString()
        );

        if (currentPlayer && currentPlayer.bot) {
          // console.log(`Bot Triggered: Bot (${currentPlayer.user_id}) is thinking...`);

          // Thoda delay taaki human players ko lage ki bot soch raha hai (Realistic feel)
          setTimeout(() => {
            handleBotTurn(roomId);
          }, 2000);
        }

      } catch (error) {
        console.error("Error in UserTurn socket:", error);
        socket.emit("error", { message: "Internal server error: " + err.message });
      }
    });


    socket.on("playerLeft", async ({ roomId, user_id }) => {
      // const { roomId, user_id } = data;
      console.log("Manual Leave Triggered");
      try {
        const room = await Room.findOne({ roomId });
        if (!room) return;

        const playerIndex = room.players.findIndex(p => p.user_id.toString() === user_id.toString());
        if (playerIndex === -1) return;
        console.log("playerIndex", playerIndex)
        // 1. Player ko mark karein hasLeft
        let updateFields = {};
        // 1. Player ko mark karein hasLeft: true
        updateFields[`players.${playerIndex}.hasLeft`] = true;

        // 2. Us player ke saare pawns ko BASE par reset karein
        room.players[playerIndex].pawns.forEach((pawn, pawnIdx) => {
          updateFields[`players.${playerIndex}.pawns.${pawnIdx}.position`] = -1
          updateFields[`players.${playerIndex}.pawns.${pawnIdx}.status`] = "BASE";
          updateFields[`players.${playerIndex}.pawns.${pawnIdx}.isMove`] = false;
          updateFields[`players.${playerIndex}.pawns.${pawnIdx}.isSlider`] = false;
        });

        // Local object update for remaining logic
        room.players[playerIndex].hasLeft = true;

        // 2. Active players filter karein
        const remainingPlayers = room.players.filter(p => !p.hasLeft);
        io.to(roomId).emit("playerLeft", {
          user_id: user_id,

          message: `${user_id} is left. Game ended because no real players left.`
        });
        // console.log(remainingPlayers)
        // --- Check: Agar bache hue sab bots hain, toh room uda do ---
        const allRemainingAreBots = remainingPlayers.every(p => p.bot === true);
        if (allRemainingAreBots) {
          console.log(`Room ${roomId} deleted: Only bots remaining.`);
          socket.leave(roomId);
          return await Room.deleteOne({ roomId });
        }

        // --- CASE 1: Single Winner Logic (Jab sirf ek real player bacha ho) ---
        if (remainingPlayers.length === 1) {
          const winnerPlayer = remainingPlayers[0];

          updateFields["status"] = "FINISHED";
          updateFields["winner"] = winnerPlayer.user_id;

          const finishedRoom = await Room.findOneAndUpdate(
            { roomId },
            { $set: updateFields },
            { new: true }
          );

          const winnerIdxInRoom = finishedRoom.players.findIndex(p => p.user_id === winnerPlayer.user_id);
          finishedRoom.players[winnerIdxInRoom].rank = 1;

          await calculateAndDistributePrize(finishedRoom, io);

          // 🔥 Yahan badlaav hai: Hum sirf winner ke socketId par emit kar rahe hain
          if (winnerPlayer.socketId) {
            io.to(winnerPlayer.socketId).emit("GameWinner", {
              room: getCleanRoom(finishedRoom),
              winnerId: winnerPlayer.user_id,
              results: finishedRoom.players.map(p => ({
                user_id: p.user_id,
                name: p.name,
                isWinner: p.user_id === winnerPlayer.user_id,
                rewardCoins: p.rewardCoins || 0,
                rewardTrophies: p.rewardTrophies || 0
              }))
            });
          }

          await Room.deleteOne({ roomId });
          socket.leave(roomId);
          return;
        }

        // --- CASE 2: Turn update logic (Agar game continue ho raha hai) ---
        let turnChanged = false;
        let nextPlayerId = room.turnIndex; // Default purana hi rakhein

        if (room.turnIndex.toString() === user_id.toString()) {
          let nextIndex = (playerIndex + 1) % room.players.length;
          let checkCount = 0;

          // Skip left players
          while (room.players[nextIndex].hasLeft && checkCount < room.players.length) {
            nextIndex = (nextIndex + 1) % room.players.length;
            checkCount++;
          }

          nextPlayerId = room.players[nextIndex].user_id;
          updateFields["turnIndex"] = nextPlayerId;
          turnChanged = true;
        }

        const updatedRoom = await Room.findOneAndUpdate(
          { roomId },
          { $set: updateFields },
          { new: true }
        );

        // Agar turn change hui hai, toh userTurn emit karein
        if (turnChanged) {
          io.to(roomId).emit("userTurn", {
            turnIndex: nextPlayerId,
            room: getCleanRoom(updatedRoom),
            fultimer: 30,
            alertTimer: 20,
            autocardpicktimer: 25,
            autoplaycardTimer: 22
          });
        }

        socket.leave(roomId);

        // Bot trigger
        const nextPlayer = updatedRoom.players.find(p => p.user_id.toString() === updatedRoom.turnIndex.toString());
        if (nextPlayer && nextPlayer.bot) {
          setTimeout(() => handleBotTurn(roomId), 3000);
        }

      } catch (err) {
        console.error("Leave Event Error:", err);
      }
    });
    // Jab internet jaye ya app close ho
    socket.on("disconnect", async () => {
      console.log("Socket Disconnected");
      // Agar aap automatic leave nahi chahte, toh yahan kuch mat likhiye.
      // Lekin agar game stuck ho raha hai, toh yahan check lagana zaroori hai.
    });
    socket.on("sendMessage", async ({ roomId, message }) => {
      const room = await Room.findOne({ roomId });
      if (!room) return;
      const sender = room.players.find(p => p.user_id === socket.user_id);
      const chatData = { sender_id: sender.user_id, sender_name: sender.name, message, createdAt: new Date() };
      const updatedRoom = await Room.findOneAndUpdate({ roomId }, { $push: { chat: chatData } }, { new: true });
      io.to(roomId).emit("receiveMessage", updatedRoom);
    });


  });
};