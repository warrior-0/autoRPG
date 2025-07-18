const express = require('express');
const mysql = require('mysql2/promise');
const admin = require('firebase-admin');
const bodyParser = require('body-parser');
const cors = require('cors');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});


const app = express();
app.use(cors({ origin: '*' }));
app.use(bodyParser.json());

const nicknameCheckRouter = require('./nicknamecheck');
app.use('/api', nicknameCheckRouter);

const dbConfig = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl : {
    ca: process.env.DB_SSL_CA
  },
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

// 유저 데이터 조회 API
app.get('/api/userdata', async (req, res) => {
  const uid = req.query.uid;
  if (!uid) return res.status(400).json({ error: 'uid is required' });

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE uid = ?', [uid]);
    if (rows.length === 0)
      return res.status(404).json({ error: 'User not found' });

    const user = rows[0];
    res.json(user);
  } catch (err) {
    console.error('DB error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 유저 및 물약 저장 API
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
    potion_small,
    potion_medium,
    potion_large,
    potion_extralarge,
    potion_quarter,
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
      potion_small,
      potion_medium,
      potion_large,
      potion_extralarge,
      potion_quarter,
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
  const { uid, chatMessages, pvpInfo, userInfo, equippedItems } = req.body;

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
        potion_small,
        potion_medium,
        potion_large,
        potion_extralarge,
        potion_quarter,
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
        potion_small,
        potion_medium,
        potion_large,
        potion_extralarge,
        potion_quarter,
      ]);
    }

    // 2) 채팅 메시지 저장
    if (Array.isArray(chatMessages) && chatMessages.length > 0) {
      const chatInsertPromises = chatMessages.map(
        ({ message, createdAt, nickname }) => {
          return conn.query(
            'INSERT INTO chat_messages (uid, nickname, message, created_at) VALUES (?, ?, ?, ?)',
            [
              uid,
              nickname || '',
              message,
              createdAt ? new Date(createdAt) : new Date(),
            ]
          );
        }
      );
      await Promise.all(chatInsertPromises);
    }

    // 3) 장착 장비 저장
    if (Array.isArray(equippedItems)) {
      // 먼저 해당 유저의 모든 장비를 장착 해제
      await conn.query(
        'UPDATE user_inventory SET equipped = false WHERE uid = ?',
        [uid]
      );
    
      // 장착된 장비만 다시 equipped = true로 업데이트
      for (const item of equippedItems) {
        await conn.query(
          'UPDATE user_inventory SET equipped = true WHERE uid = ? AND item_id = ?',
          [uid, item.item_id]
        );
      }
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

// PVP 대상자 조회 API (excludeUid 제외)
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

// PVP 대상자 조회 (excludeUid 파라미터 사용)
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
  console.log('/api/chat/send 요청:', { uid, nickname, message });

  if (!uid || !nickname || !message) {
    console.log('필수 값 누락');
    return res
      .status(400)
      .json({ error: 'uid, nickname, message가 필요합니다.' });
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

async function getRandomStageItem(stage, conn) {
  // 해당 스테이지에 등록된 아이템 목록 조회
  const [items] = await conn.query(
    'SELECT i.* FROM items i JOIN stage_items si ON i.item_id = si.item_id WHERE si.stage = ?',
    [stage]
  );
  
  if (items.length === 0) return null; // 아이템 없으면 종료
  
  // 랜덤으로 하나 선택
  const randomIndex = Math.floor(Math.random() * items.length);
  return items[randomIndex];
}

async function handleBossDefeat(uid, bossStage) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const dropChance = 1 / bossStage;
    let droppedItem = null;

    if (Math.random() < dropChance) {
      const item = await getRandomStageItem(bossStage, conn);
      if (item) {
        await conn.query(
          'INSERT INTO user_inventory (uid, item_id, item_name, item_type, equipped) VALUES (?, ?, ?, ?, ?)',
          [uid, item.id, item.name, item.type, false]
        );
        droppedItem = item; // 드랍된 아이템 저장
      }
    }

    await conn.commit();

    return droppedItem; // 드랍된 아이템 반환 (없으면 null)
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}


app.post('/api/boss/defeat', verifyFirebaseToken, async (req, res) => {
  const uid = req.uid;
  const { bossStage } = req.body;

  if (!bossStage || typeof bossStage !== 'number') {
    return res.status(400).json({ error: 'bossStage is required and must be a number' });
  }
  
  try {
    const droppedItem = await handleBossDefeat(uid, bossStage);
  
    const apiItem = {
      id: droppedItem.id,
      uid: droppedItem.uid,
      item_id: droppedItem.item_id,
      item_name: droppedItem.name,
      item_type: droppedItem.type,
      equipped: 0
    };

  res.json({ success: true, droppedItem: apiItem });
    
  } catch (err) {
    console.error('Boss defeat error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 유저 인벤토리 조회 API (Firebase 인증 필요)
app.get('/api/inventory', verifyFirebaseToken, async (req, res) => {
  const uid = req.uid; // Firebase 토큰 검증 후 넣어진 uid

  try {
    // 유저 인벤토리 조회
    const [items] = await pool.query(
      'SELECT * FROM user_inventory WHERE uid = ?',
      [uid]
    );

    res.json({
      success: true,
      inventory: items
    });
  } catch (err) {
    console.error('/api/inventory error:', err);
    res.status(500).json({ success: false, error: '인벤토리 조회 실패' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`서버 ${PORT}번 포트에서 실행 중`);
});
