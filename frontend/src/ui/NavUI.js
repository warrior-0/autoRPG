export default class NavUI {
  #container;
  constructor(container) { this.#container = container; }
  render() {
    this.#container.innerHTML = `
      <nav>
        홈 | 던전 | 보스 | 상점 | 후원 | 랭킹 | 아레나 | 인벤토리
      </nav>`;
  }
}