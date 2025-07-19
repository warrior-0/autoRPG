export default class Item {
  #id; #name; #type; #equipped;
  constructor({ id, item_name, item_type, equipped }) {
    this.#id       = id;
    this.#name     = item_name;
    this.#type     = item_type;
    this.#equipped = !!equipped;
  }
  get id()       { return this.#id; }
  get name()     { return this.#name; }
  get type()     { return this.#type; }
  get equipped() { return this.#equipped; }
  equip()   { this.#equipped = true; }
  unequip() { this.#equipped = false; }
}