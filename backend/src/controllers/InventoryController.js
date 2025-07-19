import InventoryService from '../services/InventoryService.js';

export default class InventoryController {
  static async get(req, res, next) {
    try {
      const items = await InventoryService.getInventory(req.uid);
      res.json({ inventory: items });
    } catch (e) { next(e); }
  }
  static async equip(req, res, next) {
    try {
      await InventoryService.equip(req.uid, +req.body.item_id);
      res.sendStatus(204);
    } catch (e) { next(e); }
  }
  static async unequip(req, res, next) {
    try {
      await InventoryService.unequip(req.uid, +req.body.item_id);
      res.sendStatus(204);
    } catch (e) { next(e); }
  }
}