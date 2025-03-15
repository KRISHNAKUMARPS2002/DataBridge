const express = require("express");
const { addUser, getUsersByDbId } = require("../services/userService");
const logger = require("../config/logger");

const router = express.Router();

// ➕ Add User (POST /api/users)
router.post("/users", async (req, res) => {
  const { db_id, username, password } = req.body;

  if (!db_id || !username || !password) {
    logger.warn("⚠️ Missing required user details.");
    return res
      .status(400)
      .json({ error: "db_id, username, and password are required" });
  }

  try {
    const result = await addUser(db_id, username, password);
    res.status(201).json(result);
  } catch (error) {
    logger.error(`❌ Failed to add user: ${error.message}`);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// 🔍 Get Users by db_id (GET /api/users/:db_id)
router.get("/users/:db_id", async (req, res) => {
  const { db_id } = req.params;

  try {
    const users = await getUsersByDbId(db_id);
    res.status(200).json(users);
  } catch (error) {
    logger.error(`❌ Failed to fetch users: ${error.message}`);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
