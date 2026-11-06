import type { Request, Response, NextFunction } from 'express';
import uploadService, { UploadService } from './upload.service.js';
import { sendSuccess, sendError } from '../../utils/response.js';

export class UploadController {
  constructor(private readonly service: UploadService = uploadService) {}

  uploadImage = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      // 1. Multipart form upload
      if (req.file) {
        const folder = (req.body.folder || req.query.folder || 'general').toLowerCase();
        const targetFolder = ['hazards', 'profiles'].includes(folder) ? folder : 'general';
        const relativePath = this.service.relocateUploadedFile(req.file, targetFolder);
        const fullUrl = this.service.formatUrl(req, relativePath);

        sendSuccess(res, 'Image uploaded successfully', {
          url: fullUrl,
          path: relativePath,
          filename: req.file.filename,
          size: req.file.size,
          mimetype: req.file.mimetype,
        }, 201);
        return;
      }

      // 2. Base64 payload in body
      const base64Data =
        req.body.image ||
        req.body.base64 ||
        req.body.base64Data ||
        req.body.file;
      if (base64Data && typeof base64Data === 'string') {
        const folder = (req.body.folder || req.query.folder || 'general').toLowerCase();
        const targetFolder = ['hazards', 'profiles'].includes(folder) ? (folder as 'hazards' | 'profiles') : 'general';
        const relativePath = this.service.saveBase64Image(base64Data, targetFolder);
        const fullUrl = this.service.formatUrl(req, relativePath);

        sendSuccess(res, 'Base64 image uploaded successfully', {
          url: fullUrl,
          path: relativePath,
          filename: relativePath.split('/').pop(),
        }, 201);
        return;
      }

      sendError(res, 'No image file or base64 data provided in request', 400);
    } catch (error: any) {
      sendError(res, error.message || 'Image upload failed', 400);
    }
  };
}

export default new UploadController();
