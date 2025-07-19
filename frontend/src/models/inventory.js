import Item from './Item.js';

export default class Inventory {
  #items;
  constructor(rawItems = []) {
    this.#items = rawItems.map(i => new Item(i));
  }
  get items() { return [...this.#items]; }
  equip(itemId) {
    const item = this.#items.find(i => i.id === itemId);
    if (item) item.equip();
  }
  unequip(itemId) {
    const item = this.#items.find(i => i.id === itemId);
    if (item) item.unequip();
  }
  getEquipped() {
    return this.#items.filter(i => i.equipped);
  }
}