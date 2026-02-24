const express = require("express");
const router = express.Router();
const {verifyToken} = require("../Utils/generateToken");
const GameWallet = require("../Controller/GameWallet");

router.post("/Insert", GameWallet.insert);
router.post("/Update", GameWallet.update);
router.post("/Delete", GameWallet.delete);
router.post("/Select",verifyToken, GameWallet.selectPlayerWise);
router.post("/Select-by-id", GameWallet.selectById);

module.exports = router;
