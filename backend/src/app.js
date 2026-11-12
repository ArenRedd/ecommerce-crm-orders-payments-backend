const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');

const env = require('./config/env');
const swaggerSpec = require('./config/swagger');
const { errorHandler, notFoundHandler } = require('./middleware/error.middleware');

// Route modules
const ordersRoutes = require('./modules/orders/orders.routes');
const paymentsRoutes = require('./modules/payments/payments.routes');
const returnsRoutes = require('./modules/returns/returns.routes');

const app = express();

// 1. Security Headers
app.use(helmet());

// 2. Narrow CORS Policy
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, Postman)
      if (!origin) return callback(null, true);
      if (env.CORS_ORIGIN.indexOf(origin) !== -1 || env.NODE_ENV === 'development') {
        return callback(null, true);
      }
      return callback(new Error(`CORS policy blocked access from origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-mock-user', 'x-user-role']
  })
);

// 3. Rate Limiting
const limiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP. Please try again after 15 minutes.'
  }
});
app.use(limiter);

// 4. Body Parsers
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 5. Data Sanitization against NoSQL query injection
app.use(mongoSanitize());

// 6. Swagger API Documentation Explorer
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'E-Commerce CRM API Docs',
  swaggerOptions: {
    persistAuthorization: true
  }
}));

// Swagger JSON endpoint
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// 7. Health Check
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'E-Commerce CRM Orders, Payments & Returns service is healthy',
    timestamp: new Date().toISOString(),
    env: env.NODE_ENV
  });
});

// 8. API Domain Routes
app.use(`${env.API_PREFIX}/orders`, ordersRoutes);
app.use(`${env.API_PREFIX}/payments`, paymentsRoutes);
app.use(`${env.API_PREFIX}/returns`, returnsRoutes);

// 9. 404 Catch-all handler
app.use(notFoundHandler);

// 10. Centralized Error Handler
app.use(errorHandler);

module.exports = app;
