const express = require('express');
const mysql = require('mysql2/promise');
const admin = require('firebase-admin');
const bodyParser = require('body-parser');
const cors = require('cors');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
app.use(cors({
  origin: 'https://warrior-0.github.io/autoRPG/',  // 요청 허용할 도메인
  credentials: true // 인증 헤더를 함께 보낼 경우
}));
app.use(bodyParser.json());

const nicknameCheckRouter = require('./nicknamecheck');

app.use('/api', nicknameCheckRouter);

const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: 'qhemfqhemf2!',
  database: 'test',
  charset: 'euckr',
};

const pool = mysql.createPool(dbConfig);

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

app.get('/user', verifyFirebaseToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE uid = ?', [
      req.uid,
    ]);
    if (rows.length === 0)
      return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// 사용자 데이터를 UID로 조회하는 API
app.get('/api/userdata', async (req, res) => {
  const uid = req.query.uid;
  if (!uid) {
    return res.status(400).json({ error: 'uid is required' });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE uid = ?', [uid]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // 유저 기본 정보
    const user = rows[0];

    // 물약 정보도 같이 가져오기
    const [potionRows] = await pool.query(
      'SELECT small, medium, large, extralarge FROM user_potions WHERE uid = ?',
      [uid]
    );

    if (potionRows.length > 0) {
      user.potions = potionRows[0]; // potions 필드에 넣기
    } else {
      user.potions = { small: 0, medium: 0, large: 0, extralarge: 0 };
    }

    res.json(user);
  } catch (err) {
    console.error('DB error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/save-user-and-potions', async (req, res) => {
  const {
    uid,
    nickname,
    gold,
    exp,
    level,
    hp,
    maxHp,
    str,
    dex,
    con,
    statPoints,
    small,
    medium,
    large,
    extralarge,
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
      uid,
      nickname,
      gold,
      exp,
      level,
      hp,
      maxHp,
      str,
      dex,
      con,
      statPoints,
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
      uid,
      nickname,
      small,
      medium,
      large,
      extralarge,
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`서버 ${PORT}번 포트에서 실행 중`);
});
