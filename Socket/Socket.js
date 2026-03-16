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
const e = require("cors");
require("dotenv").config();

module.exports = (server) => {
  const io = new Server(server, {
    cors: { origin: "*" },
    pingTimeout: 60000,    // 60 seconds (Client response ka wait karega)
    pingInterval: 25000    // 25 seconds (Har 25 sec mein check karega)
  });
  const getISTTime = () => {
    return new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };
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
  const turnTimers = new Map();
  const handleBotTurn = async (roomId) => {
    try {
      const room = await Room.findOne({ roomId, status: "STARTED" }).lean();
      if (!room || room.status === "FINISHED") return;

      const currentPlayer = room.players.find(p => p.user_id.toString() === room?.turnIndex?.toString());
      // console.log("currentPlayer -----------------------------", currentPlayer.user_id)
      if (!currentPlayer || !currentPlayer.bot) return;
      const isContinuingSeven = room.sevenSplitUsed > 0 && room.sevenSplitUsed < 7;

      // const initialDelay = isContinuingSeven ? 1000 : 4000;
      // ⏳ Turn start delay
      // setTimeout(async () => {
      // emitCardOpen(io, room, roomId);
      if (!isContinuingSeven && !room.isCardOpen) {
        console.log("hellooooo ----------- this is not seven")
        setTimeout(async () => {
          emitCardOpen(io, room, roomId);
        }, 2000);
      } else {
        console.log("hellooooo ----------- this is seven")

      }

      // ⏳ Card open delay
      setTimeout(async () => {
        const currentRoom = await Room.findOne({ roomId, status: "STARTED" }).lean();
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

          let totalAnimationTime = 800; // Base delay

          if (bestMove.moveType === "SPLIT" && bestMove.splits) {
            // Seven split case: har part ki animation add hogi
            let totalSteps = bestMove.splits.reduce((sum, s) => sum + s.steps, 0);
            totalAnimationTime = (totalSteps * 300);
          } else if (bestMove.moveType === "SWAP") {
            totalAnimationTime = 400; // Image: 0.35s + buffer
          } else if (card.forward_steps && bestMove.moveType === "FORWARD") {
            // Regular Move: Image ke values (+8 = 2.49s, +12 = 3.81s)
            // Approx 0.32s per step + 150ms buffer
            const steps = card.forward_steps || 0;
            totalAnimationTime = (steps * 300) + 100;
          } else if (card.backward_steps && bestMove.moveType === "BACKWARD") {
            const steps = card.backward_steps || 0;
            totalAnimationTime = (steps * 300) + 150;
          } else {
            const steps = card.forward_steps || 0;
            totalAnimationTime = (steps * 300) + 100;
          }

          // Agar move ke result mein slider hai (Slider: 0.15s per step)
          if (bestMove.isSliderMove) {
            totalAnimationTime += (4 * 150);
          }

          // 🔥 3. PLAY CARD KHATAM HONE KE BAAD DELAY SE EMIT KAREIN
          setTimeout(async () => {
            const finalRoom = await Room.findOne({ roomId, status: "STARTED" }).lean();
            if (!finalRoom) return;


            // const winnerPlayer = finalRoom.players.find(player =>
            //   player.pawns.filter(pawn => pawn.status === "HOME").length >= 3
            // );
            // if (winnerPlayer) {
            //   // Internal rank set karein prize distribution ke liye
            //   const winnerIndex = finalRoom.players.findIndex(p => p.user_id === winnerPlayer.user_id);
            //   finalRoom.players[winnerIndex].rank = 1;

            //   // Status update karein
            //   const updatedRoom = await Room.findOneAndUpdate(
            //     { roomId: roomId, status: "STARTED" }, // 1. Double-check: Sirf chalti game ko hi khatam karein
            //     { $set: { status: "FINISHED", winner: winnerPlayer.user_id } },
            //     { new: true, lean: true } // 3. Memory kam lega aur response fast aayega}
            //   ).select("-chat -cards");

            //   // Lobby se plus (+) coins/trophies distribute karein
            //   await calculateAndDistributePrize(updatedRoom, io);
            //   console.log(`[${getISTTime()}] GameWinner 🔄  ${roomId}`);
            //   // Emit GameWinner aur return kar dein (Taaki turn emit na ho)
            //   return io.to(roomId).emit("GameWinner", {
            //     room: getCleanRoom(updatedRoom),
            //     winnerId: winnerPlayer.user_id,
            //     results: updatedRoom.players.map(p => ({
            //       user_id: p.user_id,
            //       name: p.name,
            //       isWinner: p.user_id === winnerPlayer.user_id,
            //       rewardCoins: p.rewardCoins || 0,
            //       rewardTrophies: p.rewardTrophies || 0
            //     }))
            //   });
            // }
            const currentPlayer = finalRoom.players.find(p => p.user_id.toString() === finalRoom.turnIndex.toString());
            const homePawns = currentPlayer.pawns.filter(p => p.status === "HOME").length;

            if (homePawns >= 3 && !currentPlayer.isFinish) {
              const nextRank = (finalRoom.rankCounter || 0) + 1;

              // DB mein rank aur isFinish update karein
              await Room.updateOne(
                { roomId, "players.user_id": currentPlayer.user_id },
                {
                  $set: { "players.$.isFinish": true, "players.$.rank": nextRank },
                  $inc: { rankCounter: 1 }
                }
              );
              console.log(`[${getISTTime()}] playerRanked ${roomId} `);
              io.to(roomId).emit("playerRanked", {
                user_id: currentPlayer.user_id,
                rank: nextRank,
                name: currentPlayer.name
              });
            }

            // 3. Final Room fetch dobara taaki updated rank status mile
            const updatedRoom = await Room.findOne({ roomId }).lean();
            const activePlayers = updatedRoom.players.filter(p => !p.hasLeft && !p.isFinish);

            // 4. Game Over Condition (Agar sirf 1 player bacha ho)
            if (activePlayers.length <= 1) {
              if (activePlayers.length === 1) {
                await Room.updateOne(
                  { roomId, "players.user_id": activePlayers[0].user_id },
                  { $set: { "players.$.isFinish": true, "players.$.rank": (updatedRoom.rankCounter || 0) + 1 } }
                );
              }

              const finishedRoom = await Room.findOneAndUpdate(
                { roomId },
                { $set: { status: "FINISHED" } },
                { new: true, lean: true }
              );

              // Prize distribute karo (1st Rank ko Coins + Diamonds, others only Coins)
              await calculateAndDistributePrize(finishedRoom, io);
              console.log(`[${getISTTime()}] GameWinner ${roomId}`);
              io.to(roomId).emit("GameWinner", {
                // room: getCleanRoom(finishedRoom),
                // results: finishedRoom.players
                //   .sort((a, b) => (a.rank || 99) - (b.rank || 99))
                //   .map(p => ({
                //     user_id: p.user_id,
                //     name: p.name,
                //     rank: p.rank || 0,
                //     rewardCoins: p.rewardCoins || 0,
                //     rewardDiamonds: p.rewardDiamonds || 0
                //   }))
                results: finishedRoom.players
                  .sort((a, b) => {
                    // Ranking logic: Rank wale pehle, baki baad mein
                    if (a.rank && b.rank) return a.rank - b.rank;
                    if (a.rank) return -1;
                    if (b.rank) return 1;
                    return 0;
                  })
                  .map(p => ({
                    user_id: p.user_id,
                    name: p.name,
                    avatar: p.avatar,
                    rank: p.rank || 0,
                    hasLeft: p.hasLeft,
                    rewardCoins: p.rewardCoins || 0,
                    rewardDiamonds: p.rewardDiamonds || 0
                  }))
              });

                        return await Room.deleteOne({ roomId });

            }
            console.log(`[${getISTTime()}] userTurn `);
            io.to(roomId).emit("userTurn", {
              // turnIndex: finalRoom.turnIndex,
              // room: getCleanRoom(finalRoom),
              // fultimer: 30,
              // alertTimer: 20,
              // autocardpicktimer: 25,
              // autoplaycardTimer: 22
              userTurn: finalRoom.turnIndex,
              remainingTimer: 30
            });

            // Check for next bot turn
            const nextPlayer = finalRoom.players.find(p => p.user_id.toString() === finalRoom.turnIndex.toString());
            if (nextPlayer && nextPlayer.bot) {
              handleBotTurn(roomId);
            } else { startTurnTimer(room.roomId, io) }
          }, totalAnimationTime);
        }
      }, 5000);
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
      // status: fullRoom.status,
      // turnIndex: fullRoom?.turnIndex,
      // winner: fullRoom.winner,
      chosenMoveType: fullRoom.chosenMoveType,
      // fultimer: 30,
      // alertTimer: 20,
      cards: fullRoom.cards ? fullRoom.cards.length : null,
      // autocardpicktimer: 25,
      // autoplaycardTimer: 22,
      players: fullRoom.players.map(p => ({
        user_id: p.user_id,
        name: p.name,
        bot: p.bot,
        avatar: p.avatar,
        missedTurns: p.missedTurns,
        // homeCount: p.homeCount || 0,
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
      let shuffleDelay = 0;
      // 1. Deck Re-shuffle logic
      if (!roomdata?.cards || roomdata?.cards.length === 0) {
        const cards = await Card.find({}).lean();
        currentRoomState = await Room.findOneAndUpdate(
          { roomId, status: "STARTED" },
          { $set: { cards: generateShuffledDeck(cards), sevenSplitUsed: 0, isCardOpen: false } },
          { new: true, lean: true }
        ).select("-chat");

        shuffleDelay = 2000;
      }

      const openedCard = currentRoomState?.cards[0];

      // 2. Reset Pawns State (isMove/isSlider reset)
      // Hum direct update use karenge taaki extra findOne na karna pade
      const room = await Room.findOneAndUpdate(
        { roomId, status: "STARTED" },
        {
          $set: {
            "players.$[].pawns.$[].isMove": false,
            "players.$[].pawns.$[].isSlider": false,

          }
        },
        { new: true, lean: true }
      ).select("-chat -cards");

      if (!room) return;

      const currentPlayer = room?.players?.find(
        (p) => p?.user_id?.toString() === room?.turnIndex?.toString()
      );

      // 3. Emit Card Open Event
      setTimeout(async () => {
        console.log(`[${getISTTime()}] cardOpen 🔄  ${room.roomId}`);
        console.log("cardname ---------- ", openedCard.card_name);
        await Room.updateOne(
          { roomId },
          { $set: { isCardOpen: true } }
        );
        io.to(room?.roomId).emit("cardOpen", {
          user_id: currentPlayer ? currentPlayer?.user_id : room?.turnIndex,
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
        const playerCount = room?.players.length;

        if (currentPlayer) {
          const activePawns = currentPlayer?.pawns.filter(p => p.status !== "HOME");

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
          console.log(`User ${room?.turnIndex} has no valid moves. Auto-skipping in 3s...`);

          setTimeout(async () => {
            try {
              const freshRoom = await Room?.findOne({ roomId, status: "STARTED" }).lean();
              if (!freshRoom) return;

              const currentIndex = freshRoom?.players?.findIndex(
                (p) => p?.user_id?.toString() === freshRoom?.turnIndex?.toString()
              );

              // const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % freshRoom.players.length;
              let nextIndex = (currentIndex + 1) % freshRoom?.players?.length;
              let checkCount = 0;

              // Jab tak player hasLeft ho ya rank mil chuki ho, tab tak skip karo
              while (
                (freshRoom?.players[nextIndex].hasLeft || freshRoom?.players[nextIndex]?.rank) &&
                checkCount < freshRoom?.players.length
              ) {
                nextIndex = (nextIndex + 1) % freshRoom?.players.length;
                checkCount++;
              }
              const nextPlayerId = freshRoom?.players[nextIndex].user_id;

              const updatedRoom = await Room.findOneAndUpdate(
                { roomId, status: "STARTED" },
                {
                  $set: {
                    turnIndex: nextPlayerId,
                    sevenSplitUsed: 0,
                    isCardOpen: false,
                    "players.$[].pawns.$[].isMove": false,
                    "players.$[].pawns.$[].isSlider": false
                  },
                  $pop: { cards: -1 }
                },
                { new: true, lean: true }
              ).select("-chat");

              const movingPlayerId = freshRoom?.turnIndex;
              console.log(`[${getISTTime()}] playCard 🔄  ${roomId}`);
              io.to(roomId).emit("playCard", {
                room: {
                  ...getCleanRoom(updatedRoom),
                  movingPlayerId: movingPlayerId
                }
              });


              // const winnerPlayer = updatedRoom.players.find(player =>
              //   player.pawns.filter(pawn => pawn.status === "HOME").length >= 3
              // );
              // if (winnerPlayer) {
              //   // Internal rank set karein prize distribution ke liye
              //   const winnerIndex = updatedRoom.players.findIndex(p => p.user_id === winnerPlayer.user_id);
              //   updatedRoom.players[winnerIndex].rank = 1;

              //   // Status update karein
              //   const updatedRoom = await Room.findOneAndUpdate(
              //     { roomId: roomId, status: "STARTED" }, // 1. Double-check: Sirf chalti game ko hi khatam karein
              //     { $set: { status: "FINISHED", winner: winnerPlayer.user_id } },
              //     { new: true, lean: true } // 3. Memory kam lega aur response fast aayega}
              //   ).select("-chat -cards");

              //   // Lobby se plus (+) coins/trophies distribute karein
              //   await calculateAndDistributePrize(updatedRoom, io);

              //   // Emit GameWinner aur return kar dein (Taaki turn emit na ho)
              //   console.log(`[${getISTTime()}] GameWinner 🔄  ${roomId}`);
              //   return io.to(roomId).emit("GameWinner", {
              //     room: getCleanRoom(updatedRoom),
              //     // winnerId: winnerPlayer.user_id,
              //     results: updatedRoom.players.map(p => ({
              //       user_id: p.user_id,
              //       name: p.name,
              //       isWinner: p.user_id === winnerPlayer.user_id,
              //       rewardCoins: p.rewardCoins || 0,
              //       rewardTrophies: p.rewardTrophies || 0
              //     }))
              //   });
              // }

              const currentPlayer = freshRoom?.players.find(p => p?.user_id?.toString() === freshRoom?.turnIndex?.toString());
              const homePawns = currentPlayer?.pawns?.filter(p => p.status === "HOME").length;

              if (homePawns >= 3 && !currentPlayer?.isFinish) {
                const nextRank = (freshRoom?.rankCounter || 0) + 1;

                // DB mein rank aur isFinish update karein
                await Room.updateOne(
                  { roomId, "players.user_id": currentPlayer?.user_id },
                  {
                    $set: { "players.$.isFinish": true, "players.$.rank": nextRank },
                    $inc: { rankCounter: 1 }
                  }
                );

                io.to(roomId).emit("playerRanked", {
                  user_id: currentPlayer?.user_id,
                  rank: nextRank,
                  name: currentPlayer?.name
                });
              }

              // 3. Final Room fetch dobara taaki updated rank status mile
              const updatedRoomData = await Room?.findOne({ roomId }).lean();
              const activePlayers = updatedRoomData?.players?.filter(p => !p.hasLeft && !p.isFinish);

              // 4. Game Over Condition (Agar sirf 1 player bacha ho)
              if (activePlayers?.length <= 1) {
                if (activePlayers?.length === 1) {
                  await Room?.updateOne(
                    { roomId, "players.user_id": activePlayers[0]?.user_id },
                    { $set: { "players.$.isFinish": true, "players.$.rank": (updatedRoomData?.rankCounter || 0) + 1 } }
                  );
                }

                const finishedRoom = await Room?.findOneAndUpdate(
                  { roomId },
                  { $set: { status: "FINISHED" } },
                  { new: true, lean: true }
                );

                // Prize distribute karo (1st Rank ko Coins + Diamonds, others only Coins)
                await calculateAndDistributePrize(finishedRoom, io);

                io.to(roomId).emit("GameWinner", {
                  // room: getCleanRoom(finishedRoom),
                  // results: finishedRoom.players
                  //   .sort((a, b) => (a.rank || 99) - (b.rank || 99))
                  //   .map(p => ({
                  //     user_id: p.user_id,
                  //     name: p.name,
                  //     rank: p.rank || 0,
                  //     rewardCoins: p.rewardCoins || 0,
                  //     rewardDiamonds: p.rewardDiamonds || 0,

                  //   }))
                  results: finishedRoom?.players
                    .sort((a, b) => {
                      // Ranking logic: Rank wale pehle, baki baad mein
                      if (a.rank && b.rank) return a.rank - b.rank;
                      if (a.rank) return -1;
                      if (b.rank) return 1;
                      return 0;
                    })
                    .map(p => ({
                      user_id: p.user_id,
                      name: p.name,
                      avatar: p.avatar,
                      rank: p.rank || 0,
                      hasLeft: p.hasLeft,
                      rewardCoins: p.rewardCoins || 0,
                      rewardDiamonds: p.rewardDiamonds || 0
                    }))

                    
                });

                          return await Room.deleteOne({ roomId });

              }
              console.log(`[${getISTTime()}] userTurn 🔄  ${roomId}`);
              io.to(roomId).emit("userTurn", {
                userTurn: updatedRoom?.turnIndex,
                remainingTimer: 30
              });

              // Bot check for next turn
              const nextPlayer = updatedRoom?.players.find(
                (p) => p?.user_id?.toString() === updatedRoom?.turnIndex?.toString()
              );

              if (nextPlayer && nextPlayer?.bot) {
                setTimeout(() => {
                  handleBotTurn(roomId);
                }, 5000);
              } else {
                setTimeout(() => {

                  startTurnTimer(roomId, io)
                }, 5000);

              }
            } catch (innerErr) {
              console.error("Error in emitCardOpen setTimeout:", innerErr);
            }
          }, 3000);
        }
      }, shuffleDelay);
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
      const room = await Room.findOne({ roomId, status: "STARTED" }).lean();
      if (!room) return;

      const currentPlayerIndex = room.players.findIndex(p => p.user_id.toString() === room?.turnIndex?.toString());
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
      // processPlayCard ke shuru mein ye loop chalayein

      let updateFields = {};
      let shouldUpdateTurn = true;
      let shouldPopCard = true;

      let isSliderMove = false;
      player.pawns.forEach((p, index) => {
        const key = `players.${currentPlayerIndex}.pawns.${index}.isMove`;
        if (!updateFields[key]) {
          updateFields[key] = false;
        }
      });
      // currentUserId add kiya taaki pata chale ki moving player kaun hai
      const handleKilling = (myLocalPos, myStartIdx, currentMovingPawnId, currentUserId, isSliderMove = false) => {
        const myGlobal = getGlobal(myLocalPos, myStartIdx);

        room.players.forEach((playerObj, playerIdx) => {
          // Player ID ko string mein convert karke check karein
          // console.log("playerObj.user_id-- ", playerObj.user_id.toString(), "--currentUserId -", currentUserId.toString(), " - --isSliderMove- ", isSliderMove)
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
                targetPawn.isMove = true;
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
          const slidePoints4P = { 12: 3, 20: 4, 27: 3, 35: 4, 42: 3, 50: 4 };
          if (slidePoints4P[pos]) slideSteps = slidePoints4P[pos];
        }

        const slided = slideSteps > 0;

        if (slided) {
          finalPos = pos + slideSteps;
          // Slider hai: Loop chalega aur isSliderMove = true bhejenge
          isSliderMove = true
          for (let i = pos; i <= finalPos; i++) {
            handleKilling(i, startIdx, movingPawnId, currentUserId, true);
          }
        } else {
          isSliderMove = false
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
        // console.log("Sorry  ------------------  myNewLocal, myPawn.startIndex, pawnId, player.user_id", myNewLocal, myPawn.startIndex, pawnId, player.user_id)
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
        let pawnId = data.pawnId;
        let currentUsedSteps = room.sevenSplitUsed || 0;
        let moveSteps = splits[0].steps;
        let newTotalUsed = currentUsedSteps + moveSteps;
        if (newTotalUsed > 7) return;

        const targetPawn = player.pawns.find(p => p.pawnId === splits[0].pawnId);
        const tIdx = player.pawns.findIndex(p => p.pawnId === splits[0].pawnId);

        let updated = calculatePawnMove(targetPawn, { ...card, forward_steps: moveSteps }, room.players.length, "FORWARD");

        if (updated.error) return io.to(roomId).emit("error", { message: updated.error, pawnId: pawnId });
        if (!pawnId && data.splits && data.splits.length > 0) {
          // Pehle split se pawnId utha lo (Special case for SPLIT move)
          pawnId = data.splits[0].pawnId;
          console.log(`[${getISTTime()}] 💡 INFO: Extracted pawnId ${pawnId} from splits array`);
        }
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
          // updateFields[`players.${currentPlayerIndex}.pawns.${index}.isMove`] = false;
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
          updateFields["isCardOpen"] = true;
        } else {
          updateFields["sevenSplitUsed"] = 0;
          updateFields["isCardOpen"] = false;
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
          // console.log("noraml  -----------------   updated.position, myPawn.startIndex, pawnId, player.user_id", updated.position, myPawn.startIndex, pawnId, player.user_id)
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
      if (shouldPopCard) {
        updateFields["sevenSplitUsed"] = 0;
        updateFields["isCardOpen"] = false;
      }
      const queryObj = { $set: updateFields };
      if (shouldPopCard) queryObj.$pop = { cards: -1 };
      // if (shouldPopCard) queryObj.$set = { sevenSplitUsed: 0 };
      const updatedRoom = await Room.findOneAndUpdate(
        { roomId, status: "STARTED" }, // Status check zaroori hai
        queryObj,
        { new: true, lean: true } // lean() memory load 70% kam kar deta hai
      ).select("-chat -cards"); // Faltu data load mat karo
      if (updatedRoom) {
        const movingPlayerId = room?.turnIndex;
        console.log(`[${getISTTime()}] playCard 🔄  ${roomId}`);
        io.to(roomId).emit("playCard", {
          room: {
            ...getCleanRoom(updatedRoom), // Purana room data fetch karein
            movingPlayerId: movingPlayerId // Room ke andar move karne wale ki ID add kar di
          }
        });
        return {
          forwardSteps: card?.forward_steps || 0,
          backwardSteps: card?.backward_steps || 0,
          isSliderMove: isSliderMove, // Aapka 'slided' variable
          // sliderSteps: sliderSteps || 0, // Agar aapne slider steps calculate kiye hain
          shouldUpdateTurn: shouldUpdateTurn
        };
      }

    } catch (err) {
      console.log("Move Error:", err);
      // socket.emit("error", { message: "Internal server error: " + err.message });
    }
  };
  // async function calculateAndDistributePrize(room, io) {
  //   try {
  //     // GameLobby se prize details nikaalein
  //     const lobby = await GameWallet.findById(room.gamelobby_id);
  //     if (!lobby) return;

  //     const totalPrizeCoins = lobby.coinsWon;
  //     const totalPrizeTrophies = lobby.trophiesWon;

  //     // Sirf us player ko dhundein jiski rank 1 hai (Winner)
  //     const winner = room.players.find(p => p.rank === 1);

  //     if (winner) {
  //       // 1. Player object mein reward set karein (taaki frontend ko dikhe)
  //       winner.rewardCoins = totalPrizeCoins;
  //       winner.rewardTrophies = totalPrizeTrophies;

  //       // 2. Database mein coins aur trophies PLUS (+) karein
  //       if (!winner.bot) {
  //         await User.updateOne(
  //           { user_id: winner.user_id },
  //           {
  //             $inc: {
  //               coins: totalPrizeCoins,
  //               trophies: totalPrizeTrophies
  //             }
  //           }
  //         );
  //         console.log(`Prize Added: ${totalPrizeCoins} coins to ${winner.name}`);
  //       }
  //     }

  //     // Baki players ke liye rewards 0 set karein taaki undefined na aaye
  //     room.players.forEach(p => {
  //       if (p.rank !== 1) {
  //         p.rewardCoins = 0;
  //         p.rewardTrophies = 0;
  //       }
  //     });

  //   } catch (err) {
  //     console.error("Prize Distribution Error:", err);
  //   }
  // }

  async function calculateAndDistributePrize(room, io) {
    try {
      // GameLobby se prize details nikaalein
      const lobby = await GameWallet.findById(room.gamelobby_id);
      if (!lobby) return;

      const totalPrizeCoins = lobby.coinsWon || 0;
      const totalPrizeDiamonds = lobby.diamondsWon || 0;

      // Sirf wo players jo bot nahi hain aur jinhone GAME NAHI CHHODI hai
      const activePlayers = room.players.filter(p => !p.hasLeft);
      const activeCount = activePlayers.length;


      // Distribution logic: 2 players = 100%, 3+ players = 60/25/15
      const coinDistribution = (activeCount === 1)
        ? { 1: 1.0 }
        : { 1: 0.60, 2: 0.25, 3: 0.15 };

      for (let player of room.players) {
        // Agar player left ho gaya hai ya bot hai, toh unhe kuch nahi dena
        if (player.hasLeft || player.bot) {
          player.rewardCoins = 0;
          player.rewardDiamonds = 0;
          continue;
        }

        const rank = player.rank;
        const coinPercent = coinDistribution[rank] || 0;

        const rewardCoins = Math.floor(totalPrizeCoins * coinPercent);
        const isWinner = (rank === 1);
        const rewardDiamonds = isWinner ? totalPrizeDiamonds : 0;

        // 1. Player object mein reward set karein (taaki frontend ko dikhe)
        player.rewardCoins = rewardCoins;
        player.rewardDiamonds = rewardDiamonds;

        // 2. Database mein coins aur diamonds update karein
        // Diamonds sirf winner ko milenge, baki ke database mein diamonds update nahi honge
        let updateFields = {
          $inc: { coins: rewardCoins }
        };

        if (isWinner && rewardDiamonds > 0) {
          updateFields.$inc.diamonds = rewardDiamonds;
        }

        await User.updateOne(
          { user_id: player.user_id },
          updateFields
        );

        console.log(`Prize Added: ${rewardCoins} coins ${isWinner ? `& ${rewardDiamonds} diamonds` : ''} to ${player.name} (Rank: ${rank})`);
      }

    } catch (err) {
      console.error("Prize Distribution Error:", err);
    }
  }
  const startTurnTimer = async (roomId, io) => {
    if (turnTimers.has(roomId)) {
      clearTimeout(turnTimers.get(roomId));
    }

    // 1. Calculate End Time (Ab se 30 seconds baad)
    const duration = 30000;
    const endTime = new Date(Date.now() + duration);

    // 2. Database mein store karein
    await Room.updateOne({ roomId }, { $set: { turnEndTime: endTime } });

    // 3. Server-side Timeout
    const timer = setTimeout(async () => {
      await handleAutoPlay(roomId, io);
    }, duration);

    turnTimers.set(roomId, timer);
  };
  const clearTurnTimer = (roomId) => {
    if (turnTimers.has(roomId)) {
      clearTimeout(turnTimers.get(roomId));
      turnTimers.delete(roomId);
    }
  };
  const handleAutoPlay = async (roomId, io) => {
    try {
      const room = await Room.findOne({ roomId, status: "STARTED" }).lean();
      if (!room || room.status === "FINISHED") return;

      const currentPlayer = room.players.find(p => p.user_id.toString() === room?.turnIndex?.toString());
      if (!currentPlayer) return;


      // if (currentPlayer && !currentPlayer.bot) {
      //   await Room.updateOne(
      //     { roomId, "players.user_id": currentPlayer.user_id },
      //     { $inc: { "players.$.missedTurns": -1 } }
      //   );

      //   // Naya count check karein
      //   const updatedMissedCount = (currentPlayer.missedTurns || 3) - 1;

      //   if (updatedMissedCount < 0) {
      //     console.log(`Player ${currentPlayer.user_id} missed 3 turns. Ending game...`);

      //     // Samne wala player (Opponent) winner hoga
      //     const winnerPlayer = room.players.find(p => p.user_id !== currentPlayer.user_id);

      //     const finishedRoom = await Room.findOneAndUpdate(
      //       { roomId: roomId, status: "STARTED" },
      //       { $set: { status: "FINISHED", winner: winnerPlayer.user_id, finishReason: "OPPONENT_MISSED_TURNS" } },
      //       { new: true, lean: true }
      //     ).select("-chat -cards");

      //     if (finishedRoom) {
      //       await calculateAndDistributePrize(finishedRoom, io);
      //       console.log(`[${getISTTime()}] GameWinner 🔄  ${roomId}`);
      //       return io.to(roomId).emit("GameWinner", {
      //         room: getCleanRoom(finishedRoom),
      //         winnerId: winnerPlayer.user_id,
      //         reason: "Opponent missed 3 turns",
      //         results: finishedRoom.players.map(p => ({
      //           user_id: p.user_id,
      //           name: p.name,
      //           isWinner: p.user_id === winnerPlayer.user_id,
      //           rewardCoins: p.rewardCoins || 0,
      //           rewardTrophies: p.rewardTrophies || 0
      //         }))
      //       });
      //     }
      //   }
      // }

      if (currentPlayer && !currentPlayer.bot) {
        // 1. Missed turn decrement (-1 karein)
        const updatedRoomForMiss = await Room.findOneAndUpdate(
          { roomId, "players.user_id": currentPlayer.user_id },
          { $inc: { "players.$.missedTurns": -1 } }, // 3 -> 2 -> 1 -> 0
          { new: true }
        );

        const playerInDb = updatedRoomForMiss.players.find(p => p.user_id === currentPlayer.user_id);

        // 2. Agar missedTurns 0 ya usse niche chala gaya
        if (playerInDb && playerInDb.missedTurns < 0) {
          console.log(`[${getISTTime()}] Player ${currentPlayer.user_id} missed all turns. Resetting pawns and marking as Left.`);

          // 1. Pehle index find karein
          const playerIndex = updatedRoomForMiss.players.findIndex(p => p.user_id === currentPlayer.user_id);

          // 2. Update object banayein
          let updateFields = {
            "players.$.hasLeft": true,
            // "players.$.isFinish": true
          };

          // 3. Pawns ko reset karne ki paths add karein
          currentPlayer.pawns.forEach((pawn, pawnIdx) => {
            updateFields[`players.${playerIndex}.pawns.${pawnIdx}.position`] = -1;
            updateFields[`players.${playerIndex}.pawns.${pawnIdx}.status`] = "BASE";
            updateFields[`players.${playerIndex}.pawns.${pawnIdx}.isMove`] = false;
            updateFields[`players.${playerIndex}.pawns.${pawnIdx}.isSlider`] = false;
          });

          // 4. Update execute karein
          await Room.updateOne(
            { roomId, "players.user_id": currentPlayer.user_id },
            { $set: updateFields }
          );

          // 5. Ab database se taaza state fetch karein (RoomAfterLeft updated state)
          const roomAfterReset = await Room.findOne({ roomId }).lean();
          console.log(`[${getISTTime()}] playerLeft 🔄 Room: ${roomId}`);
          io.to(roomId).emit("playerLeft", {
            user_id: currentPlayer.user_id,
            reason: "Missed 3 turns"
          });



          // 3. Check bache hue ACTIVE players (Jo na left hain na finish)
          const activePlayers = roomAfterReset?.players?.filter(p => !p.hasLeft && !p.isFinish);

          // --- CASE A: Sirf 1 active player bacha (Game Winner) ---
          if (activePlayers.length <= 1) {
            const winnerPlayer = activePlayers[0];

            // 1. Dynamic Rank assign karein (rankCounter use karke)
            const nextRank = (roomAfterReset?.rankCounter || 0) + 1;

            await Room.updateOne(
              { roomId, "players.user_id": winnerPlayer?.user_id },
              {
                $set: { "players.$.isFinish": true, "players.$.rank": nextRank },
                $inc: { rankCounter: 1 } // Rank Counter update
              }
            );

            // 2. Room Finished update
            const finishedRoom = await Room.findOneAndUpdate(
              { roomId: roomId, status: "STARTED" },
              { $set: { status: "FINISHED", winner: winnerPlayer.user_id } },
              { new: true, lean: true }
            ).select("-chat -cards");

            // 3. Lobby se plus (+) coins/diamonds distribute karein
            await calculateAndDistributePrize(finishedRoom, io);
            setTimeout(async () => {
              console.log(`[${getISTTime()}] GameWinner 🏆 | Room: ${roomId}`);
              io.to(roomId).emit("GameWinner", {
                results: finishedRoom.players
                  .sort((a, b) => {
                    // Ranking logic: Rank wale pehle, baki baad mein
                    if (a.rank && b.rank) return a.rank - b.rank;
                    if (a.rank) return -1;
                    if (b.rank) return 1;
                    return 0;
                  })
                  .map(p => ({
                    user_id: p.user_id,
                    name: p.name,
                    avatar: p.avatar,
                    rank: p.rank || 0,
                    hasLeft: p.hasLeft,
                    rewardCoins: p.rewardCoins || 0,
                    rewardDiamonds: p.rewardDiamonds || 0
                  }))
              });

                        return await Room.deleteOne({ roomId });

            }, 5000);
          }

        }
      }
      const isContinuingSeven = room.sevenSplitUsed > 0 && room.sevenSplitUsed < 7;

      // Card open logic
      if (!isContinuingSeven && !room.isCardOpen) {
        emitCardOpen(io, room, roomId);
      }

      // ⏳ Card open ke baad 3s delay (Bot ke liye natural, Human ke liye safety)
      setTimeout(async () => {
        const currentRoom = await Room.findOne({ roomId, status: "STARTED" }).lean();
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
            isBot: true // Server trigger kar raha hai isliye isBot true
          });

          // --- Animation Duration Calculation ---
          let animationDelay = 1000;
          if (bestMove.moveType === "SWAP") animationDelay = 500;
          else {
            const steps = card.forward_steps || 0;
            animationDelay = (steps * 320) + 200;
          }
          if (bestMove.isSliderMove) animationDelay += (bestMove.sliderSteps * 150);

          // 🔥 Move khatam hone ke baad Turn Switch
          setTimeout(async () => {
            const updatedRoom = await Room.findOne({ roomId, status: "STARTED" }).lean();
            if (!updatedRoom) return;

            const currentPlayer = updatedRoom.players.find(p => p.user_id === updatedRoom.turnIndex); // Ya data.user_id
            const homePawns = currentPlayer.pawns.filter(p => p.status === "HOME").length;

            if (homePawns >= 3 && !currentPlayer.isFinish) {
              const nextRank = (updatedRoom.rankCounter || 0) + 1;

              // DB mein rank aur isFinish update karein
              const updatedDoc = await Room.findOneAndUpdate(
                { roomId, "players.user_id": currentPlayer.user_id },
                {
                  $set: { "players.$.isFinish": true, "players.$.rank": nextRank },
                  $inc: { rankCounter: 1 }
                },
                { new: true, lean: true }
              );
              updatedRoom = updatedDoc; // Updated data use karein
              console.log(`[${getISTTime()}] playerRanked 🔄  ${roomId}`);
              io.to(roomId).emit("playerRanked", {
                user_id: currentPlayer.user_id,
                rank: nextRank,
                name: currentPlayer.name
              });
            }

            // 3. CHECK: Game khatam hui? (Agar 1 ya usse kam active player bache)
            const activePlayers = updatedRoom.players.filter(p => !p.hasLeft && !p.isFinish);

            if (activePlayers.length <= 1) {
              // Agar 1 bacha hai, use aakhri rank do
              if (activePlayers.length === 1) {
                await Room.updateOne(
                  { roomId, "players.user_id": activePlayers[0].user_id },
                  { $set: { "players.$.isFinish": true, "players.$.rank": (finalRoom.rankCounter || 0) + 1 } }
                );
              }

              const finishedRoom = await Room.findOneAndUpdate(
                { roomId },
                { $set: { status: "FINISHED" } },
                { new: true, lean: true }
              );

              await calculateAndDistributePrize(finishedRoom, io);

              console.log(`[${getISTTime()}] GameWinner 🔄 ${roomId}`);
               io.to(roomId).emit("GameWinner", {
                results: finishedRoom.players
                  .sort((a, b) => (a.rank || 99) - (b.rank || 99))
                  .map(p => ({
                    user_id: p.user_id,
                    name: p.name,
                    avatar: p.avatar,
                    rank: p.rank || 0,
                    hasLeft: p.hasLeft,
                    rewardCoins: p.rewardCoins || 0,
                    rewardDiamonds: p.rewardDiamonds || 0
                  }))
              });
                        return await Room.deleteOne({ roomId });

            }

            // Emit UserTurn
            console.log(`[${getISTTime()}] userTurn 🔄  ${roomId}`);
            io.to(roomId).emit("userTurn", {
              userTurn: updatedRoom.turnIndex,
              remainingTimer: 30
            });

            // Start New Timer for the next player


            // Agar agla player Bot hai toh turant trigger
            const nextPlayer = updatedRoom.players.find(p => p.user_id.toString() === updatedRoom.turnIndex.toString());
            if (nextPlayer && nextPlayer.bot) {
              handleBotTurn(roomId, io);
            } else {
              startTurnTimer(roomId, io);
            }
          }, animationDelay);
        }
      }, 3000);

    } catch (err) {
      console.error("AutoPlay Error:", err);
    }
  };
  io.on("connection", (socket) => {

    socket.on("joinGame", async ({ user_id, maxPlayers, gamelobby_id }) => {
      try {
        if (user_id != socket.verified_id) {
          return socket.emit("error", { message: "Unauthorized!" });
        }
        const user = await User.findOne({ user_id }).lean();
        const lobby = await GameWallet.findById(gamelobby_id).lean();

        if (!user || !lobby) return socket.emit("error", { message: "Data not found" });
        // console.log("user_id",user_id)
        // console.log("user_id, maxPlayers, gamelobby_id", user_id, maxPlayers, gamelobby_id)
        const existingRoom = await Room?.findOne({
          "players": {
            $elemMatch: {
              "user_id": user_id,
              "hasLeft": false,
              "isFinish": false // 🔥 Sirf wahi player milega jo abhi bhi game mein active hai
            }
          },
          gamelobby_id: gamelobby_id,
          maxPlayers: maxPlayers,
          status: "STARTED"
        }).lean();

        // --- REJOIN SECTION INSIDE joinGame ---
        if (existingRoom) {
          socket.join(existingRoom?.roomId);

          // 1. Database mein socketId update karein
          await Room.updateOne(
            { roomId: existingRoom?.roomId, "players.user_id": user_id },
            { $set: { "players.$.socketId": socket.id } }
          );

          // 2. Bacha hua time calculate karein
          const currentTime = Date.now();
          const endTime = new Date(existingRoom?.turnEndTime).getTime();
          let remainingMs = endTime - currentTime;
          let remainingSec = Math.max(0, Math.floor(remainingMs / 1000));
          console.log("remainingSec", remainingSec)

          // 3. Data emit karein
          console.log(`[${getISTTime()}] rejoinData`);
          socket.emit("rejoinData", {
            room: getCleanRoom(existingRoom),
            isRejoin: true,
            remainingTimer: remainingSec, // Frontend isi seconds se countdown shuru karega
            userTurn: existingRoom?.turnIndex,
            card: existingRoom?.isCardOpen ? existingRoom?.cards[0] : null
          });

          // 4. Important: Agar Server restart hua tha aur timer memory mein nahi hai
          if (!turnTimers.has(existingRoom.roomId) && remainingMs > 0) {
            // console.log("Restoring timer from DB for room:", existingRoom.roomId);

            const timer = setTimeout(async () => {
              await handleAutoPlay(existingRoom.roomId, io);
            }, remainingMs);

            turnTimers.set(existingRoom.roomId, timer);
          }

          // 5. Bot Check (Sirf tab trigger karein jab bot ki turn ho aur pehle se na chal raha ho)
          const currentPlayer = existingRoom.players.find(
            (p) => p.user_id.toString() === existingRoom?.turnIndex?.toString()
          );

          if (currentPlayer && currentPlayer.bot) {
            // Note: handleBotTurn ke andar delay hota hai, isliye turant call safe hai
            handleBotTurn(existingRoom.roomId, io);
          }

          return; // Rejoin ho gaya, niche naya join logic nahi chalna chahiye
        }


        const entryFee = lobby.entryCoinsUsed;
        // const diamondFee = lobby.diamondsWon || 0; // Check your schema for diamond field name

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
          const realPlayers = playersList?.filter(p => !p.bot);
          const userIds = realPlayers?.map(p => p.user_id);

          // Bulk update for all real players in the room
          await User.updateMany(
            { user_id: { $in: userIds } },
            { $inc: { coins: -entryFee} }
          );
        };



        if (roomData?.players.length === maxPlayers) {

          clearTimeout(roomData.timer);[]
          console.log(`[${getISTTime()}] waiting `);
          socket.emit("waiting", { joined: roomData.players.length, needed: maxPlayers });

          const room = await createRoom(roomData?.players, generateShuffledDeck(await Card.find({})), maxPlayers, gamelobby_id);

          // Join Socket Room
          room.players.forEach(p => io.sockets.sockets.get(p.socketId)?.join(room.roomId));

          // Start Game
          setTimeout(() => {
            console.log(`[${getISTTime()}] gameStart ${room.roomId}`);

            io.to(room.roomId).emit("gameStart", { room: getCleanRoom(room) });
          }, 15000); // 15000 ms = 15 seconds

          setTimeout(() => {


            console.log(`[${getISTTime()}] userTurn ${room.roomId} `);


            io.to(room.roomId).emit("userTurn", {
              userTurn: room.turnIndex,
              remainingTimer: 30
            });
          }, 4000);

          const currentPlayer = room.players.find(
            (p) => p.user_id.toString() === room?.turnIndex?.toString()
          );

          if (currentPlayer && currentPlayer.bot) {
            handleBotTurn(room.roomId);
          } else {
            startTurnTimer(room.roomId, io)
          }
          // Paise deduct karein
          await processDeduction(room.players);

          waitingRooms.delete(roomKey);
          return;
        }
        // console.log("player 1 user_id", user_id)
        console.log(`[${getISTTime()}] waiting `);

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

            const room = await createRoom(currentRoomData.players, generateShuffledDeck(await Card.find({})), maxPlayers, gamelobby_id);
            room.players.forEach(p => { if (!p.bot) io.sockets.sockets.get(p.socketId)?.join(room.roomId); });
            console.log(`[${getISTTime()}] gameStart ${room.roomId}`);

            io.to(room.roomId).emit("gameStart", { room: getCleanRoom(room) });
            // 1. turnIndex (ID) ke zariye player dhoondo
            const currentPlayer = room.players.find(
              (p) => p.user_id.toString() === room?.turnIndex?.toString()
            );

            setTimeout(() => {
              console.log(`[${getISTTime()}] userTurn ${room.roomId} `);

              io.to(room.roomId).emit("userTurn", {
                userTurn: room.turnIndex,
                remainingTimer: 30
              });
            }, 2000);
            // 2. Agar player mil gaya aur wo bot hai, toh function call karo
            if (currentPlayer && currentPlayer.bot) {
              handleBotTurn(room.roomId);
            } else {
              startTurnTimer(room.roomId, io)
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
        const room = await Room.findOneAndUpdate(
          { roomId, status: "STARTED" },
          {
            $set: {
              "players.$[].pawns.$[].isMove": false,
              "players.$[].pawns.$[].isSlider": false
            }
          },
          { new: true, lean: true }
        ).select("-chat");

        if (!room) return socket.emit("error", { message: "Room not found" });

        const currentPlayer = room.players.find(
          (p) => p.user_id.toString() === room?.turnIndex?.toString()
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
            { roomId, status: "STARTED" },
            { $set: { cards: generateShuffledDeck(cards) }, sevenSplitUsed: 0, isCardOpen: false },
            { new: true, lean: true }
          ).select("-chat");
        }

        const openedCard = currentRoomState.cards[0];

        // 3. Emit Card Open (Sabko card dikhao)
        console.log(`[${getISTTime()}] cardOpen 🔄  ${roomId}`);
        console.log("cardname ----------- ", openedCard.card_name)
        await Room.updateOne(
          { roomId },
          { $set: { isCardOpen: true } }
        );
        io.to(roomId).emit("cardOpen", {
          user_id: user_id,
          card: openedCard
        });

        // 4. 🔥 UPDATED CHECK VALID MOVES (Including Seven Split Logic)
        let canMove = false;
        const playerCount = currentRoomState.players.length;
        const activePawns = currentPlayer.pawns.filter(p => p.status !== "HOME");

        if (openedCard.card_name === "SEVEN") {
          // SEVEN Case: Check if total possible steps across all pawns sum up to 7
          let totalPossibleSteps = 0;

          for (let pawn of activePawns) {
            // Check steps from 1 to 7 for each pawn
            for (let s = 1; s <= 7; s++) {
              let tempCard = { ...openedCard, forward_steps: s };
              let moveResult = calculatePawnMove(pawn, tempCard, playerCount, null, currentPlayer);
              if (!moveResult.error) {
                totalPossibleSteps += s;
              }
            }
          }
          // Agar sab milkar kam se kam 7 steps chal sakte hain, toh move possible hai
          if (totalPossibleSteps >= 7) {
            canMove = true;
          }
        } else {
          // NORMAL CARDS: Purana logic
          for (let pawn of activePawns) {
            let moveResult = calculatePawnMove(pawn, openedCard, playerCount, null, currentPlayer);
            if (!moveResult.error) {
              canMove = true;
              break;
            }
          }
        }

        // 5. AUTO SKIP LOGIC
        if (!canMove) {
          console.log(`User ${user_id} has no valid moves with card ${openedCard.card_name}. Skipping in 4s...`);

          setTimeout(async () => {
            try {
              // Room data fresh fetch karein
              const freshRoom = await Room.findOne({ roomId, status: "STARTED" }).lean();
              if (!freshRoom) return;


              const currentPlayer = freshRoom.players.find(p => p.user_id === user_id);
              const homePawns = currentPlayer.pawns.filter(p => p.status === "HOME").length;

              // 1. CHECK: Agar skip karte waqt player ne target achieve kar liya hai
              if (homePawns >= 3 && !currentPlayer.isFinish) {
                const nextRank = (freshRoom.rankCounter || 0) + 1;

                await Room.updateOne(
                  { roomId, "players.user_id": user_id },
                  {
                    $set: { "players.$.isFinish": true, "players.$.rank": nextRank },
                    $inc: { rankCounter: 1 }
                  }
                );
                console.log(`[${getISTTime()}] playerRanked 🔄  ${roomId}`);
                io.to(roomId).emit("playerRanked", { user_id, rank: nextRank, name: currentPlayer.name });
              }
              const currentIndex = freshRoom.players.findIndex(
                (p) => p.user_id?.toString() === freshRoom?.turnIndex?.toString()
              );

              let nextIndex = (currentIndex + 1) % freshRoom.players.length;
              let checkCount = 0;

              while (
                (freshRoom.players[nextIndex].hasLeft || freshRoom.players[nextIndex].rank) &&
                checkCount < freshRoom.players.length
              ) {
                nextIndex = (nextIndex + 1) % freshRoom.players.length;
                checkCount++;
              }

              const nextPlayerId = freshRoom.players[nextIndex].user_id;

              const updatedRoom = await Room.findOneAndUpdate(
                { roomId, status: "STARTED" },
                {
                  $set: {
                    turnIndex: nextPlayerId,
                    sevenSplitUsed: 0,
                    isCardOpen: false,
                    "players.$[].pawns.$[].isMove": false,
                    "players.$[].pawns.$[].isSlider": false
                  },
                  $pop: { cards: -1 }
                },
                { new: true, lean: true }
              ).select("-chat");

              const movingPlayerId = freshRoom?.turnIndex;

              console.log(`[${getISTTime()}] playCard 🔄  ${roomId}`);
              io.to(roomId).emit("playCard", {
                room: {
                  ...getCleanRoom(updatedRoom),
                  movingPlayerId: movingPlayerId
                }
              });

              // const winnerPlayer = updatedRoom.players.find(player =>
              //   player.pawns.filter(pawn => pawn.status === "HOME").length >= 3
              // );

              // if (winnerPlayer) {
              //   const winnerIndex = updatedRoom.players.findIndex(p => p.user_id === winnerPlayer.user_id);
              //   updatedRoom.players[winnerIndex].rank = 1;

              //   const finishedRoom = await Room.findOneAndUpdate(
              //     { roomId: roomId, status: "STARTED" },
              //     { $set: { status: "FINISHED", winner: winnerPlayer.user_id } },
              //     { new: true, lean: true }
              //   ).select("-chat -cards");

              //   await calculateAndDistributePrize(finishedRoom, io);
              //   console.log(`[${getISTTime()}] GameWinner 🔄  ${roomId}`);
              //   return io.to(roomId).emit("GameWinner", {
              //     room: getCleanRoom(finishedRoom),
              //     winnerId: winnerPlayer.user_id,
              //     results: finishedRoom.players.map(p => ({
              //       user_id: p.user_id,
              //       name: p.name,
              //       isWinner: p.user_id === winnerPlayer.user_id,
              //       rewardCoins: p.rewardCoins || 0,
              //       rewardTrophies: p.rewardTrophies || 0
              //     }))
              //   });
              // }
              const activePlayers = updatedRoom.players.filter(p => !p.hasLeft && !p.isFinish);

              if (activePlayers.length <= 1) {
                // Game Over Logic
                if (activePlayers.length === 1) {
                  const finalRank = (updatedRoom.rankCounter || 0) + 1;
                  await Room.updateOne(
                    { roomId, "players.user_id": activePlayers[0].user_id },
                    { $set: { "players.$.isFinish": true, "players.$.rank": finalRank } }
                  );
                }

                const finalFinishedRoom = await Room.findOneAndUpdate(
                  { roomId },
                  { $set: { status: "FINISHED" } },
                  { new: true, lean: true }
                );

                await calculateAndDistributePrize(finalFinishedRoom, io);
                console.log(`[${getISTTime()}] GameWinner 🔄  ${roomId}`);
                io.to(roomId).emit("GameWinner", {
                  // room: getCleanRoom(finalFinishedRoom),
                  // results: finalFinishedRoom.players
                  //   .sort((a, b) => (a.rank || 99) - (b.rank || 99))
                  //   .map(p => ({
                  //     user_id: p.user_id,
                  //     name: p.name,
                  //     rank: p.rank || 0,
                  //     rewardCoins: p.rewardCoins || 0,
                  //     rewardDiamonds: p.rewardDiamonds || 0,
                  //      hasLeft: p.hasLeft,
                  //   }))
                  results: finalFinishedRoom.players
                    .sort((a, b) => {
                      // Ranking logic: Rank wale pehle, baki baad mein
                      if (a.rank && b.rank) return a.rank - b.rank;
                      if (a.rank) return -1;
                      if (b.rank) return 1;
                      return 0;
                    })
                    .map(p => ({
                      user_id: p.user_id,
                      name: p.name,
                      avatar: p.avatar,
                      rank: p.rank || 0,
                      hasLeft: p.hasLeft,
                      rewardCoins: p.rewardCoins || 0,
                      rewardDiamonds: p.rewardDiamonds || 0
                    }))
                });
                          return await Room.deleteOne({ roomId });

              }

              console.log(`[${getISTTime()}] userTurn 🔄  ${roomId}`);
              io.to(roomId).emit("userTurn", {
                userTurn: nextPlayerId,
                remainingTimer: 30
              });

              const nextPlayerObj = updatedRoom.players.find(
                (p) => p.user_id.toString() === updatedRoom?.turnIndex?.toString()
              );

              if (nextPlayerObj && nextPlayerObj.bot) {
                setTimeout(() => {
                  handleBotTurn(roomId);
                }, 5000);
                // handleBotTurn(roomId);
              } else {
                setTimeout(() => {

                  startTurnTimer(roomId, io)
                }, 5000);
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
    socket.on("playCard", async (data) => {
      // 1. Jaise hi player ne click kiya, timer stop karo
      clearTurnTimer(data.roomId);

      // 2. Move ko process karein (Database update + PlayCard emit)
      // Hum is function ko modify karenge taaki ye 'move details' return kare
      const moveDetails = await processPlayCard(data, io);
      // console.log("data", data.roomId)
      if (!moveDetails) return;

      // 3. Animation Timing Calculate Karein
      let totalAnimationTime = 800;

      if (data.chosenMoveType === "SPLIT" && data.splits) {
        let totalSteps = data.splits.reduce((sum, s) => sum + s.steps, 0);
        totalAnimationTime = (totalSteps * 300);
      } else if (data.chosenMoveType === "SWAP") {
        totalAnimationTime = 400;
      } else if (moveDetails.forwardSteps && data.chosenMoveType === "FORWARD") {
        // Normal steps calculation (card steps humein processPlayCard se milenge)
        const steps = moveDetails.forwardSteps || 0;
        totalAnimationTime = (steps * 300) + 150;
      } else if (moveDetails.backwardSteps && data.chosenMoveType === "BACKWARD") {
        const steps = moveDetails.backwardSteps || 0;
        totalAnimationTime = (steps * 300) + 150;
      } else {
        const steps = moveDetails.forwardSteps || 0;
        totalAnimationTime = (steps * 300) + 150;
      }

      // Slider extra time
      if (moveDetails.isSliderMove) {
        totalAnimationTime += (4 * 100);
      }

      // 🔥 4. Animation khatam hone ke baad Next Turn
      setTimeout(async () => {
        const finalRoom = await Room.findOne({ roomId: data.roomId, status: "STARTED" }).lean();
        if (!finalRoom) return;




        // const winnerPlayer = finalRoom.players.find(player =>
        //   player.pawns.filter(pawn => pawn.status === "HOME").length >= 3
        // );
        // if (winnerPlayer) {
        //   // Internal rank set karein prize distribution ke liye
        //   const winnerIndex = finalRoom.players.findIndex(p => p.user_id === winnerPlayer.user_id);
        //   finalRoom.players[winnerIndex].rank = 1;

        //   // Status update karein
        //   const updatedRoom = await Room.findOneAndUpdate(
        //     { roomId: finalRoom.roomId, status: "STARTED" }, // 1. Double-check: Sirf chalti game ko hi khatam karein
        //     { $set: { status: "FINISHED", winner: winnerPlayer.user_id } },
        //     { new: true, lean: true } // 3. Memory kam lega aur response fast aayega}
        //   ).select("-chat -cards");

        //   // Lobby se plus (+) coins/trophies distribute karein
        //   await calculateAndDistributePrize(updatedRoom, io);

        //   // Emit GameWinner aur return kar dein (Taaki turn emit na ho)
        //   console.log(`[${getISTTime()}] GameWinner 🔄  ${finalRoom.roomId}`);
        //   return io.to(finalRoom.roomId).emit("GameWinner", {
        //     room: getCleanRoom(updatedRoom),
        //     winnerId: winnerPlayer.user_id,
        //     results: updatedRoom.players.map(p => ({
        //       user_id: p.user_id,
        //       name: p.name,
        //       isWinner: p.user_id === winnerPlayer.user_id,
        //       rewardCoins: p.rewardCoins || 0,
        //       rewardTrophies: p.rewardTrophies || 0
        //     }))
        //   });
        // }
        const currentPlayer = finalRoom?.players.find(p => p.user_id === data.user_id);
        const homePawns = currentPlayer?.pawns.filter(p => p.status === "HOME")?.length;

        // 1. Agar player ne abhi finish kiya hai (aur pehle se finish nahi tha)
        if (homePawns >= 3 && !currentPlayer.isFinish) {
          const nextRank = (finalRoom.rankCounter || 0) + 1;

          // Rank Update aur DB mein finish mark karein
          const updatedRoom = await Room.findOneAndUpdate(
            { roomId: data.roomId, "players.user_id": currentPlayer.user_id },
            {
              $set: {
                "players.$.isFinish": true,
                "players.$.rank": nextRank
              },
              $inc: { rankCounter: 1 }
            },
            { new: true, lean: true }
          );

          // RANKED EVENT: Sabko batao ki ye player rank mil gaya hai
          io.to(data.roomId).emit("playerRanked", {
            user_id: currentPlayer.user_id,
            rank: nextRank,
            name: currentPlayer.name
          });

          // 2. CHECK: Kya game puri khatam hui? (Sirf 1 active player bacha ho)
          const activePlayers = updatedRoom.players.filter(p => !p.hasLeft && !p.isFinish);

          if (activePlayers.length <= 1) {
            // Aakhri player ko bachi hui rank do aur status finish karo
            if (activePlayers.length === 1) {
              await Room.updateOne(
                { roomId: data.roomId, "players.user_id": activePlayers[0].user_id },
                { $set: { "players.$.isFinish": true, "players.$.rank": nextRank + 1 } }
              );
            }

            const finalFinishedRoom = await Room.findOneAndUpdate(
              { roomId: data.roomId },
              { $set: { status: "FINISHED" } },
              { new: true, lean: true }
            );

            await calculateAndDistributePrize(finalFinishedRoom, io);

            // SORTED RANK-WISE RESULTS

            console.log(`[${getISTTime()}] GameWinner 🔄  ${finalRoom.roomId}`);

            io.to(data.roomId).emit("GameWinner", {
              // room: getCleanRoom(finalFinishedRoom),
              // winnerId: winnerPlayer.user_id,
              results: finalFinishedRoom.players
                .sort((a, b) => {
                  // Ranking logic: Rank wale pehle, baki baad mein
                  if (a.rank && b.rank) return a.rank - b.rank;
                  if (a.rank) return -1;
                  if (b.rank) return 1;
                  return 0;
                })
                .map(p => ({
                  user_id: p.user_id,
                  name: p.name,
                  avatar: p.avatar,
                  rank: p.rank || 0,
                  hasLeft: p.hasLeft,
                  rewardCoins: p.rewardCoins || 0,
                  rewardDiamonds: p.rewardDiamonds || 0
                }))
            });
            return await Room.deleteOne({ roomId:data?.roomId });

          }
        }
        console.log(`[${getISTTime()}] userTurn 🔄  ${finalRoom.roomId}`);
        io.to(finalRoom.roomId).emit("userTurn", {
          userTurn: finalRoom.turnIndex,
          remainingTimer: 30
        });

        const nextPlayer = finalRoom.players.find(p => p.user_id.toString() === finalRoom.turnIndex.toString());

        if (nextPlayer && nextPlayer.bot) {
          handleBotTurn(data.roomId, io); // Bot turn trigger
        } else {
          startTurnTimer(data.roomId, io); // Human turn timer start
        }

      }, totalAnimationTime);
    });


    socket.on("playerLeft", async ({ roomId, user_id }) => {
      // const { roomId, user_id } = data;
      // console.log("Manual Leave Triggered");
      try {
        const room = await Room.findOne({ roomId, status: "STARTED" }).lean();
        if (!room) return;

        const playerIndex = room.players.findIndex(p => p.user_id.toString() === user_id.toString());
        if (playerIndex === -1) return;
        // console.log("playerIndex", playerIndex)
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
        console.log(`[${getISTTime()}] playerLeft 🔄  ${roomId}`);
        io.to(roomId).emit("playerLeft", {
          user_id: user_id,

          message: `${user_id} is left. Game ended because no real players left.`
        });
        // console.log(remainingPlayers)
        // --- Check: Agar bache hue sab bots hain, toh room uda do ---
        const allRemainingAreBots = remainingPlayers.every(p => p.bot === true);
        if (allRemainingAreBots) {
          // console.log(`Room ${roomId} deleted: Only bots remaining.`);
          socket.leave(roomId);
          return await Room.deleteOne({ roomId });
        }

        // --- CASE 1: Single Winner Logic (Jab sirf ek real player bacha ho) ---
        if (remainingPlayers.length === 1) {
          const winnerPlayer = remainingPlayers[0];

          updateFields["status"] = "FINISHED";
          updateFields["winner"] = winnerPlayer.user_id;

          const finishedRoom = await Room.findOneAndUpdate(
            { roomId, status: "STARTED" },
            { $set: updateFields },
            { new: true, lean: true } // 3. Memory kam lega aur response fast aayega)
          ).select("-chat -cards");

          const winnerIdxInRoom = finishedRoom.players.findIndex(p => p.user_id === winnerPlayer.user_id);
          finishedRoom.players[winnerIdxInRoom].rank = 1;

          await calculateAndDistributePrize(finishedRoom, io);

          // 🔥 Yahan badlaav hai: Hum sirf winner ke socketId par emit kar rahe hain
          if (winnerPlayer.socketId) {
            console.log(`[${getISTTime()}] GameWinner 🔄  ${winnerPlayer.socketId}`);
            io.to(winnerPlayer.socketId).emit("GameWinner", {
              // room: getCleanRoom(finishedRoom),
              // winnerId: winnerPlayer.user_id,
              // results: finishedRoom.players.map(p => ({
              //   user_id: p.user_id,
              //   name: p.name,
              //   // isWinner: p.user_id === winnerPlayer.user_id,
              //    hasLeft: p.hasLeft,
              //   rewardCoins: p.rewardCoins || 0,
              //   rewardTrophies: p.rewardTrophies || 0
              // }))
              results: finishedRoom.players
                .sort((a, b) => {
                  // Ranking logic: Rank wale pehle, baki baad mein
                  if (a.rank && b.rank) return a.rank - b.rank;
                  if (a.rank) return -1;
                  if (b.rank) return 1;
                  return 0;
                })
                .map(p => ({
                  user_id: p.user_id,
                  name: p.name,
                  avatar: p.avatar,
                  rank: p.rank || 0,
                  hasLeft: p.hasLeft,
                  rewardCoins: p.rewardCoins || 0,
                  rewardDiamonds: p.rewardDiamonds || 0
                }))
            });
          }

          await Room.deleteOne({ roomId });
          socket.leave(roomId);
          return;
        }

        // --- CASE 2: Turn update logic (Agar game continue ho raha hai) ---
        let turnChanged = false;
        let nextPlayerId = room?.turnIndex; // Default purana hi rakhein

        if (room?.turnIndex?.toString() === user_id.toString()) {
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
          { roomId, status: "STARTED" },
          { $set: updateFields },
          { new: true, lean: true }
        ).select("-chat -cards");

        // Agar turn change hui hai, toh userTurn emit karein

        // const winnerPlayer = updatedRoom.players.find(player =>
        //   player.pawns.filter(pawn => pawn.status === "HOME").length >= 3
        // );
        // if (winnerPlayer) {
        //   // Internal rank set karein prize distribution ke liye
        //   const winnerIndex = updatedRoom.players.findIndex(p => p.user_id === winnerPlayer.user_id);
        //   updatedRoom.players[winnerIndex].rank = 1;

        //   // Status update karein
        //   const updatedRoom = await Room.findOneAndUpdate(
        //     { roomId: roomId, status: "STARTED" }, // 1. Double-check: Sirf chalti game ko hi khatam karein
        //     { $set: { status: "FINISHED", winner: winnerPlayer.user_id } },
        //     { new: true, lean: true } // 3. Memory kam lega aur response fast aayega}
        //   ).select("-chat -cards");

        //   // Lobby se plus (+) coins/trophies distribute karein
        //   await calculateAndDistributePrize(updatedRoom, io);

        //   // Emit GameWinner aur return kar dein (Taaki turn emit na ho)
        //   console.log(`[${getISTTime()}] GameWinner 🔄  ${roomId}`);
        //   return io.to(roomId).emit("GameWinner", {
        //     room: getCleanRoom(updatedRoom),
        //     winnerId: winnerPlayer.user_id,
        //     results: updatedRoom.players.map(p => ({
        //       user_id: p.user_id,
        //       name: p.name,
        //       isWinner: p.user_id === winnerPlayer.user_id,
        //       rewardCoins: p.rewardCoins || 0,
        //       rewardTrophies: p.rewardTrophies || 0
        //     }))
        //   });
        // }
        const activePlayers = updatedRoom.players.filter(p => !p.hasLeft && !p.isFinish);
        const nextRank = (updatedRoom.rankCounter || 0) + 1;
        if (activePlayers.length <= 1) {
          // Aakhri player ko rank assign karo
          if (activePlayers.length === 1) {
            await Room.updateOne(
              { roomId, "players.user_id": activePlayers[0].user_id },
              { $set: { "players.$.isFinish": true, "players.$.rank": nextRank } }
            );
          }

          const finalRoom = await Room.findOneAndUpdate(
            { roomId },
            { $set: { status: "FINISHED" } },
            { new: true, lean: true }
          );

          await calculateAndDistributePrize(finalRoom, io);

           io.to(roomId).emit("GameWinner", {
            // room: getCleanRoom(finalRoom),
            // results: finalRoom.players
            //   .sort((a, b) => (a.rank || 99) - (b.rank || 99))
            //   .map(p => ({
            //     user_id: p.user_id,
            //     name: p.name,
            //     rank: p.rank || 0,
            //     rewardCoins: p.rewardCoins || 0,
            //     rewardDiamonds: p.rewardDiamonds || 0
            //   }))
            results: finalRoom.players
              .sort((a, b) => {
                // Ranking logic: Rank wale pehle, baki baad mein
                if (a.rank && b.rank) return a.rank - b.rank;
                if (a.rank) return -1;
                if (b.rank) return 1;
                return 0;
              })
              .map(p => ({
                user_id: p.user_id,
                name: p.name,
                avatar: p.avatar,
                rank: p.rank || 0,
                hasLeft: p.hasLeft,
                rewardCoins: p.rewardCoins || 0,
                rewardDiamonds: p.rewardDiamonds || 0
              }))
          });
                    return await Room.deleteOne({ roomId });

        }
        if (turnChanged) {
          console.log(`[${getISTTime()}] userTurn 🔄  ${roomId}`);
          io.to(roomId).emit("userTurn", {
            userTurn: nextPlayerId,
            remainingTimer: 30
          });
        }

        socket.leave(roomId);

        // Bot trigger
        const nextPlayer = updatedRoom.players.find(p => p.user_id.toString() === updatedRoom?.turnIndex?.toString());
        if (nextPlayer && nextPlayer.bot) {
          setTimeout(() => handleBotTurn(roomId), 3000);
        } else { startTurnTimer(roomId, io) }

      } catch (err) {
        console.error("Leave Event Error:", err);
      }
    });
    // Jab internet jaye ya app close ho
    socket.on("disconnect", async () => {

    });
    socket.on("sendMessage", async ({ roomId, message }) => {
      const room = await Room.findOne({ roomId, status: "STARTED" }).lean();
      if (!room) return;
      const sender = room.players.find(p => p.user_id === socket.user_id);
      const chatData = { sender_id: sender.user_id, sender_name: sender.name, message, createdAt: new Date() };
      const updatedRoom = await Room.findOneAndUpdate({ roomId, status: "STARTED" }, { $push: { chat: chatData } }, { new: true, lean: true });
      io.to(roomId).emit("receiveMessage", updatedRoom.chat);
    });


  });
};