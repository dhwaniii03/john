import express from 'express';
import uploadController from './upload.controller.js';
import { uploadMiddleware } from './upload.service.js';

const router = express.Router();

// Upload image via multipart/form-data (field 'file' or 'image') or JSON base64
router.post(
  '/',
  uploadMiddleware.single('file'),
  uploadController.uploadImage
);

router.post(
  '/image',
  uploadMiddleware.single('file'),
  uploadController.uploadImage
);

export default router;
