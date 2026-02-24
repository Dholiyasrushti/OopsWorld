const mongoose = require("mongoose");

const RandomUserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true
    },
    avatar: {
      type: Number, // URL ya base64 image
      required: true
    },
    cosmetic: {
      type: String,
      default: "Gold"
    },
    cosmetic_value: {
      type: Number,
      default: 1
    },
  },
  {
    timestamps: true,
    versionKey: false
  }
);

module.exports = mongoose.model("RandomUser", RandomUserSchema);
