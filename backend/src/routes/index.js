import express from 'express';
import cors from 'cors';
import { json as bodyParser } from 'body-parser';
import AuthService from '../services/AuthService.js';
import InventoryCtrl from '../controllers/InventoryController.js';

const router = express.Router();

router.use(cors());
router.use(bodyParser());
router.use((req, res, next) => AuthService.verifyToken(req, res, next));

router.get('/userdata', (req, res) => {
  res.json({ user: { uid: req.uid } });
});
router.get('/inventory', InventoryCtrl.get);
router.post('/equip', InventoryCtrl.equip);
router.post('/unequip', InventoryCtrl.unequip);

export default router;