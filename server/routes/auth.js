import bcrypt from 'bcryptjs';
import express from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import User from '../models/User.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, Boolean(file.mimetype?.startsWith('image/')));
  }
});

function sign(user) {
  return jwt.sign({ sub: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: '14d' });
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

router.post('/signup', upload.single('bodyPhoto'), async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'Name, email, and password are required' });
  if (!req.file) return res.status(400).json({ message: 'Full-body photo is required' });

  try {
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ message: 'An account already exists for this email' });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      name,
      email,
      passwordHash,
      bodyPhoto: {
        filename: req.file.originalname || `body-photo-${Date.now()}.jpg`,
        mimetype: req.file.mimetype,
        size: req.file.size,
        data: req.file.buffer,
        storage: 'mongodb'
      }
    });

    res.status(201).json({ token: sign(user), user: user.toClient() });
  } catch (error) {
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
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });
  const user = await User.findOne({ email: email.toLowerCase() }).select('-bodyPhoto.data');
  if (!user) return res.status(401).json({ message: 'Invalid email or password' });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ message: 'Invalid email or password' });
  res.json({ token: sign(user), user: user.toClient() });
});

router.get('/me', requireUser, (req, res) => {
  res.json({ user: req.user.toClient() });
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
