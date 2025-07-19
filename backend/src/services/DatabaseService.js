import mysql from 'mysql2/promise';
import CONFIG from '../config.js';

const pool = mysql.createPool(CONFIG.mysql);
export default pool;