
const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    user_id: {
      type: String,
      required: function () {
        return !this.isGuest;
      },
      unique: true
    },
    avatar: {
      type: Number,
      default: 1
    },
    isGuest: {
      type: Boolean,
      default: false
    },
    coins: {
      type: Number,
      default: 5000
    },
    diamonds: {
      type: Number,
      default: 500
    },
    
    profile_pic: {
      type: String,
      default: null
    },
    jwtToken: {
      type: String,
      default: null
    },
    firebaseToken: {
      type: String,
      default: null
    },
    googlelogin: {
      type: Boolean,
      default: false
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    lastLogin: {
      type: Date,
      default: Date.now
    },
    cosmetic:{
      type: String,
      default: "Gold"
    },
    cosmetic_value:{
      type:Number,
      default: 1
    },
    // --- AUTO DELETE LOGIC ---
    expiresAt: {
      type: Date,
      default: function() {
        if (this.isGuest) {
          // Aaj se 30 din baad ki date
          return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        }
        return null; // Normal users ke liye koi expiry nahi
      },
      index: { expires: 0 } // MongoDB index jo timer 0 hote hi delete kar dega
    }
  },
  {
    versionKey: false 
  }
);

module.exports = mongoose.model("User", UserSchema);