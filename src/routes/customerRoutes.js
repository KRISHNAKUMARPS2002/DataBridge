const express = require("express");
const {
  addCustomer,
  getCustomersByDbId,
} = require("../services/customerService");
const logger = require("../config/logger");

const router = express.Router();

// ➕ Add Customer (POST /api/customers)
router.post("/customers", async (req, res) => {
  const { db_id, name, address, place, phone } = req.body;

  if (!db_id || !name || !address || !place || !phone) {
    logger.warn("⚠️ Missing required customer details.");
    return res
      .status(400)
      .json({
        error: "All fields (db_id, name, address, place, phone) are required",
      });
  }

  try {
    const result = await addCustomer(db_id, name, address, place, phone);
    res.status(201).json(result);
  } catch (error) {
    logger.error(`❌ Failed to add customer: ${error.message}`);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// 🔍 Get Customers by db_id (GET /api/customers/:db_id)
router.get("/customers/:db_id", async (req, res) => {
  const { db_id } = req.params;

  try {
    const customers = await getCustomersByDbId(db_id);
    res.status(200).json(customers);
  } catch (error) {
    logger.error(`❌ Failed to fetch customers: ${error.message}`);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
