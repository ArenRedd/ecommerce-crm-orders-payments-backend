const app = require('./app');
const env = require('./config/env');
const { connectDB, disconnectDB } = require('./config/db');

let server;

const startServer = async () => {
  try {
    await connectDB();

    server = app.listen(env.PORT, () => {
      console.log(`====================================================`);
      console.log(`🚀 E-Commerce CRM Backend running on port ${env.PORT}`);
      console.log(`📡 Environment: ${env.NODE_ENV}`);
      console.log(`📚 Swagger Docs: http://localhost:${env.PORT}/api-docs`);
      console.log(`❤️  Health Check: http://localhost:${env.PORT}/health`);
      console.log(`====================================================`);
    });
  } catch (error) {
    console.error(`[Server Init Error] ${error.message}`);
    process.exit(1);
  }
};

const handleTermination = async (signal) => {
  console.log(`\n[Server] Received ${signal}. Commencing graceful shutdown...`);
  if (server) {
    server.close(async () => {
      console.log('[Server] HTTP connections closed.');
      await disconnectDB();
      console.log('[Server] Database disconnected. Process exit clean.');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', () => handleTermination('SIGTERM'));
process.on('SIGINT', () => handleTermination('SIGINT'));

if (require.main === module) {
  startServer();
}

module.exports = { startServer };
