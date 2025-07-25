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
async function calculateTotalStats(uid, conn) {
  const [items] = await conn.query(
    `SELECT str_bonus, dex_bonus, con_bonus, str_multiplier, dex_multiplier, con_multiplier
     FROM user_inventory WHERE uid = ? AND equipped = 1`,
    [uid]
  );

  let bonusStr = 0, bonusDex = 0, bonusCon = 0;
  let strMultiplier = 1, dexMultiplier = 1, conMultiplier = 1;

  items.forEach(item => {
    bonusStr += item.str_bonus || 0;
    bonusDex += item.dex_bonus || 0;
    bonusCon += item.con_bonus || 0;
    strMultiplier *= (1 + (item.str_multiplier || 0));
    dexMultiplier *= (1 + (item.dex_multiplier || 0));
    conMultiplier *= (1 + (item.con_multiplier || 0));
  });

  const [[user]] = await conn.query(`SELECT str, dex, con FROM users WHERE uid = ?`, [uid]);

  const totalStr = Math.floor((user.str + bonusStr) * strMultiplier);
  const totalDex = Math.floor((user.dex + bonusDex) * dexMultiplier);
  const totalCon = Math.floor((user.con + bonusCon) * conMultiplier);

  await conn.query(
    `UPDATE users SET totalStr = ?, totalDex = ?, totalCon = ? WHERE uid = ?`,
    [totalStr, totalDex, totalCon, uid]
  );
}

// ✅ 로그인 시 사용자 정보 제공 + total스탯 적용
app.post('/api/userdata', async (req, res) => {
  const { uid } = req.body;
  if (!uid) return res.status(400).json({ error: 'uid required' });

  const conn = await pool.getConnection();
  try {
    await calculateTotalStats(uid, conn);

    const [[user]] = await conn.query(`SELECT * FROM users WHERE uid = ?`, [uid]);
    const [inventory] = await conn.query(`SELECT * FROM user_inventory WHERE uid = ?`, [uid]);

    res.json({ user, inventory });
  } catch (err) {
    console.error('userdata error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
});

// ✅ 유저 생성
app.post('/api/create', async (req, res) => {
  const { uid, nickname } = req.body;
  if (!uid || !nickname) return res.status(400).json({ error: 'uid, nickname required' });

  const conn = await pool.getConnection();
  try {
    await conn.query(
      `INSERT INTO users 
       (uid, nickname, level, exp, hp, maxHp, str, dex, con, statPoints, totalStr, totalDex, totalCon, created_at, updated_at)
       VALUES (?, ?, 1, 0, 100, 100, 0, 0, 0, 0, 0, 0, 0, NOW(), NOW())`,
      [uid, nickname]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('create error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
});

//유저 정보 저장
app.post('/api/save-user', async (req, res) => {
  const {
    uid, nickname, gold, exp, level, hp, maxHp,
    str, dex, con, statPoints,
    potion_small, potion_medium, potion_large, potion_extralarge, potion_quarter,
  } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const sql = `
      INSERT INTO users (uid, nickname, gold, exp, level, hp, maxHp, str, dex, con, statPoints,
                         potion_small, potion_medium, potion_large, potion_extralarge, potion_quarter)
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

    await conn.query(sql, [
      uid, nickname, gold, exp, level, hp, maxHp,
      str, dex, con, statPoints,
      potion_small, potion_medium, potion_large, potion_extralarge, potion_quarter,
    ]);

    await calculateTotalStats(uid, conn);

    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error('Save user error:', err);
    res.status(500).json({ error: 'Server error' });
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
      // boss_stage가 일치하는 items 중 무작위 1개 선택
      const [rows] = await conn.query(
        'SELECT * FROM items WHERE boss_stage = ? ORDER BY RAND() LIMIT 1',
        [bossStage]
      );

      if (rows.length > 0) {
        const item = rows[0]; // 드랍된 아이템 정보
        await conn.query(
          `INSERT INTO user_inventory 
            (uid, item_id, item_name, item_type, str_bonus, dex_bonus, con_bonus, str_multiplier, dex_multiplier, con_multiplier, equipped) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            uid,
            item.item_id,
            item.name,
            item.type,
            item.str_bonus,
            item.dex_bonus,
            item.con_bonus,
            item.str_multiplier,
            item.dex_multiplier,
            item.con_multiplier,
            false,
          ]
        );
        droppedItem = item;
      }
    }

    await conn.commit();

    return droppedItem; // 드랍된 아이템 객체 반환
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

    if (!droppedItem) {
      return res.json({ success: false, message: "아이템 획득에 실패했습니다." });
    }

    const apiItem = {
      item_id: droppedItem.item_id,
      item_name: droppedItem.name,
      item_type: droppedItem.type,
      equipped: droppedItem.equipped
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

app.post('/api/save-equipped', async (req, res) => {
  const { uid, equippedItems } = req.body;

  if (!uid) return res.status(400).json({ error: 'uid is required' });
  if (!Array.isArray(equippedItems)) return res.status(400).json({ error: 'equippedItems must be an array' });

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // 1) 유저의 모든 장비 장착 해제
    await conn.query('UPDATE user_inventory SET equipped = false WHERE uid = ?', [uid]);

    // 2) 전달받은 장착 아이템만 equipped = true 처리
    for (const item of equippedItems) {
      if (item.id) {
        await conn.query(
          'UPDATE user_inventory SET equipped = true WHERE uid = ? AND id = ?',
          [uid, item.id]
        );
      }
    }

    await conn.commit();
    res.json({ success: true });
  } catch (error) {
    await conn.rollback();
    console.error('Error updating equipped items:', error);
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
});

app.post('/api/unequip', verifyFirebaseToken, async (req, res) => {
  const { uid } = req;
  const { item_id } = req.body;

  if (!item_id) {
    return res.status(400).json({ error: 'item_id is required' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 해당 아이템 장착 해제
    await conn.query(
      'UPDATE user_inventory SET equipped = false WHERE uid = ? AND item_id = ?',
      [uid, item_id]
    );

    await conn.commit();
    res.json({ success: true, message: '아이템이 해제되었습니다.' });
  } catch (error) {
    await conn.rollback();
    console.error(error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  } finally {
    conn.release();
  }
});

app.post("/api/enhance", async (req, res) => {
  const { uid, id } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 골드 확인
    const [[user]] = await conn.query("SELECT gold FROM users WHERE uid = ?", [uid]);
    if (!user || user.gold < 100000000000) {
      await conn.rollback();
      conn.release();
      return res.status(400).json({ message: "골드가 부족합니다." });
    }

    // 아이템 조회
    const [[item]] = await conn.query("SELECT * FROM user_inventory WHERE uid = ? AND id = ?", [uid, id]);
    if (!item) {
      await conn.rollback();
      conn.release();
      return res.status(404).json({ message: "아이템이 없습니다." });
    }

    const enhancementLevel = item.enhancement_level || 0;
    const successRate = 1 / (enhancementLevel + 1);

    // 골드 차감 (강화 시도시 무조건 차감)
    await conn.query("UPDATE users SET gold = gold - 100000000000 WHERE uid = ?", [uid]);

    const success = Math.random() < successRate;

    if (success) {
      const newLevel = enhancementLevel + 1;
      const baseName = item.item_name.replace(/(\d+강\s*)?/, ""); // 기존 이름에서 "n강 " 제거
      const newName = `${newLevel}강 ${baseName}`;

      // 강화 수치 2배
      await conn.query(`
        UPDATE user_inventory SET
          enhancement_level = ?,
          item_name = ?,
          str_bonus = str_bonus * 2,
          dex_bonus = dex_bonus * 2,
          con_bonus = con_bonus * 2,
          str_multiplier = str_multiplier * 2,
          dex_multiplier = dex_multiplier * 2,
          con_multiplier = con_multiplier * 2
        WHERE uid = ? AND id = ?
      `, [newLevel, newName, uid, id]);

      await conn.commit();
      res.json({ success: true, message: `${newName} 강화 성공!` });

    } else {
      // 실패 - 아이템 파괴(삭제)
      await conn.query("DELETE FROM user_inventory WHERE uid = ? AND id = ?", [uid, id]);
      await conn.commit();
      res.json({ success: false, message: "강화 실패! 아이템이 파괴되었습니다." });
    }
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: "서버 오류" });
  } finally {
    conn.release();
  }
});



const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`서버 ${PORT}번 포트에서 실행 중`);
});
