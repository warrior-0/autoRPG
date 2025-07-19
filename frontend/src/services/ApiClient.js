export default class ApiClient {
  #base = 'https://autorpg.onrender.com/api';
  #token;

  constructor(token) { this.#token = token; }

  async #request(path, options = {}) {
    const res = await fetch(`${this.#base}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.#token}`
      },
      ...options
    });
    if (!res.ok) throw new Error(`API Error ${res.status}`);
    return res.json();
  }

  fetchUserData() {
    return this.#request('/userdata', { method: 'GET' });
  }
  fetchInventory() {
    return this.#request(`/inventory?uid=${this.#token}`, { method: 'GET' });
  }
  equip(itemId) {
    return this.#request('/equip', {
      method: 'POST',
      body: JSON.stringify({ item_id: itemId })
    });
  }
  unequip(itemId) {
    return this.#request('/unequip', {
      method: 'POST',
      body: JSON.stringify({ item_id: itemId })
    });
  }
}