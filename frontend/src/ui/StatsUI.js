export default class StatsUI {
  #user;
  constructor(user) { this.#user = user; }
  render() {
    document.getElementById('stats').innerHTML = `
      현재 유저: ${this.#user.nickname}<br />
      레벨: ${this.#user.level}<br />
      체력: ${this.#user.hp} / ${this.#user.maxHp}<br />
      스탯 — STR: ${this.#user.str || 0} | DEX: ${this.#user.dex || 0} | CON: ${this.#user.con || 0}<br />
      골드: ${this.#user.gold} | 경험치: ${this.#user.exp}<br />
      물약: 소형: ${this.#user.potionSmall} 중형: ${this.#user.potionMedium} 대형: ${this.#user.potionLarge} 초대형: ${this.#user.potionXL} 슈퍼: ${this.#user.potionSuper}<br />
      스탯 포인트: ${this.#user.statsPoints}
    `;
  }
}


