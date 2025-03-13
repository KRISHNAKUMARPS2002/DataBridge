require("dotenv").config();
const express = require("express");
const odbc = require("odbc");
const mongoose = require("mongoose");

const app = express();
const port = 5000;

// ODBC Connection String for SQL Anywhere
const connectionString = `DSN=${process.env.DSN};UID=${process.env.DB_USER};PWD=${process.env.DB_PASSWORD}`;

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB Connection Failed:", err));

// MongoDB Schema & Model
const productSchema = new mongoose.Schema({
  name: String,
  category: String,
  quantity: Number,
  tax_code: String,
});
const Product = mongoose.model("Product", productSchema);

// Function to Fetch & Store Data
async function fetchAndStoreData() {
  try {
    const db = await odbc.connect(connectionString);
    console.log("✅ Connected to SQL Anywhere via ODBC");

    const result = await db.query(
      "SELECT name, description AS category, quantity, saleprice AS tax_code FROM acc_product"
    );
    await db.close();

    // Store in MongoDB (delete existing and insert fresh data)
    await Product.deleteMany({});
    await Product.insertMany(result);
    console.log("✅ Data stored in MongoDB");
  } catch (err) {
    console.error("❌ Error:", err);
  }
}

// API to Fetch Data from MongoDB
app.get("/data", async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/fetch-stored-data/:field", async (req, res) => {
  try {
    const { field } = req.params;

    // Check if the requested field is valid
    const validFields = ["name", "category", "quantity", "tax_code"];
    if (!validFields.includes(field)) {
      return res.status(400).json({ success: false, message: "Invalid field" });
    }

    // Get distinct values for the requested field
    const uniqueValues = await Product.distinct(field);

    res.json({
      success: true,
      field: field,
      values: uniqueValues,
    });
  } catch (err) {
    console.error("❌ Error fetching data:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✅ API to Send All Stored Data from MongoDB
app.get("/send-data", async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query; // Pagination support
    const products = await Product.find()
      .limit(limit * 1)
      .skip((page - 1) * limit);

    res.json({
      success: true,
      count: products.length,
      data: products,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✅ API to Send Data by Category
app.get("/send-data/:category", async (req, res) => {
  try {
    const { category } = req.params;
    const products = await Product.find({ category });

    res.json({
      success: true,
      count: products.length,
      data: products,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start Server
app.listen(port, async () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
  await fetchAndStoreData(); // Fetch & store data on server start
});
