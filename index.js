const express = require('express');
const mysql = require('mysql2/promise');
const admin = require('firebase-admin');
const bodyParser = require('body-parser');
const cors = require('cors');

// Firebase Admin SDK 초기화
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
app.use(cors({ origin: '*' }));
app.use(bodyParser.json());

// DB 풀 생성 (pool 은 미들웨어나 라우터보다 위에 선언)
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
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

// 닉네임 체크 라우터 (외부 파일로 분리 시)
const nicknameCheckRouter = require('./nicknamecheck');
app.use('/api', nicknameCheckRouter);

// 사용자 생성 API
app.post('/api/createUser', async (req, res) => {
  const { uid, nickname } = req.body;
  if (!uid || !nickname) {
    return res.status(400).json({ error: 'uid and nickname are required' });
  }

  try {
    await pool.query(
      `INSERT INTO users 
      (uid, nickname, gold, exp, level, hp, maxHp, str, dex, con, statPoints, potion_small, potion_medium, potion_large, potion_extralarge, potion_quarter)
      VALUES (?, ?, 0, 0, 1, 100, 100, 0, 0, 0, 0, 3, 1, 0, 0, 0)`,
      [uid, nickname]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/userdata', async (req, res) => {
  const uid = req.query.uid;
  if (!uid) return res.status(400).json({ error: 'uid 필요' });

  try {
    const conn = await pool.getConnection();

    const [users] = await conn.query('SELECT * FROM users WHERE uid = ?', [uid]);
    if (users.length === 0) {
      conn.release();
      return res.status(404).json({ error: '유저 없음' });
    }

    const user = users[0];
    const [equippedItems] = await conn.query('SELECT * FROM user_inventory WHERE uid = ? AND equipped = 1', [uid]);

    conn.release();

    res.json({ user, equipped: equippedItems });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '서버 오류' });
  }
});

// 유저 및 물약 저장 API
app.post('/api/save-user-and-potions', async (req, res) => {
  const {
    uid, nickname, gold, exp, level,
    hp, maxHp, str, dex, con, statPoints,
    potion_small, potion_medium, potion_large, potion_extralarge, potion_quarter,
  } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const sqlUser = `
      INSERT INTO users
        (uid, nickname, gold, exp, level, hp, maxHp, str, dex, con, statPoints, potion_small, potion_medium, potion_large, potion_extralarge, potion_quarter)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        statPoints = VALUES(statPoints),
        potion_small = VALUES(potion_small),
        potion_medium = VALUES(potion_medium),
        potion_large = VALUES(potion_large),
        potion_extralarge = VALUES(potion_extralarge),
        potion_quarter = VALUES(potion_quarter)
    `;

    await conn.query(sqlUser, [
      uid, nickname, gold, exp, level, hp, maxHp,
      str, dex, con, statPoints,
      potion_small, potion_medium, potion_large, potion_extralarge, potion_quarter
    ]);

    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error('Save user and potions error:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    conn.release();
  }
});

// 기본 사용자 정보 조회 (Firebase 토큰 필요)
app.get('/user', verifyFirebaseToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE uid = ?', [req.uid]);
    if (rows.length === 0)
      return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// 랭킹 조회 API
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

// 데이터 저장 API (유저 정보 + 채팅 메시지 저장)
app.post('/api/save', async (req, res) => {
  const { uid, chatMessages, pvpInfo, userInfo } = req.body;

  if (!uid) {
    return res.status(400).json({ error: 'uid is required' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 유저 정보 저장
    if (userInfo) {
      const {
        nickname, gold, exp, level, hp, maxHp,
        str, dex, con, statPoints,
        potion_small, potion_medium, potion_large, potion_extralarge, potion_quarter,
      } = userInfo;

      const sqlUser = `
        INSERT INTO users
          (uid, nickname, gold, exp, level, hp, maxHp, str, dex, con, statPoints, potion_small, potion_medium, potion_large, potion_extralarge, potion_quarter)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          statPoints = VALUES(statPoints),
          potion_small = VALUES(potion_small),
          potion_medium = VALUES(potion_medium),
          potion_large = VALUES(potion_large),
          potion_extralarge = VALUES(potion_extralarge),
          potion_quarter = VALUES(potion_quarter)
      `;

      await conn.query(sqlUser, [
        uid, nickname, gold, exp, level, hp, maxHp,
        str, dex, con, statPoints,
        potion_small, potion_medium, potion_large, potion_extralarge, potion_quarter
      ]);
    }

    // 채팅 메시지 저장
    if (Array.isArray(chatMessages) && chatMessages.length > 0) {
      const chatInsertPromises = chatMessages.map(({ message, createdAt, nickname }) =>
        conn.query(
          'INSERT INTO chat_messages (uid, nickname, message, created_at) VALUES (?, ?, ?, ?)',
          [uid, nickname || '', message, createdAt ? new Date(createdAt) : new Date()]
        )
      );
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

// 채팅 메시지 목록 조회 API
app.get('/api/chat/list', async (req, res) => {
  const limit = parseInt(req.query.limit) || 100;

  try {
    const [rows] = await pool.query(
      'SELECT uid, nickname, message, created_at FROM chat_messages ORDER BY created_at DESC LIMIT ?',
      [limit]
    );
    res.json(rows);
  } catch (err) {
    console.error('/api/chat/list error:', err);
    res.status(500).json({ error: '채팅 불러오기 실패' });
  }
});

// PVP 대상자 조회 API
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

// PVP 대상자 조회 (excludeUid 파라미터)
app.get('/api/pvpTargets', async (req, res) => {
  const excludeUid = req.query.excludeUid;
  if (!excludeUid)
    return res.status(400).json({ error: 'excludeUid is required' });

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

// 개별 채팅 메시지 전송 API
app.post('/api/chat/send', async (req, res) => {
  const { uid, nickname, message } = req.body;
  if (!uid || !nickname || !message) {
    return res.status(400).json({ error: 'uid, nickname, message가 필요합니다.' });
  }

  try {
    await pool.query(
      `INSERT INTO chat_messages (uid, nickname, message, created_at) 
       VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL '7:36:52' HOUR_SECOND))`,
      [uid, nickname, message]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('/api/chat/send error:', err);
    res.status(500).json({ success: false, error: '메시지 저장 실패' });
  }
});

app.post('/api/boss/defeat', async (req, res) => {
  const { uid, bossStage } = req.body;
  if (!uid || !bossStage) return res.status(400).json({ error: 'uid, bossStage 필요' });

  try {
    const conn = await pool.getConnection();

    // 1) 보스 스테이지에 해당하는 드랍 아이템 조회 (예시: 여러개 중 랜덤 선택)
    const [items] = await conn.query('SELECT * FROM items WHERE boss_stage = ?', [bossStage]);

    if (items.length === 0) {
      conn.release();
      return res.json({ message: "드랍 아이템 없음", droppedItem: null });
    }

    // 예: 무작위 아이템 1개 선택
    const droppedItem = items[Math.floor(Math.random() * items.length)];

    // 2) user_inventory에 추가
    await conn.query(
      'INSERT INTO user_inventory (uid, item_id, item_name, item_type, equipped) VALUES (?, ?, ?, ?, 0)',
      [uid, droppedItem.id, droppedItem.name, droppedItem.type]
    );

    conn.release();

    res.json({ message: "아이템 획득!", droppedItem });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "서버 오류" });
  }
});

app.get('/api/inventory', async (req, res) => {
  const uid = req.query.uid;
  if (!uid) return res.status(400).json({ error: 'uid 필요' });

  try {
    const conn = await pool.getConnection();
    const [rows] = await conn.query('SELECT * FROM user_inventory WHERE uid = ?', [uid]);
    conn.release();

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '서버 오류' });
  }
});

app.post('/api/equipItem', async (req, res) => {
  const { uid, item_id, equip } = req.body;
  if (!uid || !item_id || typeof equip !== 'boolean') {
    return res.status(400).json({ error: 'uid, item_id, equip 필요' });
  }

  try {
    const conn = await pool.getConnection();

    // 1) item_id로 아이템 타입 조회
    const [items] = await conn.query('SELECT type FROM items WHERE id = ?', [item_id]);
    if (items.length === 0) {
      conn.release();
      return res.status(404).json({ error: '아이템 없음' });
    }
    const itemType = items[0].type;

    // 2) 같은 타입 아이템 모두 장착 해제
    await conn.query('UPDATE user_inventory SET equipped = 0 WHERE uid = ? AND item_type = ?', [uid, itemType]);

    // 3) 요청에 따라 해당 아이템 장착 / 해제
    const equippedValue = equip ? 1 : 0;
    await conn.query('UPDATE user_inventory SET equipped = ? WHERE uid = ? AND item_id = ?', [equippedValue, uid, item_id]);

    conn.release();

    res.json({ message: '장착 상태 변경 완료' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '서버 오류' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
