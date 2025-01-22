const mongoose = require('mongoose');
const logger = require('../utils/logger');

async function setupDatabase() {
    try {
        await mongoose.connect(process.env.MONGO_URL, {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });

        logger.info('Successfully connected to MongoDB');

        mongoose.connection.on('error', (err) => {
            logger.error('MongoDB connection error:', err);
        });

        mongoose.connection.on('disconnected', () => {
            logger.warn('MongoDB disconnected');
        });

        process.on('SIGINT', async () => {
            await mongoose.connection.close();
            logger.info('MongoDB connection closed through app termination');
            process.exit(0);
        });
    } catch (error) {
        logger.error('Failed to connect to MongoDB:', error);
        throw error;
    }
}

module.exports = {
    setupDatabase
};
