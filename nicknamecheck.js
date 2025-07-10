const express = require('express');
const mysql = require('mysql2/promise');
const app = express();
const port = 3001; // 원하는 포트번호

// MySQL 연결 설정
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: 'qhemfqhemf2!',
  database: 'test',
};

app.use(express.json());

// 닉네임 중복 체크 API
app.get('/api/checkNickname', async (req, res) => {
  const nickname = req.query.nickname;
  if (!nickname) {
    return res
      .status(400)
      .json({ error: 'nickname query parameter is required' });
  }

  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute(
      'SELECT COUNT(*) AS count FROM users WHERE nickname = ?',
      [nickname]
    );

    const isTaken = rows[0].count > 0;
    res.json({ taken: isTaken });
  } catch (error) {
    console.error('DB error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

// 사용자 데이터 조회 API
app.get('/api/userdata', async (req, res) => {
  const uid = req.query.uid;
  if (!uid) {
    return res.status(400).json({ error: 'uid is required' });
  }

  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute(
      'SELECT * FROM users WHERE uid = ?',
      [uid]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = rows[0];

    // 포션 정보도 가져오기
    const [potions] = await connection.execute(
      'SELECT small, medium, large, extralarge FROM user_potions WHERE uid = ?',
      [uid]
    );

    user.potions = potions[0] || {
      small: 0,
      medium: 0,
      large: 0,
      extralarge: 0,
    };

    res.json(user);
  } catch (error) {
    console.error('DB error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
