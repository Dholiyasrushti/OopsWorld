const mongoose = require("mongoose");

const ChatSchema = new mongoose.Schema({
    sender_id: String,
    sender_name: String,
    sender_avatar: String,
    bot: {
        type: Boolean,
        default: false
    },
    message: String,
    emoji: Number,
    createdAt: {
        type: Date,
        default: Date.now
    }
});
const PawnSchema = new mongoose.Schema({
    pawnId: Number,
    color: String,
    startIndex: Number,
    position: Number,
    baseposition: Number,
    isMove: { type: Boolean, default: false },  // 0 = BASE
    isSlider: { type: Boolean, default: false },
    status: {
        type: String,
        enum: ["BASE", "ACTIVE", "SAFETY", "HOME"],
        default: "BASE"
    }
});

const PlayerSchema = new mongoose.Schema({
    user_id: String,
    name: String,
    socketId: String,
    avatar: Number,
    bot: Boolean,
    color: String,
    pawns: [PawnSchema],
    cosmetic: String,
    cosmetic_value: Number,
    hasLeft: { type: Boolean, default: false },
    homeCount: { type: Number, default: 0 },
    missedTurns: { type: Number, default: 3 },
    rank: { type: Number, default: 0 },
    isFinish:{ type: Boolean, default: false },
    rewardCoins: { type: Number, default: 0 },
    rewardDiamonds: { type: Number, default: 0 }

});
const RoomSchema = new mongoose.Schema(
    {
        roomId: {
            type: String,
            required: true,
            unique: true,
            index: true // ⚡ Indexing add ki gayi hai fast search ke liye
        },
        maxPlayers: {
            type: Number,
            required: true
        },
        players: [PlayerSchema],
        chosenMoveType: { type: String },
        cards: {
            type: Array,
            required: true
        },
        isCardOpen:{ type: Boolean, default: false },
        gamelobby_id: { type: String, index: true }, // Agar lobby se search karte ho toh index kaam ayega        
        turnIndex: { type: String, default: "" },
        winner: { type: String, default: null },
        chat: [ChatSchema],   // 🔥 ROOM CHAT
        sevenSplitUsed: { type: Number, default: 0 },
        status: {
            type: String,
            enum: ["WAITING", "STARTED", "FINISHED"],
            default: "WAITING",
            index: true
        },
        rankCounter: { type: Number, default: 0 },
        turnEndTime: { type: Date }
    },

    { timestamps: true });
RoomSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });
module.exports = mongoose.model("Room", RoomSchema);
