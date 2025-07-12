const express = require('express');
const mysql = require('mysql2/promise');
const admin = require('firebase-admin');
const bodyParser = require('body-parser');
const cors = require('cors');

const firebaseServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!firebaseServiceAccount) {
  console.error('❌ 환경변수 FIREBASE_SERVICE_ACCOUNT_JSON 누락됨');
  process.exit(1);
}
admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(firebaseServiceAccount)),
});

const app = express();
app.use(cors({ origin: '*' }));
app.use(bodyParser.json());

const nicknameCheckRouter = require('./nicknamecheck');
app.use('/api', nicknameCheckRouter);

const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
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

// 사용자 생성용 API
app.post('/api/createUser', async (req, res) => {
  const { uid, nickname } = req.body;
  if (!uid || !nickname) {
    return res.status(400).json({ error: 'uid and nickname are required' });
  }

  try {
    const [rows] = await pool.query(
      'INSERT INTO users (uid, nickname, gold, exp, level, hp, maxHp, str, dex, con, statPoints) VALUES (?, ?, 0, 0, 1, 100, 100, 0, 0, 0, 0)',
      [uid, nickname]
    );

    // 물약 테이블도 같이 초기화
    await pool.query(
      'INSERT INTO user_potions (uid, nickname, small, medium, large, extralarge) VALUES (?, ?, 3, 1, 0, 0)',
      [uid, nickname]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

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

app.get('/api/ranking', async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  try {
    const [rows] = await pool.query(
      'SELECT nickname, level, exp, gold FROM users ORDER BY level DESC, exp DESC LIMIT ?',
      [limit]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch ranking' });
  }
});

app.post('/api/save', async (req, res) => {
  const { uid, chatMessages, pvpInfo, userInfo } = req.body;

  if (!uid) {
    return res.status(400).json({ error: 'uid is required' });
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // 1) 유저 정보 저장
    if (userInfo) {
      const {
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
      } = userInfo;

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

      const [resultUser] = await conn.query(sqlUser, [
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
    }

    // 2) 채팅 메시지 저장
    if (Array.isArray(chatMessages) && chatMessages.length > 0) {
      const chatInsertPromises = chatMessages.map(({ message, createdAt }) => {
        return conn.query(
          'INSERT INTO chat_messages (uid, message, created_at) VALUES (?, ?, ?)',
          [uid, message, createdAt ? new Date(createdAt) : new Date()]
        );
      });
      await Promise.all(chatInsertPromises);
    }

    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error('/api/save error:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    conn.release();
  }
});

app.get('/api/chat/list', async (req, res) => {
  const limit = parseInt(req.query.limit) || 100;

  try {
    const [rows] = await pool.query(
      'SELECT uid, message, created_at FROM chat_messages ORDER BY created_at DESC LIMIT ?',
      [limit]
    );
    res.json(rows);
  } catch (err) {
    console.error('/api/chat/list error:', err);
    res.status(500).json({ error: '채팅 불러오기 실패' });
  }
});

app.get('/api/pvp/targets', async (req, res) => {
  const uid = req.query.uid;
  if (!uid) return res.status(400).json({ error: 'uid is required' });

  try {
    const [rows] = await pool.query(
      'SELECT uid, nickname, level, exp, hp, maxHp FROM users WHERE uid != ? ORDER BY level DESC, exp DESC LIMIT 10',
      [uid]
    );
    res.json(rows);
  } catch (err) {
    console.error('/api/pvp/targets error:', err);
    res.status(500).json({ error: 'PVP 대상자 불러오기 실패' });
  }
});

app.get('/api/pvpTargets', async (req, res) => {
  const excludeUid = req.query.excludeUid;
  if (!excludeUid) {
    return res.status(400).json({ error: 'excludeUid is required' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT uid, nickname, level, exp, hp, maxHp
      FROM users
      WHERE uid != ?
      ORDER BY level DESC, exp DESC
      LIMIT 10`,
      [excludeUid]
    );
    res.json(rows);
  } catch (err) {
    console.error('/api/pvpTargets error:', err);
    res.status(500).json({ error: 'PVP 대상자 불러오기 실패' });
  }
});

// 개별 채팅 메시지 전송 처리 API
app.post('/api/chat/send', async (req, res) => {
  const { uid, nickname, message } = req.body;
  console.log('/api/chat/send 요청:', { uid, nickname, message });

  if (!uid || !nickname || !message) {
    console.log('필수 값 누락');
    return res
      .status(400)
      .json({ error: 'uid, nickname, message가 필요합니다.' });
  }

  try {
    await pool.query(
      'INSERT INTO chat_messages (uid, nickname, message, created_at) VALUES (?, ?, ?, NOW())',
      [uid, nickname, message]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('/api/chat/send error:', err);
    res.status(500).json({ success: false, error: '메시지 저장 실패' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`서버 ${PORT}번 포트에서 실행 중`);
});
