const swaggerJsdoc = require('swagger-jsdoc');
const env = require('./env');

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'E-Commerce CRM Orders, Payments & Returns API',
      version: '1.0.0',
      description: `
### E-Commerce CRM Backend - Phase 1 (Orders, Payments & Returns/Refunds)

#### Key Architectural Principles
- **Money Handling**: All amounts are strictly non-negative **integer paise** (1 INR = 100 paise). Floating points are prohibited.
- **State Machine**: Order progression follows:
  \`PLACED\` → \`CONFIRMED\` → \`PROCESSING\` → \`PACKED\` → \`SHIPPED\` → \`OUT_FOR_DELIVERY\` → \`DELIVERED\`.
  Cancellation is permitted only before \`SHIPPED\` status.
- **Envelope Response**: Every endpoint conforms to:
  \`\`\`json
  {
    "success": true,
    "message": "Human readable message",
    "data": { ... },
    "pagination": { ... } // optional
  }
  \`\`\`
- **Authentication**: JWT Bearer token in \`Authorization\` header.
- **RBAC**: Enforced via permission keys (\`orders.read\`, \`orders.create\`, \`orders.update_status\`, \`orders.cancel\`, etc.).
      `,
      contact: {
        name: 'CRM Backend Engineering Team'
      }
    },
    servers: [
      {
        url: `http://localhost:${env.PORT}`,
        description: 'Local Development Server'
      }
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT token to authorize.'
        }
      },
      schemas: {
        ErrorEnvelope: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Validation failed' },
            errors: {
              type: 'array',
              items: { type: 'object' },
              example: [{ field: 'items', message: 'Order must contain at least one item' }]
            }
          }
        }
      }
    }
  },
  apis: [
    './src/modules/**/*.routes.js',
    './src/modules/**/*.js'
  ]
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
