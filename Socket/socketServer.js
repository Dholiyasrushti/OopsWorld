const { Server } = require("socket.io");
const User = require("../Models/Users");
const RandomUser = require("../Models/RandomUser");
const Card = require("../Models/Card");
const Room = require("../Models/Room");
const getAvatarById = require("../Utils/getAvatarById");

const { generateShuffledDeck } = require("../Utils/cardUtils");
require("dotenv").config();
module.exports = (server) => {
  const io = new Server(server, {
    cors: { origin: "*" }
  });

  let waitingUser = null;
  let waitingTimer = null;
  const onlineUsers = new Map();        // user_id -> socket.id
  const disconnectTimers = new Map();  // user_id -> timeout
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("joinGame", async ({ user_id }) => {
      console.log("user_id", user_id)

      if (disconnectTimers.has(user_id)) {
        clearTimeout(disconnectTimers.get(user_id));
        disconnectTimers.delete(user_id);
        console.log("User reconnected:", user_id);
      }

      onlineUsers.set(user_id, socket.id);
      socket.user_id = user_id;
      const cardsFromDB = await Card.find({});
      const deck = generateShuffledDeck(cardsFromDB);
      try {
        const user = await User.findOne({ user_id }).lean();
        if (!user) {
          socket.emit("error", { message: "User not found!" });
          return;
        }
        if (user.profile_pic) {
          user.profile_pic = process.env.BASE_URL + user.profile_pic;
        }

        if (user.avatar) {
          const avatarPath = getAvatarById(user.avatar);
          user.avatar = process.env.BASE_URL + avatarPath;
        }

        const currentUser = {
          ...user,
          socketId: socket.id,
          bot: false
        };

        // ✅ If waiting user exists → match immediately
        if (waitingUser && waitingUser.user_id !== currentUser.user_id) {
          clearTimeout(waitingTimer);

          const roomId =
            "room_" + Math.random().toString(36).substring(2, 10);



          await Room.create({
            roomId,
            players: [
              {
                user_id: waitingUser.user_id,
                name: waitingUser.username,
                avatar: waitingUser.avatar,
                profile_pic: waitingUser.profile_pic,
                socketId: waitingUser.socketId,
                bot: false
              },
              {
                user_id: botUser.user_id || null,
                name: botUser.name,
                avatar: botUser.avatar,
                bot: true
              }
            ],
            cards: deck
          });
          io.to(waitingUser.socketId).emit("gameStart", {
            roomId,
            players: [waitingUser, currentUser],
            card: deck
          });

          io.to(currentUser.socketId).emit("gameStart", {
            roomId,
            players: [waitingUser, currentUser],
            card: deck
          });

          waitingUser = null;
          waitingTimer = null;
          return;
        }

        // ⏳ No waiting user → wait 30 sec
        waitingUser = currentUser;

        waitingTimer = setTimeout(async () => {
          try {
            if (!waitingUser) return;

            // ✅ BOT FROM RandomUser TABLE
            const count = await RandomUser.countDocuments();
            if (count === 0) return;

            const randomIndex = Math.floor(Math.random() * count);
            let botDB = await RandomUser.findOne()
              .skip(randomIndex)
              .lean();

            // ✅ BOT avatar URL fix
            if (botDB.avatar) {
              const botAvatarPath = getAvatarById(botDB.avatar);
              botDB.avatar = process.env.BASE_URL + botAvatarPath;
            }
            const botUser = {
              ...botDB,
              bot: true
            };
            const roomId =
              "room_" + Math.random().toString(36).substring(2, 10);


            await Room.create({
              roomId,
              players: [
                {
                  user_id: waitingUser.user_id,
                  name: waitingUser.name,
                  avatar: waitingUser.avatar,
                  profile_pic: waitingUser.profile_pic,
                  socketId: waitingUser.socketId,
                  bot: false
                },
                {
                  user_id: botUser.user_id || null,
                  name: botUser.name,
                  avatar: botUser.avatar,
                  bot: true
                }
              ],
              cards: deck
            });
            io.to(waitingUser.socketId).emit("gameStart", {
              roomId,
              players: [waitingUser, botUser],
              card: deck
            });

            console.log("🤖 Bot room created:", roomId);

            waitingUser = null;
            waitingTimer = null;
          } catch (err) {
            console.error("Bot error:", err);
          }
        }, 30000);
      } catch (err) {
        console.error(err);
        socket.emit("error", { message: "Something went wrong" });
      }
    });

    socket.on("disconnect", () => {
      const user_id = socket.user_id;
      if (!user_id) return;

      console.log("Disconnected:", user_id);

      const timer = setTimeout(async () => {
        try {
          console.log("❌ User not reconnected, deleting room");

          // 🔍 find room
          const room = await Room.findOne({ "players.user_id": user_id });

          if (!room) return;

          const roomId = room.roomId;

          // 🔔 notify remaining players
          room.players.forEach(p => {
            if (p.user_id !== user_id && p.socketId) {
              io.to(p.socketId).emit("roomClosed", {
                roomId,
                reason: "opponent_disconnected"
              });
            }
          });

          // 🗑️ delete room
          await Room.deleteOne({ _id: room._id });

          onlineUsers.delete(user_id);
          disconnectTimers.delete(user_id);

          console.log("🗑️ Room deleted:", roomId);

        } catch (err) {
          console.error("Room delete error:", err);
        }
      }, 60 * 1000); // 1 minute

      disconnectTimers.set(user_id, timer);
    });


  });
};






    // socket.on("cardOpen", async ({ user_id, roomId }) => {
    //   console.log("userId", user_id, "roomId", roomId)
    //   try {
    //     // 1. Room find karein database se (Lean use karein fast read ke liye)
    //     const room = await Room.findOne({ roomId }).lean();
    //     if (!room) return socket.emit("error", { message: "Room not found" });
    //     // console.log("room",room.cards,room.players[room.turnIndex])
    //     // 2. Turn check karein
    //     const currentPlayer = room.players[room.turnIndex];
    //     if (currentPlayer.user_id.toString() !== user_id.toString()) {
    //       return socket.emit("error", { message: "It's not your turn!" });
    //     }

    //     // 3. Card check karein (Sirf pehla card read karenge)
    //     if (!room.cards || room.cards.length === 0) {
    //       return socket.emit("error", { message: "No cards available in deck!" });
    //     }

    //     // Shift ki jagah sirf index 0 ka data uthayenge (Isse original array change nahi hoga)
    //     const openedCard = room.cards[0];

    //     // 4. cardSwap event emit karein
    //     // Room update karne ki zarurat nahi hai jaisa aapne kaha
    //     io.to(roomId).emit("cardOpen", {
    //       user_id: user_id,
    //       card: {
    //         card_id: openedCard._id,
    //         card_name: openedCard.card_name,
    //         card_value: openedCard.card_value,
    //         move_type: openedCard.move_type,
    //         forward_steps: openedCard.forward_steps,
    //         backward_steps: openedCard.backward_steps,
    //         is_split: openedCard.is_split,
    //         is_swap: openedCard.is_swap,
    //         description: openedCard.description
    //       }
    //     });


    //   } catch (err) {
    //     console.error("Error in cardOpen:", err);
    //     socket.emit("error", { message: "Internal server error" });
    //   }
    // });
//     socket.on("cardOpen", async ({ user_id, roomId }) => {
//     try {
//         const room = await Room.findOne({ roomId }); 
//         if (!room) return socket.emit("error", { message: "Room not found" });

//         const currentPlayer = room.players[room.turnIndex];
//         if (currentPlayer.user_id.toString() !== user_id.toString()) {
//             return socket.emit("error", { message: "It's not your turn!" });
//         }

//         const openedCard = room.cards[0];

//         // 1. Emit Card Open (Sabko card dikhao)
//         io.to(roomId).emit("cardOpen", {
//             user_id: user_id,
//             card: openedCard
//         });

//         // 2. CHECK ALL PAWNS (Chahe 3 hon ya 4)
//         let canMove = false;
//         const playerCount = room.players.length;

//         // Pawns filter karein jo abhi tak HOME nahi pahunche hain
//         const activePawns = currentPlayer.pawns.filter(p => p.status !== "HOME");

//         for (let pawn of activePawns) {
//             // calculatePawnMove check karega scenarios like:
//             // - Kya -4 card base wale pawn ko move kar sakta hai? (Nahi)
//             // - Kya 12 steps wala card 10 step duri wale pawn ko move kar sakta hai? (Nahi)
//             let moveResult = calculatePawnMove(pawn, openedCard, playerCount);
            
//             // Agar result mein error nahi hai, iska matlab ye pawn move ho sakta hai!
//             if (!moveResult.error) {
//                 canMove = true;
//                 break; // Ek bhi pawn mil gaya toh loop break kar do
//             }
//         }

//         // 3. AUTO SKIP LOGIC
//         if (!canMove) {
//             console.log(`User ${user_id} has no valid moves with card ${openedCard.card_name}. Skipping...`);
            
//             setTimeout(async () => {
//                 // Room data fresh fetch karein (avoid race conditions)
//                 const freshRoom = await Room.findOne({ roomId });
//                 if (!freshRoom) return;

//                 // Turn change logic
//                 const nextTurnIndex = (freshRoom.turnIndex + 1) % freshRoom.players.length;
                
//                 // Update DB: Turn aage badhao aur card remove karo
//                 const updatedRoom = await Room.findOneAndUpdate(
//                     { roomId },
//                     { 
//                         $set: { turnIndex: nextTurnIndex, sevenSplitUsed: 0 },
//                         $pop: { cards: -1 } 
//                     },
//                     { new: true }
//                 ).lean();

//                 // Frontend ko update bhejein
//                 io.to(roomId).emit("playCard", { 
//                     room: getCleanRoom(updatedRoom),
//                     // autoSkipped: true,
//                     // message: "No moves possible. Turn skipped automatically!"
//                 });

//                 // Bot turn handle karein agar agla player bot hai
//                 if (updatedRoom.players[updatedRoom.turnIndex].bot) {
//                     handleBotTurn(roomId);
//                 }
//             }, 2000); 
//         }

//     } catch (err) {
//         console.error("Error in cardOpen:", err);
//         socket.emit("error", { message: "Internal server error" });
//     }
// });