import admin from 'firebase-admin';
import CONFIG from '../config.js';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: CONFIG.firebase.projectId,
      clientEmail: CONFIG.firebase.clientEmail,
      privateKey: CONFIG.firebase.privateKey,
    })
  });
}

export default class AuthService {
  static async verifyToken(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const decoded = await admin.auth().verifyIdToken(token);
      req.uid = decoded.uid;
      next();
    } catch (err) {
      res.status(401).json({ error: 'Unauthorized' });
    }
  }
}