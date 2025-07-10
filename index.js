const express = require('express');
const mysql = require('mysql2/promise');
const admin = require('firebase-admin');
const bodyParser = require('body-parser');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
app.use(cors({
  origin: ['https://warrior-0.github.io', 'http://localhost:3000'],
  credentials: true,
}));
app.use(bodyParser.json());

const nicknameCheckRouter = require('./nicknamecheck');

// 기존 API 라우터 (여기서는 /api)
app.use('/api', nicknameCheckRouter);

// MySQL 연결
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: 'qhemfqhemf2!',
  database: 'test',
  charset: 'euckr',
};
const pool = mysql.createPool(dbConfig);

// Firebase 토큰 검증 미들웨어
async function verifyFirebaseToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const idToken = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.uid = decodedToken.uid;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// /user API
app.get('/user', verifyFirebaseToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE uid = ?', [req.uid]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// /api/userdata API
app.get('/api/userdata', async (req, res) => {
  const uid = req.query.uid;
  if (!uid) return res.status(400).json({ error: 'uid is required' });

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE uid = ?', [uid]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const user = rows[0];
    const [potionRows] = await pool.query(
      'SELECT small, medium, large, extralarge FROM user_potions WHERE uid = ?',
      [uid]
    );

    user.potions = potionRows.length > 0 ? potionRows[0] : { small: 0, medium: 0, large: 0, extralarge: 0 };

    res.json(user);
  } catch (err) {
    console.error('DB error detail:', err);
    res.status(500).json({ error: 'Internal Server Error', detail: err.message });
  }
});

// /api/save-user-and-potions API
app.post('/api/save-user-and-potions', async (req, res) => {
  const {
    uid, nickname, gold, exp, level, hp, maxHp,
    str, dex, con, statPoints,
    small, medium, large, extralarge,
  } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const sqlUser = `
      INSERT INTO users (uid, nickname, gold, exp, level, hp, maxHp, str, dex, con, statPoints)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        nickname = VALUES(nickname),
        gold = VALUES(gold),
        exp = VALUES(exp),
        level = VALUES(level),
        hp = VALUES(hp),
        maxHp = VALUES(maxHp),
        str = VALUES(str),
        dex = VALUES(dex),
        con = VALUES(con),
        statPoints = VALUES(statPoints)
    `;
    await conn.query(sqlUser, [
      uid, nickname, gold, exp, level, hp, maxHp, str, dex, con, statPoints,
    ]);

    const sqlPotion = `
      INSERT INTO user_potions (uid, nickname, small, medium, large, extralarge)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        nickname = VALUES(nickname),
        small = VALUES(small),
        medium = VALUES(medium),
        large = VALUES(large),
        extralarge = VALUES(extralarge)
    `;
    await conn.query(sqlPotion, [
      uid, nickname, small, medium, large, extralarge,
    ]);

    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    conn.release();
  }
});

// --- 프록시 미들웨어 추가 ---
// 내부 API 서버 주소
const API_SERVER = 'http://192.168.10.100:3000';

// 프록시 경로는 /proxy-api 로 분리 (필요하면 변경 가능)
app.use('/proxy-api', createProxyMiddleware({
  target: API_SERVER,
  changeOrigin: true,
  secure: false,
}));

// 서버 실행
app.listen(3000, '0.0.0.0', () => {
  console.log(`서버 3000번 포트에서 실행 중`);
});
