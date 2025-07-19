import pool from './DatabaseService.js';

export default class InventoryService {
  static async getInventory(uid) {
    const [rows] = await pool.query(
      `SELECT ui.item_id, ui.equipped, i.item_name, i.item_type
       FROM user_inventory ui
       JOIN items i ON ui.item_id = i.id
       WHERE ui.uid = ?`,
      [uid]
    );
    return rows.map(r => ({
      id: r.item_id,
      item_name: r.item_name,
      item_type: r.item_type,
      equipped: !!r.equipped
    }));
  }

  static async equip(uid, itemId) {
    await pool.execute(
      `UPDATE user_inventory
       SET equipped = CASE WHEN item_id = ? THEN true ELSE false END
       WHERE uid = ?`,
      [itemId, uid]
    );
  }

  static async unequip(uid, itemId) {
    await pool.execute(
      `UPDATE user_inventory
       SET equipped = false
       WHERE uid = ? AND item_id = ?`,
      [uid, itemId]
    );
  }
}