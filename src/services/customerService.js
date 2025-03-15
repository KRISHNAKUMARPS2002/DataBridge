const postgresClient = require("../config/postgres");
const logger = require("../config/logger");

async function addCustomer(db_id, name, address, place, phone) {
  try {
    const result = await postgresClient.query(
      `INSERT INTO customers (db_id, name, address, place, phone) 
       VALUES ($1, $2, $3, $4, $5) 
       ON CONFLICT (db_id, name) DO NOTHING 
       RETURNING *`,
      [db_id, name, address, place, phone]
    );

    if (result.rowCount === 0) {
      logger.warn(`⚠️ Customer ${name} already exists in db_id ${db_id}.`);
      return { message: "Customer already exists" };
    }

    logger.info(`✅ Customer ${name} added to db_id ${db_id}`);
    return result.rows[0];
  } catch (error) {
    logger.error(`❌ Error adding customer: ${error.message}`);
    throw error;
  }
}

async function getCustomersByDbId(db_id) {
  try {
    const result = await postgresClient.query(
      "SELECT id, name, address, place, phone FROM customers WHERE db_id = $1",
      [db_id]
    );
    return result.rows;
  } catch (error) {
    logger.error(`❌ Error fetching customers: ${error.message}`);
    throw error;
  }
}

module.exports = { addCustomer, getCustomersByDbId };
