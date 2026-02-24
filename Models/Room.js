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
    cosmetic_value:Number,
    hasLeft: { type: Boolean, default: false },
    homeCount: { type: Number, default: 0 },
    
});
const RoomSchema = new mongoose.Schema(
    {
        roomId: {
            type: String,
            required: true,
            unique: true
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
        gamelobby_id: { type: String },
        turnIndex: { type: String, default: 0 },
        winner: { type: String, default: null },
        chat: [ChatSchema],   // 🔥 ROOM CHAT
        sevenSplitUsed: { type: Number, default: 0 },
        status: {
            type: String,
            enum: ["WAITING", "STARTED", "FINISHED"],
            default: "STARTED"
        }
    },

    { timestamps: true, expires: 86400 }
);

module.exports = mongoose.model("Room", RoomSchema);
