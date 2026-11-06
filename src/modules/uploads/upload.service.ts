import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer, { type StorageEngine } from 'multer';
import type { Request } from 'express';

export const UPLOAD_ROOT = path.resolve(process.cwd(), 'uploads');

// Ensure upload subdirectories exist
export const ensureUploadDirs = (): void => {
  const dirs = [
    UPLOAD_ROOT,
    path.join(UPLOAD_ROOT, 'hazards'),
    path.join(UPLOAD_ROOT, 'profiles'),
    path.join(UPLOAD_ROOT, 'general'),
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
};

// Initialize directories immediately
ensureUploadDirs();

// Allowed MIME types
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
];

// Configure Multer storage
const storage: StorageEngine = multer.diskStorage({
  destination: (req, _file, cb) => {
    ensureUploadDirs();
    const folder = (req.body?.folder || req.query?.folder || 'general').toLowerCase();
    const targetFolder = ['hazards', 'profiles'].includes(folder) ? folder : 'general';
    cb(null, path.join(UPLOAD_ROOT, targetFolder));
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const randomHex = crypto.randomBytes(8).toString('hex');
    const filename = `${Date.now()}-${randomHex}${ext}`;
    cb(null, filename);
  },
});

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB max file size
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type ${file.mimetype}. Only JPEG, PNG, WEBP, GIF, and HEIC are supported.`));
    }
  },
});

export class UploadService {
  /**
   * Ensure a file is placed in the designated target directory even if multer
   * saved it into a fallback directory (e.g. when 'file' was sent before 'folder' in FormData).
   */
  relocateUploadedFile(file: Express.Multer.File, targetFolder: string): string {
    ensureUploadDirs();
    const safeFolder = ['hazards', 'profiles'].includes(targetFolder) ? targetFolder : 'general';
    const targetDir = path.join(UPLOAD_ROOT, safeFolder);
    const newPath = path.join(targetDir, file.filename);

    if (file.path !== newPath && fs.existsSync(file.path)) {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      fs.renameSync(file.path, newPath);
      file.destination = targetDir;
      file.path = newPath;
    }

    return `/uploads/${safeFolder}/${file.filename}`;
  }

  /**
   * Save a base64 encoded image string to the uploads directory
   */
  saveBase64Image(base64Data: string, folder: 'hazards' | 'profiles' | 'general' = 'general'): string {
    ensureUploadDirs();
    const targetFolder = ['hazards', 'profiles'].includes(folder) ? folder : 'general';

    let mimeType = 'image/jpeg';
    let base64Content = base64Data;

    // Check for data:image/...;base64, prefix
    const matches = base64Data.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      mimeType = matches[1];
      base64Content = matches[2];
    }

    let ext = '.jpg';
    if (mimeType.includes('png')) ext = '.png';
    else if (mimeType.includes('webp')) ext = '.webp';
    else if (mimeType.includes('gif')) ext = '.gif';

    const randomHex = crypto.randomBytes(8).toString('hex');
    const filename = `${Date.now()}-${randomHex}${ext}`;
    const filePath = path.join(UPLOAD_ROOT, targetFolder, filename);

    const buffer = Buffer.from(base64Content, 'base64');
    fs.writeFileSync(filePath, buffer);

    return `/uploads/${targetFolder}/${filename}`;
  }

  /**
   * Format relative upload path to full URL
   */
  formatUrl(req: Request, relativeOrFullUrl?: string | null): string | null {
    if (!relativeOrFullUrl) return null;
    if (relativeOrFullUrl.startsWith('http://') || relativeOrFullUrl.startsWith('https://')) {
      return relativeOrFullUrl;
    }
    const host = req.get('host') || 'localhost:3030';
    const protocol = req.protocol || 'http';
    const cleanPath = relativeOrFullUrl.startsWith('/') ? relativeOrFullUrl : `/${relativeOrFullUrl}`;
    return `${protocol}://${host}${cleanPath}`;
  }
}

export default new UploadService();
