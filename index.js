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

// 유저 장착 장비 저장 API
app.post('/api/user/equipment', verifyFirebaseToken, async (req, res) => {
  const uid = req.uid;
  const { equippedItems } = req.body; // { weapon: itemId, helmet: itemId, ... }

  if (!equippedItems || typeof equippedItems !== 'object') {
    return res.status(400).json({ error: 'equippedItems is required and must be an object' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1) 기존 장착 해제
    await conn.query('UPDATE user_inventory SET equipped = 0 WHERE uid = ?', [uid]);

    // 2) 새로 장착된 아이템 equipped=1로 업데이트
    const itemIds = Object.values(equippedItems).filter(id => id != null);

    if (itemIds.length > 0) {
      const placeholders = itemIds.map(() => '?').join(',');
      const sql = `UPDATE user_inventory SET equipped = 1 WHERE uid = ? AND item_id IN (${placeholders})`;
      await conn.query(sql, [uid, ...itemIds]);
    }

    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error('Save user equipment error:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    conn.release();
  }
});

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

// 유저 데이터 조회 API (장착 아이템 포함)
app.get('/api/userdata', async (req, res) => {
  const uid = req.query.uid;
  if (!uid) return res.status(400).json({ error: 'uid is required' });

  try {
    const [userRows] = await pool.query('SELECT * FROM users WHERE uid = ?', [uid]);
    if (userRows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = userRows[0];

    const [equipRows] = await pool.query(
      `SELECT i.* FROM items i
       JOIN user_inventory ui ON ui.item_id = i.id
       WHERE ui.uid = ? AND ui.equipped = 1`,
      [uid]
    );

    res.json({
      user,
      equipped: equipRows
    });
  } catch (err) {
    console.error('/api/userdata error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
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

// 보스 처치 처리 (아이템 드랍 포함)
async function getRandomStageItem(stage, conn) {
  const [items] = await conn.query(
    'SELECT i.* FROM items i JOIN stage_items si ON i.id = si.item_id WHERE si.stage = ?',
    [stage]
  );
  if (items.length === 0) return null;
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
        droppedItem = item;
      }
    }

    await conn.commit();
    return droppedItem;
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
    res.json({ success: true, droppedItem });
  } catch (err) {
    console.error('Boss defeat error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 유저 능력치 계산 API (장비 보너스 포함)
app.get('/api/userstats', async (req, res) => {
  const uid = req.query.uid;
  if (!uid) return res.status(400).json({ error: 'uid is required' });

  const conn = await pool.getConnection();
  try {
    const [[user]] = await conn.query(`SELECT str, dex, con FROM users WHERE uid = ?`, [uid]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const [equippedItems] = await conn.query(
      `SELECT item_id FROM user_inventory WHERE uid = ? AND equipped = TRUE`,
      [uid]
    );
    const itemIds = equippedItems.map(row => row.item_id);
    if (itemIds.length === 0) {
      return res.json({
        baseStats: user,
        finalStats: user,
        bonusAdd: { str: 0, dex: 0, con: 0 },
        bonusMul: { str: 1, dex: 1, con: 1 }
      });
    }

    const [equipmentRows] = await conn.query(
      `SELECT * FROM items WHERE id IN (${itemIds.map(() => '?').join(',')})`,
      itemIds
    );

    function convertEquipmentRowToItem(row) {
      return {
        name: row.name,
        type: row.type,
        bonus: {
          strAdd: row.str_bonus || 0,
          dexAdd: row.dex_bonus || 0,
          conAdd: row.con_bonus || 0,
          strMul: row.str_multiplier || 1,
          dexMul: row.dex_multiplier || 1,
          conMul: row.con_multiplier || 1,
        }
      };
    }

    const equipped = {};
    equipmentRows.forEach(row => {
      equipped[row.type] = convertEquipmentRowToItem(row);
    });

    function calculateEquippedBonusStats(equipped) {
      const bonusAdd = { str: 0, dex: 0, con: 0 };
      const bonusMul = { str: 1, dex: 1, con: 1 };

      Object.values(equipped).forEach(item => {
        if (item && item.bonus) {
          bonusAdd.str += item.bonus.strAdd;
          bonusAdd.dex += item.bonus.dexAdd;
          bonusAdd.con += item.bonus.conAdd;

          bonusMul.str *= item.bonus.strMul;
          bonusMul.dex *= item.bonus.dexMul;
          bonusMul.con *= item.bonus.conMul;
        }
      });

      return { bonusAdd, bonusMul };
    }

    function getFinalStats(userData, equipped) {
      const { bonusAdd, bonusMul } = calculateEquippedBonusStats(equipped);
      return {
        str: Math.floor((userData.str + bonusAdd.str) * bonusMul.str),
        dex: Math.floor((userData.dex + bonusAdd.dex) * bonusMul.dex),
        con: Math.floor((userData.con + bonusAdd.con) * bonusMul.con),
        bonusAdd,
        bonusMul
      };
    }

    const final = getFinalStats(user, equipped);

    res.json({
      baseStats: user,
      finalStats: {
        str: final.str,
        dex: final.dex,
        con: final.con
      },
      bonusAdd: final.bonusAdd,
      bonusMul: final.bonusMul
    });
  } catch (err) {
    console.error('/api/userstats error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    conn.release();
  }
});
