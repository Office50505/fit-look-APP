import mongoose from 'mongoose';

function signupTokens() {
  const value = Number(process.env.SIGNUP_FREE_TOKENS || 4);
  return Number.isFinite(value) && value >= 0 ? value : 4;
}

function devMode() {
  return ['1', 'true', 'yes', 'on'].includes(String(process.env.DEV_MODE || '').toLowerCase());
}

const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    email: { type: String, trim: true, lowercase: true, unique: true, required: true },
    passwordHash: { type: String, required: true },
    tokens: { type: Number, default: signupTokens },
    bodyPhoto: {
      filename: String,
      path: String,
      mimetype: String,
      size: Number,
      data: Buffer,
      storage: { type: String, enum: ['disk', 'mongodb'], default: 'disk' }
    },
    tryOnCache: [{
      kind: { type: String, enum: ['product', 'external', 'custom', 'vto-trial'], required: true },
      key: { type: String, required: true },
      tryOn: { type: mongoose.Schema.Types.ObjectId, ref: 'TryOn' },
      externalTryOn: { type: mongoose.Schema.Types.ObjectId, ref: 'ExternalTryOn' },
      customTryOn: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomTryOn' },
      product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
      sourceUrl: String,
      label: String,
      image: {
        filename: String,
        path: String,
        mimetype: String,
        size: Number
      },
      createdAt: { type: Date, default: Date.now }
    }]
  },
  { timestamps: true }
);

userSchema.methods.toClient = function toClient() {
  const hasMongoBodyPhoto = this.bodyPhoto?.storage === 'mongodb' || Boolean(this.bodyPhoto?.data);
  const bodyPhotoPath = hasMongoBodyPhoto ? '/api/auth/me/body-photo' : this.bodyPhoto?.path ? `/${this.bodyPhoto.path}` : null;
  const bodyPhotoVersion = this.updatedAt ? new Date(this.updatedAt).getTime() : Date.now();
  const bodyPhotoUrl = bodyPhotoPath ? `${bodyPhotoPath}?v=${bodyPhotoVersion}` : null;
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    tokens: this.tokens,
    devMode: devMode(),
    bodyPhotoUrl,
    bodyPhotoFilename: this.bodyPhoto?.filename || null,
    bodyPhotoSize: this.bodyPhoto?.size || null,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

export default mongoose.model('User', userSchema);
