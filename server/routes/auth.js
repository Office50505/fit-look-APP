import bcrypt from 'bcryptjs';
import express from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExternalTryOn from '../models/ExternalTryOn.js';
import TryOn from '../models/TryOn.js';
import User from '../models/User.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const maxBodyPhotoBytes = Number(process.env.BODY_PHOTO_MAX_BYTES || 25 * 1024 * 1024);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxBodyPhotoBytes },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype?.startsWith('image/')) return cb(null, true);
    return cb(new Error('Body photo must be an image file'));
  }
});

function sign(user) {
  return jwt.sign({ sub: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: '14d' });
}

function bodyPhotoUpload(req, res, next) {
  upload.single('bodyPhoto')(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ message: `Body photo must be under ${Math.round(maxBodyPhotoBytes / 1024 / 1024)} MB` });
    }
    return res.status(400).json({ message: error.message || 'Body photo could not be uploaded' });
  });
}

function extensionFor(file) {
  const fromName = path.extname(file.originalname || '').toLowerCase().replace(/[^.\w-]/g, '');
  if (fromName) return fromName;
  if (file.mimetype === 'image/png') return '.png';
  if (file.mimetype === 'image/webp') return '.webp';
  if (file.mimetype === 'image/heic') return '.heic';
  return '.jpg';
}

async function saveBodyPhoto(userId, file) {
  const filename = `body-photo-${Date.now()}${extensionFor(file)}`;
  const storedPath = path.posix.join('uploads', 'users', userId.toString(), 'profile', filename);
  const localPath = path.join(rootDir, ...storedPath.split('/'));
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  await fs.writeFile(localPath, file.buffer);
  return {
    filename: file.originalname || filename,
    path: storedPath,
    mimetype: file.mimetype,
    size: file.size,
    storage: 'disk'
  };
}

async function removeStoredBodyPhoto(photo) {
  if (!photo?.path || photo.storage === 'mongodb') return;
  const localPath = path.resolve(rootDir, photo.path);
  if (!localPath.startsWith(rootDir)) return;
  try {
    await fs.unlink(localPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') console.warn('Could not remove old body photo:', error.message);
  }
}

async function requireUser(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Authentication required' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.sub).select('-bodyPhoto.data');
    if (!user) return res.status(401).json({ message: 'User not found' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired session' });
  }
}

router.post('/signup', bodyPhotoUpload, async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'Name, email, and password are required' });
  if (!req.file) return res.status(400).json({ message: 'Full-body photo is required' });

  try {
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ message: 'An account already exists for this email' });

    const user = new User({
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12)
    });
    user.bodyPhoto = await saveBodyPhoto(user._id, req.file);
    await user.save();

    res.status(201).json({ token: sign(user), user: user.toClient() });
  } catch (error) {
    console.error('Signup failed:', error);
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'An account already exists for this email' });
    }
    if (error?.name === 'ValidationError') {
      return res.status(400).json({ message: error.message || 'Signup details are invalid' });
    }
    res.status(500).json({ message: 'Could not create account right now' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });
    const user = await User.findOne({ email: email.toLowerCase() }).select('-bodyPhoto.data');
    if (!user?.passwordHash) return res.status(401).json({ message: 'Invalid email or password' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: 'Invalid email or password' });
    res.json({ token: sign(user), user: user.toClient() });
  } catch (error) {
    console.error('Login failed:', error);
    res.status(500).json({ message: 'Could not log in right now' });
  }
});

router.get('/me', requireUser, (req, res) => {
  res.json({ user: req.user.toClient() });
});

router.put('/me', requireUser, bodyPhotoUpload, async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Choose a new full-body photo first' });

  try {
    const oldPhoto = req.user.bodyPhoto?.toObject ? req.user.bodyPhoto.toObject() : req.user.bodyPhoto;
    const bodyPhoto = await saveBodyPhoto(req.user._id, req.file);
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { bodyPhoto, tryOnCache: [] },
      { new: true, runValidators: true }
    ).select('-bodyPhoto.data');

    await Promise.all([
      TryOn.deleteMany({ user: req.user._id }),
      ExternalTryOn.deleteMany({ user: req.user._id }),
      removeStoredBodyPhoto(oldPhoto)
    ]);

    res.json({ user: user.toClient(), invalidatedTryOns: true });
  } catch (error) {
    console.error('Profile update failed:', error);
    if (error?.name === 'ValidationError') {
      return res.status(400).json({ message: error.message || 'Profile details are invalid' });
    }
    res.status(500).json({ message: 'Could not update profile right now' });
  }
});

router.get('/me/body-photo', requireUser, async (req, res) => {
  const user = await User.findById(req.user._id).select('bodyPhoto');
  const photo = user?.bodyPhoto;
  if (!photo?.data) return res.status(404).json({ message: 'Body photo is not stored in MongoDB' });
  res.type(photo.mimetype || 'image/jpeg');
  res.set('Cache-Control', 'private, max-age=3600');
  res.send(photo.data);
});

export default router;
export { requireUser };
