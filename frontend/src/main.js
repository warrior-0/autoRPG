import AuthService from './services/AuthService.js';
import ApiClient    from './services/ApiClient.js';
import User         from './models/User.js';
import Inventory    from './models/Inventory.js';
import NavUI        from './ui/NavUI.js';
import StatsUI      from './ui/StatsUI.js';
import InventoryUI  from './ui/InventoryUI.js';
import ChatUI       from './ui/ChatUI.js';

(async () => {
  await AuthService.init();
  const token  = await AuthService.getToken();
  const api    = new ApiClient(token);

  const userData = await api.fetchUserData();
  const user     = new User(userData);
  const inv      = new Inventory(userData.inventory);

  // UI 초기화
  new NavUI(document.getElementById('nav')).render();
  const statsUI = new StatsUI(user);
  const invUI   = new InventoryUI(inv, api, statsUI);
  const chatUI  = new ChatUI(document.getElementById('chat'), api);

  await invUI.renderAll();
  await chatUI.renderAll();

  statsUI.render();
})();