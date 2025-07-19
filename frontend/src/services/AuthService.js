import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import CONFIG from '../config.js';

export default class AuthService {
  static #initialized = false;
  static #auth;

  static async init() {
    if (this.#initialized) return;
    const app = initializeApp(CONFIG.firebase);
    this.#auth = getAuth(app);
    this.#initialized = true;
  }

  static getToken() {
    return new Promise((res, rej) => {
      onAuthStateChanged(this.#auth, user => {
        user
          ? user.getIdToken().then(res).catch(rej)
          : rej(new Error('Not authenticated'));
      });
    });
  }
}