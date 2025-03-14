// Load dependencies
require("dotenv").config();
const express = require("express");
const odbc = require("odbc");
const mongoose = require("mongoose");
const cors = require("cors");
const morgan = require("morgan");
const winston = require("winston");

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(cors());
app.use(morgan("dev"));

// Logger Setup (Winston)
const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
});

// ODBC Connection Strings
const offlineDB = `DSN=${process.env.DSN};UID=${process.env.DB_USER};PWD=${process.env.DB_PASSWORD}`;
const onlineDB = `DSN=${process.env.ONLINE_DSN};UID=${process.env.ONLINE_DB_USER};PWD=${process.env.ONLINE_DB_PASSWORD}`;

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => logger.info("✅ Connected to MongoDB"))
  .catch((err) => logger.error("❌ MongoDB Connection Failed:", err));

// Function to test SQL Anywhere Connections
async function testSQLConnection(mode) {
  try {
    const connectionString = mode === "offline" ? offlineDB : onlineDB;
    const db = await odbc.connect(connectionString);
    logger.info(
      `✅ Successfully connected to ${mode.toUpperCase()} SQL Anywhere database`
    );
    await db.close();
  } catch (err) {
    logger.error(
      `❌ Failed to connect to ${mode.toUpperCase()} SQL Anywhere database:`,
      err
    );
  }
}

// Test SQL DB Connections on Startup
(async () => {
  await testSQLConnection("offline");
  await testSQLConnection("online");
})();

// Dynamic Schema for Any Table
const DataSchema = new mongoose.Schema(
  {
    table: String,
    data: Object,
  },
  { timestamps: true }
);
const DataModel = mongoose.model("Data", DataSchema);

// Function to Fetch & Store Data from SQL Anywhere
async function fetchAndStoreData(table, source = "offline") {
  try {
    const connectionString = source === "offline" ? offlineDB : onlineDB;
    const db = await odbc.connect(connectionString);
    logger.info(`✅ Connected to SQL Anywhere (${source} mode)`);

    const result = await db.query(`SELECT * FROM ${table}`);
    await db.close();

    if (result.length === 0) {
      logger.warn(`⚠️ No data found in table: ${table}`);
      return;
    }

    // Update existing records or insert new ones
    const bulkOps = result.map((item) => ({
      updateOne: {
        filter: {
          table,
          "data.id": item.id || new mongoose.Types.ObjectId().toString(),
        }, // Ensure unique `id`
        update: { $set: { table, data: item } },
        upsert: true, // Insert if it doesn't exist
      },
    }));

    await DataModel.bulkWrite(bulkOps);
    logger.info(`✅ Data updated for table: ${table} from ${source} database`);
  } catch (err) {
    logger.error(`❌ Error fetching data from table: ${table}`, err);
  }
}

// API to Fetch Data from SQL Anywhere & Store in MongoDB
app.get("/fetch-sql/:table/:mode", async (req, res) => {
  try {
    const { table, mode } = req.params;
    if (!["offline", "online"].includes(mode)) {
      return res.status(400).json({
        success: false,
        message: "Invalid mode. Use 'offline' or 'online'.",
      });
    }

    await fetchAndStoreData(table, mode);
    res.json({
      success: true,
      message: `Data fetched from ${mode} database for table ${table}`,
    });
  } catch (err) {
    logger.error("❌ Error fetching SQL data:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API to Get Stored Data from MongoDB with Filtering & Pagination
app.get("/data/:table", async (req, res) => {
  try {
    const { table } = req.params;
    const { page = 1, limit = 10, field, value, sort = "asc" } = req.query;

    let filter = { table };
    if (field && value) {
      filter[`data.${field}`] = value;
    }

    const data = await DataModel.find(filter)
      .sort({ [`data.${field}`]: sort === "asc" ? 1 : -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .select("data");

    res.json({ success: true, count: data.length, data });
  } catch (err) {
    logger.error("❌ Error fetching data:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API to Push Data from MongoDB Back to SQL Anywhere
app.post("/push-sql/:table", async (req, res) => {
  try {
    const { table } = req.params;
    const { mode = "offline" } = req.query;
    const connectionString = mode === "offline" ? offlineDB : onlineDB;
    const db = await odbc.connect(connectionString);

    const records = await DataModel.find({ table }).select("data -_id");

    if (records.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No data found in MongoDB for this table.",
      });
    }

    for (const record of records) {
      const keys = Object.keys(record.data).join(", ");
      const values = Object.values(record.data)
        .map((val) => (typeof val === "string" ? `'${val}'` : val))
        .join(", ");

      const query = `INSERT INTO ${table} (${keys}) VALUES (${values})`;
      await db.query(query);
    }

    await db.close();
    res.json({
      success: true,
      message: `✅ Data pushed back to SQL Anywhere for table ${table}`,
    });
  } catch (err) {
    logger.error("❌ Error pushing data back to SQL Anywhere:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API to Delete Data from MongoDB
app.delete("/data/:table", async (req, res) => {
  try {
    const { table } = req.params;
    const { id, deleteAll } = req.query; // id for single record, deleteAll for entire table

    if (deleteAll === "true") {
      // Delete all records of a table
      await DataModel.deleteMany({ table });
      return res.json({
        success: true,
        message: `✅ All records from table '${table}' deleted.`,
      });
    }

    if (!id) {
      return res.status(400).json({
        success: false,
        message:
          "❌ Please provide an 'id' to delete a specific record or set 'deleteAll=true' to remove all data.",
      });
    }

    const deletedRecord = await DataModel.findOneAndDelete({
      table,
      "data.id": id,
    });

    if (!deletedRecord) {
      return res.status(404).json({
        success: false,
        message: `❌ No record found with id: ${id} in table '${table}'.`,
      });
    }

    res.json({
      success: true,
      message: `✅ Record with id ${id} deleted from table '${table}'.`,
    });
  } catch (err) {
    logger.error("❌ Error deleting data:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API to Delete an Entire Collection (Schema)
app.delete("/schema/:table", async (req, res) => {
  try {
    const { table } = req.params;

    // Drop the entire collection for the specified table
    await mongoose.connection.db.dropCollection(table);

    res.json({
      success: true,
      message: `✅ Collection '${table}' deleted successfully.`,
    });
  } catch (err) {
    logger.error("❌ Error deleting collection:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start Server
app.listen(port, () => {
  logger.info(`🚀 Server running on http://localhost:${port}`);
});
