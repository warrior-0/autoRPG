let interval;
let data = {};

onmessage = function (e) {
  if (e.data.command === 'start') {
    data = e.data.userData;
    startDungeon();
  } else if (e.data.command === 'stop') {
    clearInterval(interval);
  } else if (e.data.command === 'update') {
    data = e.data.userData;
  }
};

function startDungeon() {
  let currentStage = data.currentStage;
  let monsterHp = Math.floor((currentStage / 7 + 1) * currentStage * 2);

  interval = setInterval(() => {
    // 간단히 전투만 처리
    let playerAtk = 1 + ((data.level / 2) + 1) * data.str * 1.5;
    let dmg = Math.max(1, Math.floor(playerAtk + Math.random() * 5));
    monsterHp -= dmg;

    if (monsterHp <= 0) {
      postMessage({
        type: 'monsterDefeated',
        gold: currentStage * 20,
        exp: currentStage * 10,
      });
      monsterHp = Math.floor((currentStage / 7 + 1) * currentStage * 2);
    }

    postMessage({
      type: 'tick',
      monsterHp,
      playerHp: data.hp
    });

  }, 1000);
}
