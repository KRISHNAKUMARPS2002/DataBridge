const app = require("./src/app");
const logger = require("./src/config/logger"); // Import Winston logger

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  logger.info(`🚀 Server running on http://localhost:${PORT}`);
});
