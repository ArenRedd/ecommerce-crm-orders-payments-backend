const mongoose = require('mongoose');
const env = require('./env');

let isReplicaSet = false;

const connectDB = async (uri = env.MONGODB_URI) => {
  try {
    const conn = await mongoose.connect(uri, {
      autoIndex: true
    });

    console.log(`[DB] Connected to MongoDB: ${conn.connection.host}/${conn.connection.name}`);

    // Check if connected instance supports transactions (Replica Set / Sharded cluster)
    try {
      const adminDb = conn.connection.db.admin();
      const status = await adminDb.command({ replSetGetStatus: 1 }).catch(() => null);
      if (status && status.ok === 1) {
        isReplicaSet = true;
        console.log('[DB] MongoDB Replica Set detected. Multi-document transactions enabled.');
      } else {
        isReplicaSet = false;
        console.warn('[DB Warning] MongoDB is running in standalone mode. Multi-document transactions are disabled; falling back to atomic document writes.');
      }
    } catch {
      isReplicaSet = false;
      console.warn('[DB Warning] Could not determine replica set status. Defaulting transaction fallback.');
    }

    return conn;
  } catch (error) {
    console.error(`[DB Error] Failed to connect to MongoDB: ${error.message}`);
    if (env.NODE_ENV !== 'test') {
      process.exit(1);
    }
    throw error;
  }
};

const disconnectDB = async () => {
  try {
    await mongoose.connection.close();
    console.log('[DB] MongoDB connection closed');
  } catch (error) {
    console.error(`[DB Error] Failed to close MongoDB connection: ${error.message}`);
  }
};

/**
 * Execute operations within a MongoDB transaction if replica set is available,
 * otherwise fallback to direct execution with fallback notice.
 *
 * @param {Function} callback - Async function receiving (session)
 * @returns {Promise<any>}
 */
const runInTransaction = async (callback) => {
  if (!isReplicaSet) {
    // Standalone fallback: execute without session
    return await callback(null);
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await callback(session);
    });
    return result;
  } catch (error) {
    // Check if error is due to transaction unsupported
    if (error.message && error.message.includes('replica set')) {
      isReplicaSet = false;
      console.warn('[DB Warning] Transaction failed because server is standalone. Falling back to non-transactional write.');
      return await callback(null);
    }
    throw error;
  } finally {
    await session.endSession();
  }
};

const getIsReplicaSet = () => isReplicaSet;
const setIsReplicaSet = (val) => { isReplicaSet = val; };

module.exports = {
  connectDB,
  disconnectDB,
  runInTransaction,
  getIsReplicaSet,
  setIsReplicaSet
};
