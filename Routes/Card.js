const express = require("express");
const router = express.Router();
const cardController = require("../Controller/Card");

// All POST requests
router.post("/create", cardController.createCard);
router.post("/list", cardController.getAllCards);
router.post("/get", cardController.getCardById);
router.post("/update", cardController.updateCard);
router.post("/delete", cardController.deleteCard);
router.post("/InsertCards", cardController.bulkInsertCards);

module.exports = router;
