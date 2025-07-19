import express from 'express';
import router from './routes/index.js';
import CONFIG from './config.js';

const app = express();
app.use(router);

// 글로벌 에러 핸들러
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message });
});

app.listen(CONFIG.port, () => {
  console.log(`Server listening on port ${CONFIG.port}`);
});