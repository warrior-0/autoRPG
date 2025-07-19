export default class InventoryUI {
  #inv; #api; #statsUI;
  constructor(inv, apiClient, statsUI) {
    this.#inv     = inv;
    this.#api     = apiClient;
    this.#statsUI = statsUI;
  }

  async renderAll() {
    await this.reload();
    this.renderEquipment();
    this.renderInventory();
    this.#statsUI.render();
  }

  async reload() {
    const data = await this.#api.fetchInventory();
    this.#inv = new (this.#inv.constructor)(data.inventory);
  }

  renderEquipment() {
    const slotEl = document.getElementById('equipment');
    slotEl.innerHTML = this.#inv.getEquipped()
      .map(i => `
        <div>${i.name}</div>
      `).join('') || '<div>무기: 없음</div><div>투구: 없음</div><div>갑옷: 없음</div><div>방패: 없음</div><div>신발: 없음</div>';
  }

  renderInventory() {
    const cont = document.getElementById('inventory');
    cont.innerHTML = '';
    this.#inv.items.forEach(item => {
      const btn = document.createElement('button');
      btn.textContent = item.name;
      btn.onclick = async () => {
        item.equipped
          ? await this.#api.unequip(item.id)
          : await this.#api.equip(item.id);
        await this.renderAll();
      };
      cont.appendChild(btn);
    });
  }
}