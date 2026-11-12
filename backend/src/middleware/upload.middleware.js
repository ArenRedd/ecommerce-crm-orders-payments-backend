const multer = require('multer');
const AppError = require('../utils/AppError');

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf'
];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new AppError(
        `Invalid file type '${file.mimetype}'. Allowed types: JPEG, PNG, WEBP, PDF`,
        400
      ),
      false
    );
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 5
  },
  fileFilter
});

const uploadEvidenceMiddleware = (req, res, next) => {
  upload.array('evidence', 5)(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new AppError('File size exceeds the 5MB limit', 400));
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return next(new AppError('Maximum 5 evidence files allowed per return request', 400));
        }
        return next(new AppError(`Upload error: ${err.message}`, 400));
      }
      return next(err);
    }
    next();
  });
};

module.exports = {
  uploadEvidenceMiddleware,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE
};
