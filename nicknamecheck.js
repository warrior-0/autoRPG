// nicknamecheck.js
const express = require('express');
const mysql = require('mysql2/promise');
const router = express.Router();

const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: 'qhemfqhemf2!',
  database: 'test',
};

// 닉네임 중복 체크 API
router.get('/checkNickname', async (req, res) => {
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

module.exports = router;
