const RandomUser = require("../Models/RandomUser");

module.exports = {

  // INSERT
  insert: async (req, res) => {
    try {
      const { username, avatar } = req.body;

      if (!username || !avatar) {
        return res.status(400).json({
          success: false,
          message: "username and avatar are required"
        });
      }

      const user = await RandomUser.create({ username, avatar });

      return res.json({
        success: true,
        message: "User inserted",
        data: user
      });

    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message
      });
    }
  },

  // UPDATE (id from body)
  update: async (req, res) => {
    try {
      const { id, username, avatar } = req.body;

      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const updated = await RandomUser.findByIdAndUpdate(
        id,
        { username, avatar },
        { new: true }
      );

      if (!updated) return res.json({ status: false, message: "User not found" });

      return res.json({
        success: true,
        message: "User updated",
        data: updated
      });

    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // DELETE
  delete: async (req, res) => {
    try {
      const { id } = req.body;
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const deleted = await RandomUser.findByIdAndDelete(id);
      if (!deleted) return res.json({ success: false, message: "User not found" });

      return res.json({ success: true, message: "User deleted" });

    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // SELECT ALL
  selectAll: async (req, res) => {
    try {
      const users = await RandomUser.find().sort({ createdAt: -1 });

      return res.json({ success: true, data: users });

    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // SELECT BY ID
  selectById: async (req, res) => {
    try {
      const { id } = req.body;
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const user = await RandomUser.findById(id);
      if (!user) return res.json({ success: false, message: "User not found" });

      return res.json({ success: true, data: user });

    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // SELECT RANDOM USER
  selectRandom: async (req, res) => {
    try {
      const users = await RandomUser.aggregate([{ $sample: { size: 1 } }]);
      return res.json({ success: true, data: users[0] || null });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },
   insertBulk: async (req, res) => {
    try {
      const names = [
        "Vivaan","Aditya","Sai","Arjun","Krishna","Rohan","Kabir","Ansh","Dhruv",
        "Aryan","Shaurya","Ishaan","Yuvraj","Ritvik","Vihaan","Karan","Manav","Pranav","Tanmay",
        "Siddharth","Harsh","Nikhil","Raghav","Shivansh","Aniket","Devansh","Ayaan","Lakshya","Rudra",
        "Atharv","Yash","Kshitij","Mayank","Pratyush","Tejas","Abhinav","Dhyan","Eshan","Aarush",
        "Ishwar","Om","Samar","Tanish","Jay","Kunal","Advik","Harshit","Shaan","Anay",
        "Dev","Nirav","Krish","Vishal","Siddhant","Omkar","Parth","Yug","Laksh","Tanay",
        "Arnav","Rishi","Shiv","Visha","Suresh","Ronit","Abira","Anshu","Dhruvika","Vivart"
      ];

      const users = [];

      for (let i = 0; i < names.length; i++) {
        const avatar = Math.floor(Math.random() * 6) + 1; // 1-7 random
        users.push({
          username: names[i],
          avatar: avatar
        });
      }

      // Insert all users at once
      const inserted = await RandomUser.insertMany(users);

      return res.json({
        success: true,
        message: "70 users inserted successfully",
        data: inserted
      });

    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message
      });
    }
  }

};
