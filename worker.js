let userData, currentStage;
let monsterHp, monsterCrit, monsterHit, monsterDef, monsterAtk, reward;
let evasionRatePlayer, monsterEvasion, evasionRateMonster;
let intervalId;

onmessage = function (e) {
  const { type, data } = e.data;
  if (type === "start") {
    userData = data.userData;
    currentStage = data.currentStage;
    setupMonster();
    startBattleLoop();
  } else if (type === "stop") {
    clearInterval(intervalId);
  }
};

function setupMonster() {
  reward = currentStage;
  monsterHp = Math.floor((currentStage / 7 + 1) * currentStage * 2);
  monsterCrit = currentStage;
  monsterHit = currentStage * 7;
  monsterDef = (currentStage / 20 + 1) * currentStage;
  monsterAtk = Math.floor((currentStage / 4 + 1) * currentStage);
  evasionRatePlayer = userData.dex / (userData.dex + monsterHit);
  monsterEvasion = currentStage - 1;
  evasionRateMonster = monsterEvasion / (monsterEvasion + userData.dex * 5 + userData.str * 5 + 1);
}

function startBattleLoop() {
  intervalId = setInterval(() => {
    // 몬스터 -> 플레이어 공격
    if (Math.random() >= evasionRatePlayer) {
      const isCrit = Math.random() * 100 < monsterCrit;
      const playerDef = userData.con;
      const dmgReduction = 1 - (playerDef / (userData.level * 2 + playerDef));
      let dmg = monsterAtk;

      if (isCrit) dmg = Math.floor(monsterAtk * (monsterCrit / 2000 + 1.1));
      dmg = Math.floor(dmg * dmgReduction);
      dmg = applyRandomVariance(dmg);
      dmg = Math.max(1, dmg);

      userData.hp -= dmg;

      postMessage({
        type: "log",
        message: isCrit
          ? `몬스터의 치명타 공격! 플레이어가 ${dmg} 피해를 받았습니다.`
          : `플레이어가 ${dmg} 피해를 받았습니다.`
      });
    } else {
      postMessage({ type: "log", message: "플레이어가 몬스터 공격을 회피했습니다." });
    }

    // 플레이어 -> 몬스터 공격
    if (Math.random() >= evasionRateMonster) {
      const playerAtk = 1 + ((userData.level / 2) + 1) * userData.str * 1.5;
      const critStat = userData.dex * 5;
      const critChance = (critStat / (critStat + 150)) * 100;
      const isCrit = Math.random() * 100 < critChance;

      const dmgReduction = 1 - (monsterDef / (userData.level * 2 + monsterDef));
      let dmg = isCrit
        ? playerAtk * (critStat / 2000 + 1.1)
        : playerAtk;

      dmg = Math.floor(dmg * dmgReduction);
      dmg = applyRandomVariance(dmg);
      dmg = Math.max(1, dmg);

      monsterHp -= dmg;

      postMessage({
        type: "log",
        message: isCrit
          ? `플레이어의 치명타 공격! 몬스터가 ${dmg} 피해를 받았습니다.`
          : `몬스터가 ${dmg} 피해를 받았습니다.`
      });
    } else {
      postMessage({ type: "log", message: "몬스터가 플레이어 공격을 회피했습니다." });
    }

    postMessage({ type: "log", message: `몬스터 남은 체력: ${Math.max(0, monsterHp)}` });

    if (monsterHp <= 0) {
      userData.gold += reward * 20;
      userData.exp += reward * 10;

      postMessage({ type: "log", message: `몬스터 처치 보상 획득! 골드: ${reward * 20} 경험치: ${reward * 10}` });

      setupMonster(); // 다음 몬스터 재생성
    }

    // 유저 사망
    if (userData.hp <= 0) {
      userData.exp = Math.floor(userData.exp * 0.7);
      userData.hp = userData.maxHp;

      postMessage({ type: "dead", userData, message: "던전에서 사망했습니다." });
      clearInterval(intervalId);
    }

    postMessage({ type: "update", userData });
  }, 1000);
}

function applyRandomVariance(value) {
  const variance = 0.1;
  return Math.floor(value * (1 + (Math.random() * 2 - 1) * variance));
}
