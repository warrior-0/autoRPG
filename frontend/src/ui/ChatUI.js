export default class ChatUI {
  #container; #api;
  constructor(container, apiClient) {
    this.#container = container;
    this.#api = apiClient;
  }

  async renderAll() {
    // 채팅 기능은 차후 API 명세에 따라 구현
    this.#container.innerHTML = '<div>실시간 채팅 기능 준비 중...</div>';
  }
}