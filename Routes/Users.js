const express = require("express");
const router = express.Router();
const Users = require("../Controller/Users");
const {verifyToken} = require("../Utils/generateToken");
// const GameWallet = require("../Controller/GameWallet");
router.post("/Login", Users.loginOrSignup);
router.post("/UserSession", verifyToken,Users.updateSession);
router.post("/CreditUpdate", verifyToken,Users.creditWallet);
router.post("/DebitUpdate", verifyToken,Users.debitWallet);
router.post("/Update", verifyToken,Users.updateProfile);
router.post("/ActiveGame", verifyToken,Users.getUserActiveGame);
router.post("/CosmeticUpdate", verifyToken,Users.cosmeticUpdate);
router.post("/GetWorldRanking", verifyToken,Users.getLeaderboard);



module.exports = router;
