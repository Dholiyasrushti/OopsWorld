const Card = require("../Models/Card");

const cardController = {
  // CREATE CARD
  createCard: async (req, res) => {
    try {
      const card = await Card.create(req.body);
      res.status(201).json({ success: true, data: card });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // GET ALL CARDS (POST request)
  getAllCards: async (req, res) => {
    try {
      // Optional: filter or pagination can come from req.body
      // const filter = req.body.filter || {};
      const cards = await Card.find();
      res.json({ success: true, data: cards });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // GET CARD BY ID (from body)
  getCardById: async (req, res) => {
    try {
      const { id } = req.body;
      if (!id) return res.status(400).json({ success: false, message: "Card ID required in body" });

      const card = await Card.findById(id);
      if (!card) return res.status(404).json({ success: false, message: "Card not found" });

      res.json({ success: true, data: card });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // UPDATE CARD (from body)
  updateCard: async (req, res) => {
    try {
      const { id, ...updateData } = req.body;
      if (!id) return res.status(400).json({ success: false, message: "Card ID required in body" });

      const card = await Card.findByIdAndUpdate(id, updateData, { new: true });
      res.json({ success: true, data: card });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // DELETE CARD (Soft delete via body)
  deleteCard: async (req, res) => {
    try {
      const { id } = req.body;
      if (!id) return res.status(400).json({ success: false, message: "Card ID required in body" });

      await Card.findByIdAndUpdate(id, { success: false });
      res.json({ success: true, message: "Card deleted" });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
  bulkInsertCards: async (req, res) => {
    try {
      const cards = req.body.cards; // array of card objects
      if (!cards || !Array.isArray(cards)) {
        return res.status(400).json({ success: false, message: "cards array is required in body" });
      }

      const inserted = await Card.insertMany(cards);
      res.status(201).json({ success: true, message: `${inserted.length} cards inserted`, data: inserted });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
};

module.exports = cardController;
