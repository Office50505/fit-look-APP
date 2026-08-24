import mongoose from 'mongoose';
import { storedFileToClientUrl } from '../utils/storage.js';

function signupTokens() {
  const value = Number(process.env.SIGNUP_FREE_TOKENS || 20);
  return Number.isFinite(value) && value >= 0 ? value : 20;
}

function defaultDevMode() {
  return ['1', 'true', 'yes', 'on'].includes(String(process.env.SIGNUP_DEV_MODE_DEFAULT || '').toLowerCase());
}

const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    email: { type: String, trim: true, lowercase: true, unique: true, required: true },
    phone: { type: String, trim: true, unique: true, sparse: true },
    username: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true
    },
    passwordHash: { type: String, required: true },
    genderPreference: {
      type: String,
      enum: ['male', 'female', 'other'],
      default: 'other'
    },
    tokens: { type: Number, default: signupTokens },
    devMode: { type: Boolean, default: defaultDevMode },
    subscription: {
      planId: { type: String, trim: true },
      status: { type: String, trim: true, default: 'none' },
      tokensPerMonth: { type: Number, default: 0 },
      currentPeriodStart: Date,
      currentPeriodEnd: Date,
      lastOrderId: { type: String, trim: true }
    },
    avatarPhoto: {
      filename: String,
      path: String,
      url: String,
      storage: String,
      mimetype: String,
      size: Number,
      source: { type: String, trim: true },
      uploadedAt: Date
    },
    bodyPhoto: {
      filename: String,
      path: String,
      url: String,
      storage: String,
      mimetype: String,
      size: Number,
      status: { type: String, enum: ['uploaded', 'generating', 'ready', 'failed'], default: 'uploaded' },
      source: { type: String, trim: true },
      generatedAt: Date,
      error: String
    }
  },
  { timestamps: true }
);

userSchema.index({ genderPreference: 1, createdAt: -1 });
userSchema.index({ 'subscription.status': 1, 'subscription.currentPeriodEnd': 1 });

userSchema.methods.toClient = function toClient() {
  const bodyPhotoUrl = storedFileToClientUrl(this.bodyPhoto);
  const storedAvatarPhotoUrl = storedFileToClientUrl(this.avatarPhoto);
  const bodyPhotoIsFullBody = this.bodyPhoto?.source === 'fal-full-body';
  const avatarPhotoIsCustomTryOn = this.avatarPhoto?.source === 'custom-try-on';
  const avatarPhotoUrl = avatarPhotoIsCustomTryOn
    ? storedAvatarPhotoUrl || bodyPhotoUrl
    : bodyPhotoIsFullBody
      ? bodyPhotoUrl || storedAvatarPhotoUrl
      : storedAvatarPhotoUrl || bodyPhotoUrl;

  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    phone: this.phone || '',
    username: this.username,
    genderPreference: this.genderPreference || 'other',
    tokens: this.tokens,
    subscription: {
      planId: this.subscription?.planId || null,
      status: this.subscription?.status || 'none',
      tokensPerMonth: this.subscription?.tokensPerMonth || 0,
      currentPeriodStart: this.subscription?.currentPeriodStart || null,
      currentPeriodEnd: this.subscription?.currentPeriodEnd || null
    },
    devMode: Boolean(this.devMode),
    joinedAt: this.createdAt,
    avatarPhotoUrl,
    bodyPhotoUrl,
    bodyPhotoStatus: this.bodyPhoto?.status || 'uploaded',
    bodyPhotoSource: this.bodyPhoto?.source || 'upload',
    bodyPhotoGeneratedAt: this.bodyPhoto?.generatedAt || null
  };
};

export default mongoose.model('User', userSchema);
