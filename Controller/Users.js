const User = require("../Models/Users");
const { generateToken } = require("../Utils/generateToken")
const saveImage = require("../Utils/saveImage")
const getAvatarById = require("../Utils/getAvatarById")
require("dotenv").config();
class UsersController {

  async loginOrSignup(req, res) {
    try {
      const {
        user_id,
        username,
        isGuest,
        firebaseToken,
        profile_pic, // base64
        avatar       // avatar_id (1–7)
      } = req.body;

      if (!isGuest && (!user_id || !username)) {
        return res.status(400).json({
          success: false,
          message: "user_id and username are required for non-guest users"
        });
      }

      let user = await User.findOne({ user_id });
      // console.log("user",user)
      if (user) {

        if (firebaseToken) {
          user.firebaseToken = firebaseToken;
        }

        // 🔹 JWT generate (permanent)
        if (!user.jwtToken) {
          user.jwtToken = generateToken(user);
        }

        await user.save();


        let responseUser = user.toObject();

        // console.log("responseUser",responseUser)
        if (responseUser.profile_pic) {
          responseUser.profile_pic =
            process.env.BASE_URL + responseUser.profile_pic;
        }

        if (responseUser.avatar) {
          const avatarPath = getAvatarById(responseUser.avatar);
          responseUser.profile_pic =
            process.env.BASE_URL + avatarPath;
        }

        return res.json({
          success: true,
          message: "User found",
          data: responseUser
        });
      }

      /* =========================
         🔹 CREATE NEW USER
      ========================== */
      const newUser = new User({
        user_id: user_id || `guest_${Date.now()}`,
        username: username || "Guest",
        isGuest: !!isGuest,
        firebaseToken: firebaseToken || null,
        coins: 5000,
        diamonds: 500,
        avatar: avatar || 1,
      });

      // 👉 Profile Pic
      if (profile_pic) {
        const imgPath = saveImage(
          profile_pic,
          "Users",
          newUser.username,
          newUser.user_id
        );

        newUser.profile_pic = imgPath;

      }



      newUser.jwtToken = generateToken(newUser);
      await newUser.save();
      // console.log("newUser", newUser)
      let responseUser = newUser.toObject();

      // 👉 Agar profile_pic saved hai (user upload wali)
      if (responseUser.profile_pic) {
        responseUser.profile_pic =
          process.env.BASE_URL + responseUser.profile_pic;
      }
      // 👉 Agar profile_pic nahi hai → avatar se do
      else {
        const avatarPath = getAvatarById(responseUser.avatar_id || responseUser.avatar);
        responseUser.profile_pic =
          process.env.BASE_URL + avatarPath;
      }
      return res.status(201).json({
        success: true,
        message: "User created successfully",
        data: responseUser
      });

    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Operation failed",
        error: error.message
      });
    }
  }
  // Is method ko class ke andar add karein
  async updateSession(req, res) {
    try {
      const { user_id } = req.body;

      if (!user_id) {
        return res.status(400).json({ success: false, message: "user_id is required" });
      }

      const user = await User.findOne({ user_id });

      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      // 1. Update lastLogin date
      user.lastLogin = Date.now();

      // 2. Agar Guest hai to 30 days expiry reset karein
      if (user.isGuest) {
        user.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      } else {
        user.expiresAt = null; // Permanent user ke liye koi expiry nahi
      }

      await user.save();

      return res.json({
        success: true,
        message: "Session extended successfully",
        expiresAt: user.expiresAt
      });

    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Server Error",
        error: error.message
      });
    }
  }

  async creditWallet(req, res) {
    try {
      const { user_id, amount, diamonds } = req.body;

      if (!user_id) {
        return res.status(400).json({ success: false, message: "user_id is required" });
      }

      const user = await User.findOne({ user_id });
      if (!user) return res.status(404).json({ success: false, message: "User not found" });

      // 1. Agar amount mila toh coins add karein aur track karein
      if (amount && Number(amount) > 0) {
        user.coins += Number(amount);
        // user.total_credited += Number(amount);
      }

      // 2. Agar diamonds mile toh diamonds add karein
      if (diamonds && Number(diamonds) > 0) {
        user.diamonds += Number(diamonds);
      }

      // Session extend logic (Kyuki user ne transaction kiya hai)
      user.lastLogin = Date.now();
      if (user.isGuest) {
        user.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      }

      await user.save();

      return res.json({
        success: true,
        message: "Wallet updated successfully",
        data: {
          coins: user.coins,
          diamonds: user.diamonds,

          expiresAt: user.expiresAt
        }
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }


  async debitWallet(req, res) {
    try {
      const { user_id, amount, diamonds } = req.body;

      if (!user_id) {
        return res.status(400).json({ success: false, message: "user_id is required" });
      }

      const user = await User.findOne({ user_id });
      if (!user) return res.status(404).json({ success: false, message: "User not found" });

      // 1. Agar amount mila toh coins add karein aur track karein
      if (amount && Number(amount) > 0) {
        user.coins -= Number(amount);
        // user.total_debited -= Number(amount);
      }

      // 2. Agar diamonds mile toh diamonds add karein
      if (diamonds && Number(diamonds) > 0) {
        user.diamonds -= Number(diamonds);
      }

      // Session extend logic (Kyuki user ne transaction kiya hai)
      user.lastLogin = Date.now();
      if (user.isGuest) {
        user.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      }

      await user.save();

      return res.json({
        success: true,
        message: "Wallet updated successfully",
        data: {
          coins: user.coins,
          diamonds: user.diamonds,

          expiresAt: user.expiresAt
        }
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  async updateProfile(req, res) {
    try {
      const { user_id, username, avatar } = req.body;
      console.log(req.body);
      if (!user_id) {
        return res.status(400).json({ success: false, message: "user_id is required" });
      }

      // User dhoondein
      const user = await User.findOne({ user_id });
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      // Fields update karein (sirf wahi jo body mein aaye hain)
      if (username) user.username = username;
      if (avatar) user.avatar = avatar;

      // Session extend logic (Kyuki user ne profile update ki hai, matlab wo active hai)
      user.lastLogin = Date.now();
      if (user.isGuest) {
        user.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      }

      await user.save();

      // Response mein updated image path dikhane ke liye logic
      let responseData = user.toObject();
      if (responseData.avatar) {
        const avatarPath = getAvatarById(responseData.avatar);
        responseData.profile_pic = process.env.BASE_URL + avatarPath;
      }

      return res.json({
        success: true,
        message: "Profile updated successfully",
        data: responseData
      });

    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Update failed",
        error: error.message
      });
    }
  }

  async cosmeticUpdate(req, res) {
    try {
      const { user_id, cosmetic,cosmetic_value } = req.body;
      console.log(req.body);
      if (!user_id) {
        return res.status(400).json({ success: false, message: "user_id is required" });
      }

      // User dhoondein
      const user = await User.findOne({ user_id });
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      // Fields update karein (sirf wahi jo body mein aaye hain)
      if (cosmetic) user.cosmetic = cosmetic;
      if (cosmetic_value) user.cosmetic_value = cosmetic_value;

      // Session extend logic (Kyuki user ne profile update ki hai, matlab wo active hai)
      user.lastLogin = Date.now();
      if (user.isGuest) {
        user.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      }

      await user.save();

      // Response mein updated image path dikhane ke liye logic
      let responseData = user.toObject();
      if (responseData.avatar) {
        const avatarPath = getAvatarById(responseData.avatar);
        responseData.profile_pic = process.env.BASE_URL + avatarPath;
      }

      return res.json({
        success: true,
        message: "Profile updated successfully",
        data: responseData
      });

    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Update failed",
        error: error.message
      });
    }
  }
}

module.exports = new UsersController();
