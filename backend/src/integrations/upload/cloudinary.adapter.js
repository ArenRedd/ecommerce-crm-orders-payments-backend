const cloudinary = require('cloudinary').v2;
const env = require('../../config/env');
const AppError = require('../../utils/AppError');

// Configure Cloudinary
cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET
});

const isStubConfig =
  !env.CLOUDINARY_API_KEY ||
  env.CLOUDINARY_API_KEY === 'stub_cloudinary_key' ||
  env.NODE_ENV === 'test';

const cloudinaryAdapter = {
  /**
   * Upload return evidence image or document
   * @param {Buffer} buffer - File buffer from multer
   * @param {string} originalname
   * @param {string} mimetype
   * @returns {Promise<{ url: string, publicId: string }>}
   */
  async uploadEvidence(buffer, originalname = 'evidence.jpg', mimetype = 'image/jpeg') {
    if (!buffer) {
      throw new AppError('File buffer is required for upload', 400);
    }

    // In test or development stub mode: return deterministic simulated CDN URL
    if (isStubConfig) {
      const sanitizedName = originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      const publicId = `returns/evidence_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      return {
        url: `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/image/upload/v${Date.now()}/${publicId}_${sanitizedName}`,
        publicId,
        format: mimetype.split('/')[1] || 'jpg'
      };
    }

    // Real Cloudinary stream upload
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'ecommerce-crm/returns',
          resource_type: mimetype === 'application/pdf' ? 'raw' : 'image'
        },
        (error, result) => {
          if (error) {
            console.error('[Cloudinary Upload Error]:', error);
            return reject(new AppError(`Cloudinary upload failed: ${error.message}`, 502));
          }
          resolve({
            url: result.secure_url || result.url,
            publicId: result.public_id,
            format: result.format
          });
        }
      );

      uploadStream.end(buffer);
    });
  }
};

module.exports = cloudinaryAdapter;
