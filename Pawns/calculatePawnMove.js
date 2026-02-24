

// const { getLimits } = require("../Constants/constants");



// function calculatePawnMove(pawn, card, playerCount, chosenMoveType = null) {
//     const isFourPlayer = playerCount === 4;
//     const boardEnd = isFourPlayer ? 58 : 38;
//     const entranceCell = isFourPlayer ? 59 : 39;
//     const totalBoardPositions = isFourPlayer ? 60 : 40;

//     // Aapki requirement: 4P ke liye 6 steps, 2P ke liye 5 steps
//     const safetyPathLength = isFourPlayer ? 6 : 5;
//     const homeEnd = entranceCell + safetyPathLength;

//     let newPawn = { ...pawn };
//     newPawn.position = pawn.position || 0;
//     newPawn.status = pawn.status || "BASE";

//     if (newPawn.error) delete newPawn.error;

//     let activeMoveType = chosenMoveType || card.move_type;
//     if (activeMoveType === "SPLIT" || activeMoveType == "SORRY" || activeMoveType== 'SWAP' ) activeMoveType = "FORWARD";

//     // --- CASE 1: BASE SE NIKALNA ---
//     if (pawn.status === "BASE") {
//         if (activeMoveType === "FORWARD" && card.forward_steps > 0) {
//             newPawn.status = "ACTIVE";
//             newPawn.position = (-1) + (card.forward_steps);

//         } else if (activeMoveType == "BACKWARD") {
//             return { ...pawn, error: `Invalid: Need ${card.backward_steps}` };
//             x
//         }
//         return newPawn;
//     }

//     // --- CASE 2: ACTIVE (Board par circular move) ---
//     else if (pawn.status === "ACTIVE") {
//         let nextPos = pawn.position;

//         if (activeMoveType === "FORWARD") {
//             let startPos = pawn.position;
//             let steps = card?.forward_steps;

//             // --- DYNAMIC VALIDATION ---
//             // Distance = (Board bacha hua) + (Safety Entry Jump) + (Safety Path Steps)


//             if (startPos === entranceCell) {
//                 nextPos = steps - 1;
//             } else {
//                 let distanceToHome = (boardEnd - startPos) + 1 + safetyPathLength;

//                 if (steps > distanceToHome) {
//                     return { ...pawn, error: `Invalid: Need exactly ${distanceToHome} to reach Home, but got ${steps}` };
//                 }

//                 nextPos = startPos + steps;

//                 if (startPos <= boardEnd && nextPos >= entranceCell) {
//                     newPawn.status = "SAFETY";
//                     nextPos += 1;
//                 }
//             }

//             if (nextPos > homeEnd) return { ...pawn, error: "Too many steps for Home" };

//             if (nextPos > entranceCell) {
//                 newPawn.status = "SAFETY";
//                 if (nextPos === homeEnd){ newPawn.status = "HOME";
//                     console.log("v hoonfklndf")
//                 };
//             } else {
//                 newPawn.status = "ACTIVE";
//             }

//         }
//         else if (activeMoveType === "BACKWARD") {
//             nextPos -= card.backward_steps;
//             if (nextPos < 0) {
//                 nextPos = totalBoardPositions + nextPos;
//             }
//         }
//         newPawn.position = nextPos;
//     }

//     // --- CASE 3: SAFETY ZONE ---
//     else if (pawn.status === "SAFETY") {
//         let nextPos = pawn.position;
//         let currentPos = pawn.position;

//         if (activeMoveType === "FORWARD") {
//             let distanceToHome = homeEnd - currentPos;
//             if (card.forward_steps > distanceToHome) {
//                 return { ...pawn, error: `Invalid: Need ${distanceToHome} steps, but got ${card.forward_steps}` };
//             }

//             nextPos += card.forward_steps;
//             if (nextPos === homeEnd) newPawn.status = "HOME";
//             newPawn.position = nextPos;
//         }
//         else if (activeMoveType === "BACKWARD") {
//             nextPos -= card.backward_steps;
//             if (currentPos > entranceCell && nextPos <= entranceCell) {
//                 nextPos -= 1;
//             }
//             if (nextPos <= entranceCell) {
//                 newPawn.status = "ACTIVE";
//                 if (nextPos < 0) {
//                     nextPos = totalBoardPositions + nextPos;
//                 }
//             }
//             newPawn.position = nextPos;
//         }
//     }

//     return newPawn;
// }

// module.exports = calculatePawnMove;

// const { getLimits } = require("../Constants/constants");

// Parameter mein 'player' add kiya gaya hai taaki self-pawn check ho sake
// function calculatePawnMove(pawn, card, playerCount, chosenMoveType = null, player = null) {
//     const isFourPlayer = playerCount === 4;
//     const boardEnd = isFourPlayer ? 58 : 38;
//     const entranceCell = isFourPlayer ? 59 : 39;
//     const totalBoardPositions = isFourPlayer ? 60 : 40;
//     const safetyPathLength = isFourPlayer ? 6 : 5;
//     const homeEnd = entranceCell + safetyPathLength;

//     let newPawn = { ...pawn };
//     newPawn.position = pawn.position || 0;
//     newPawn.status = pawn.status || "BASE";

//     if (newPawn.error) delete newPawn.error;

//     let activeMoveType = chosenMoveType || card.move_type;
//     if (activeMoveType === "SPLIT" || activeMoveType == "SORRY" || activeMoveType == 'SWAP') activeMoveType = "FORWARD";

//     // helper to get global position for comparison
//     const getGlobalPos = (pos, startIdx) => {
//         if (pos === -1) return -100;
//         if (pos > boardEnd) return 1000 + pos; // Safety zone
//         return (pos + startIdx) % totalBoardPositions;
//     };

//     // --- CASE 1: BASE SE NIKALNA ---
//     if (pawn.status === "BASE") {
//         if (activeMoveType === "FORWARD" && card?.forward_steps > 0) {
//             newPawn.status = "ACTIVE";
//             newPawn.position = (-1) + (card?.forward_steps);
//         } else if (activeMoveType == "BACKWARD") {
//             return { ...pawn, error: `Invalid: Need ${card?.backward_steps}` };
//         }
//     }
//     // --- CASE 2: ACTIVE (Board par circular move) ---
//     else if (pawn.status === "ACTIVE") {
//         let nextPos = pawn?.position;
//         if (activeMoveType === "FORWARD") {
//             let startPos = pawn.position;
//             let steps = card?.forward_steps;

//             if (startPos === entranceCell) {
//                 nextPos = steps - 1;
//             } else {
//                 let distanceToHome = (boardEnd - startPos) + 1 + safetyPathLength;
//                 if (steps > distanceToHome) {
//                     return { ...pawn, error: `Invalid: Need exactly ${distanceToHome} to reach Home` };
//                 }
//                 nextPos = startPos + steps;
//                 if (startPos <= boardEnd && nextPos >= entranceCell) {
//                     newPawn.status = "SAFETY";
//                     nextPos += 1;
//                 }
//             }
//             if (nextPos > homeEnd) return { ...pawn, error: "Too many steps for Home" };
//             if (nextPos > entranceCell) {
//                 newPawn.status = "SAFETY";
//                 if (nextPos === homeEnd) newPawn.status = "HOME";
//             } else {
//                 newPawn.status = "ACTIVE";
//             }
//         }
//         else if (activeMoveType === "BACKWARD") {
//             nextPos -= card.backward_steps;
//             if (nextPos < 0) nextPos = totalBoardPositions + nextPos;
//         }
//         newPawn.position = nextPos;
//     }
//     // --- CASE 3: SAFETY ZONE ---
//     else if (pawn.status === "SAFETY") {
//         let nextPos = pawn?.position;
//         let currentPos = pawn?.position;
//         if (activeMoveType === "FORWARD") {
//             let distanceToHome = homeEnd - currentPos;
//             if (card?.forward_steps > distanceToHome) return { ...pawn, error: "Too many steps" };
//             nextPos += card?.forward_steps;
//             if (nextPos === homeEnd) newPawn.status = "HOME";
//             newPawn.position = nextPos;
//         }
//         else if (activeMoveType === "BACKWARD") {
//             nextPos -= card?.backward_steps;
//             if (currentPos > entranceCell && nextPos <= entranceCell) nextPos -= 1;
//             if (nextPos <= entranceCell) {
//                 newPawn.status = "ACTIVE";
//                 if (nextPos < 0) nextPos = totalBoardPositions + nextPos;
//             }
//             newPawn.position = nextPos;
//         }
//     }

//     // --- SELF-BLOCKING CHECK (Naya Addition) ---
//     // Agar move valid hai aur pawn HOME nahi pahuncha hai, toh check karein koi apna pawn wahan hai toh nahi
//     if (!newPawn.error && newPawn?.status !== "HOME" && player) {
//         const targetGlobal = getGlobalPos(newPawn?.position, pawn?.startIndex);

//         const isBlocked = player.pawns.some(p => {
//             if (p?.pawnId === pawn?.pawnId || p?.status === "BASE" || p?.status === "HOME") return false;
//             const otherGlobal = getGlobalPos(p?.position, p?.startIndex);
//             return otherGlobal === targetGlobal;
//         });

//         if (isBlocked) {
//             return { ...pawn, error: "Position blocked by your own pawn" };
//         }
//     }

//     return newPawn;
// }

// module.exports = calculatePawnMove;



const { getLimits } = require("../Constants/constants");
  
// function calculatePawnMove(pawn, card, playerCount, chosenMoveType = null, player = null) {
//     try {
//         // Validation: Agar pawn data hi nahi hai toh process nahi kar sakte
//         if (!pawn) throw new Error("Pawn data is missing");

//         const isFourPlayer = playerCount === 4;
//         const boardEnd = isFourPlayer ? 58 : 38;
//         const entranceCell = isFourPlayer ? 59 : 39;
//         const totalBoardPositions = isFourPlayer ? 60 : 40;
//         const safetyPathLength = isFourPlayer ? 6 : 5;
//         const homeEnd = entranceCell + safetyPathLength;

//         let newPawn = { ...pawn };
//         newPawn.position = pawn.position || 0;
//         newPawn.status = pawn.status || "BASE";

//         if (newPawn.error) delete newPawn.error;

//         // Card validation: Agar card undefined hai toh move possible nahi
//         let activeMoveType = chosenMoveType || card?.move_type;
//         if (!activeMoveType) throw new Error("Invalid card or move type");

//         if (activeMoveType === "SPLIT" || activeMoveType == "SORRY" || activeMoveType == 'SWAP') {
//             activeMoveType = "FORWARD";
//         }

//         // helper to get global position for comparison
//         const getGlobalPos = (pos, startIdx) => {
//             if (pos === -1) return -100;
//             if (pos > boardEnd) return 1000 + pos; // Safety zone
//             return (pos + (startIdx || 0)) % totalBoardPositions;
//         };

//         // --- CASE 1: BASE SE NIKALNA ---
//         if (pawn.status === "BASE") {
//             if (activeMoveType === "FORWARD" && card?.forward_steps > 0) {
//                 newPawn.status = "ACTIVE";
//                 newPawn.position = (-1) + (card?.forward_steps);
//             } else if (activeMoveType == "BACKWARD") {
//                 return { ...pawn, error: `Invalid: Need ${card?.backward_steps}` };
//             }
//         }
//         // --- CASE 2: ACTIVE (Board par circular move) ---
//         else if (pawn.status === "ACTIVE") {
//             let nextPos = pawn?.position;
//             if (activeMoveType === "FORWARD") {
//                 let startPos = pawn.position;
//                 let steps = card?.forward_steps || 0;

//                 if (startPos === entranceCell) {
//                     nextPos = steps - 1;
//                 } else {
//                     let distanceToHome = (boardEnd - startPos) + 1 + safetyPathLength;
//                     if (steps > distanceToHome) {
//                         return { ...pawn, error: `Invalid: Need exactly ${distanceToHome} to reach Home` };
//                     }
//                     nextPos = startPos + steps;
//                     if (startPos <= boardEnd && nextPos >= entranceCell) {
//                         newPawn.status = "SAFETY";
//                         nextPos += 1;
//                     }
//                 }
//                 if (nextPos > homeEnd) return { ...pawn, error: "Too many steps for Home" };
//                 if (nextPos > entranceCell) {
//                     newPawn.status = "SAFETY";
//                     if (nextPos === homeEnd) newPawn.status = "HOME";
//                 } else {
//                     newPawn.status = "ACTIVE";
//                 }
//             }
//             else if (activeMoveType === "BACKWARD") {
//                 nextPos -= (card?.backward_steps || 0);
//                 if (nextPos < 0) nextPos = totalBoardPositions + nextPos;
//             }
//             newPawn.position = nextPos;
//         }
//         // --- CASE 3: SAFETY ZONE ---
//         else if (pawn.status === "SAFETY") {
//             let nextPos = pawn?.position;
//             let currentPos = pawn?.position;
//             if (activeMoveType === "FORWARD") {
//                 let distanceToHome = homeEnd - currentPos;
//                 if (card?.forward_steps > distanceToHome) {
//                     return { ...pawn, error: `Invalid: Need ${distanceToHome} steps, but got ${card.forward_steps}` };

//                 }
//                 nextPos += (card?.forward_steps || 0);
//                 if (nextPos === homeEnd) newPawn.status = "HOME";
//                 newPawn.position = nextPos;
//             }
//             else if (activeMoveType === "BACKWARD") {
//                 nextPos -= (card?.backward_steps || 0);
//                 if (currentPos > entranceCell && nextPos <= entranceCell) nextPos -= 1;
//                 if (nextPos <= entranceCell) {
//                     newPawn.status = "ACTIVE";
//                     if (nextPos < 0) nextPos = totalBoardPositions + nextPos;
//                 }
//                 newPawn.position = nextPos;
//             }
//         }

//         // --- SELF-BLOCKING CHECK ---
//         if (!newPawn.error && newPawn?.status !== "HOME" && player) {
//             const targetGlobal = getGlobalPos(newPawn?.position, pawn?.startIndex);
//             const isBlocked = player.pawns.some(p => {
//                 if (p?.pawnId === pawn?.pawnId || p?.status === "BASE" || p?.status === "HOME") return false;
//                 const otherGlobal = getGlobalPos(p?.position, p?.startIndex);
//                 return otherGlobal === targetGlobal;
//             });

//             if (isBlocked) {
//                 return { ...pawn, error: "Position blocked by your own pawn" };
//             }
//         }

//         return newPawn;

//     } catch (error) {
//         console.error("Error in calculatePawnMove:", error.message);
//         socket.emit("error", { message: "Internal server error: " + err.message });
//         // Error hone par hum wahi purana pawn return karte hain with error message
//         return { ...pawn, error: "Internal calculation error" };
//     }
// }



function calculatePawnMove(pawn, card, playerCount, chosenMoveType = null, player = null) {
    try {
        if (!pawn) throw new Error("Pawn data is missing");

        const isFourPlayer = playerCount === 4;
        const boardEnd = isFourPlayer ? 58 : 38;
        const entranceCell = isFourPlayer ? 59 : 39;
        const totalBoardPositions = isFourPlayer ? 60 : 40;
        const safetyPathLength = isFourPlayer ? 6 : 5;
        const homeEnd = entranceCell + safetyPathLength;

        let newPawn = { ...pawn };
        newPawn.position = pawn.position || 0;
        newPawn.status = pawn.status || "BASE";

        if (newPawn.error) delete newPawn.error;

        let activeMoveType = chosenMoveType || card?.move_type;
        if (!activeMoveType) throw new Error("Invalid card or move type");

        if (activeMoveType === "SPLIT" || activeMoveType == "SORRY" || activeMoveType == 'SWAP') {
            activeMoveType = "FORWARD";
        }

        const getGlobalPos = (pos, startIdx) => {
            if (pos === -1) return -100;
            // 💡 CHANGE: Safety zone positions ko unique ID dena zaroori hai
            if (pos > boardEnd) return (1000 * (startIdx + 1)) + pos; 
            return (pos + (startIdx || 0)) % totalBoardPositions;
        };

        if (pawn.status === "BASE") {
            if (activeMoveType === "FORWARD" && card?.forward_steps > 0) {
                newPawn.status = "ACTIVE";
                newPawn.position = (-1) + (card?.forward_steps);
            } else if (activeMoveType == "BACKWARD") {
                return { ...pawn, error: `Invalid: Need ${card?.backward_steps}` };
            }
        }
        else if (pawn.status === "ACTIVE") {
            let nextPos = pawn?.position;
            if (activeMoveType === "FORWARD") {
                let startPos = pawn.position;
                let steps = card?.forward_steps || 0;

                if (startPos === entranceCell) {
                    nextPos = steps - 1;
                } else {
                    let distanceToHome = (boardEnd - startPos) + 1 + safetyPathLength;
                    if (steps > distanceToHome) {
                        return { ...pawn, error: `Invalid: Need exactly ${distanceToHome} to reach Home` };
                    }
                    nextPos = startPos + steps;
                    if (startPos <= boardEnd && nextPos >= entranceCell) {
                        newPawn.status = "SAFETY";
                        nextPos += 1;
                    }
                }
                if (nextPos > homeEnd) return { ...pawn, error: "Too many steps for Home" };
                if (nextPos > entranceCell) {
                    newPawn.status = "SAFETY";
                    if (nextPos === homeEnd) newPawn.status = "HOME";
                } else {
                    newPawn.status = "ACTIVE";
                }
            }
            else if (activeMoveType === "BACKWARD") {
                nextPos -= (card?.backward_steps || 0);
                if (nextPos < 0) nextPos = totalBoardPositions + nextPos;
            }
            newPawn.position = nextPos;
        }
        else if (pawn.status === "SAFETY") {
            let nextPos = pawn?.position;
            let currentPos = pawn?.position;
            if (activeMoveType === "FORWARD") {
                let distanceToHome = homeEnd - currentPos;
                if (card?.forward_steps > distanceToHome) {
                    return { ...pawn, error: `Invalid: Need ${distanceToHome} steps, but got ${card.forward_steps}` };
                }
                nextPos += (card?.forward_steps || 0);
                if (nextPos === homeEnd) newPawn.status = "HOME";
                newPawn.position = nextPos;
            }
            else if (activeMoveType === "BACKWARD") {
                nextPos -= (card?.backward_steps || 0);
                if (currentPos > entranceCell && nextPos <= entranceCell) nextPos -= 1;
                if (nextPos <= entranceCell) {
                    newPawn.status = "ACTIVE";
                    if (nextPos < 0) nextPos = totalBoardPositions + nextPos;
                }
                newPawn.position = nextPos;
            }
        }

        // --- SELF-BLOCKING CHECK ---
        if (!newPawn.error && newPawn?.status !== "HOME" && player) {
            const targetGlobal = getGlobalPos(newPawn?.position, pawn?.startIndex);
            const isBlocked = player.pawns.some(p => {
                // Apna ID check karein aur ensure karein target pawn Active/Safety hai
                if (p?.pawnId.toString() === pawn?.pawnId.toString() || p?.status === "BASE" || p?.status === "HOME") return false;
                const otherGlobal = getGlobalPos(p?.position, p?.startIndex);
                return otherGlobal === targetGlobal;
            });

            if (isBlocked) {
                return { ...pawn, error: "Position blocked by your own pawn" };
            }
        }

        return newPawn;

    } catch (error) {
        console.error("Error in calculatePawnMove:", error.message);
        return { ...pawn, error: "Internal calculation error" };
    }
}

module.exports = calculatePawnMove;