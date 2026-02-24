const mongoose = require("mongoose");

const CardSchema = new mongoose.Schema(
  {
    card_name: {
      type: String,
      required: true
    },

    card_value: {
      type: Number,
      default: null
    },

    move_type: {
      type: String,
      enum: ["FORWARD", "BACKWARD", "SPLIT", "SWAP", "SORRY"],
      required: true
    },

    forward_steps: {
      type: Number,
      default: 0
    },

    backward_steps: {
      type: Number,
      default: 0
    },

    is_split: {
      type: Boolean,
      default: false
    },

    is_swap: {
      type: Boolean,
      default: false
    },

    quantity: {
      type: Number,
      required: true
    },

    description: {
      type: String
    },

    status: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Card", CardSchema);
