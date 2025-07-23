let userData, currentStage;
let monsterHp, monsterCrit, monsterHit, monsterDef, monsterAtk, reward;
let evasionRatePlayer, monsterEvasion, evasionRateMonster;
let intervalId;

self.onmessage = function (event) {
  const { type, userData: newUserData, stage: newStage } = event.data;

  if (type === 'start') {
    if (newUserData) userData = newUserData;
    if (newStage) currentStage = newStage;

    if (!userData || !currentStage) {
      postMessage({ type: 'log', message: 'userData 또는 currentStage가 없습니다. 전투를 시작할 수 없습니다.' });
      return;
    }

    setupMonster();
    startBattleLoop();

  } else if (type === 'stop') {
    stopAutoBattle();

  } else if (type === 'updateUserData') {
    userData = newUserData;
    setupMonster();

  } else if (type === 'updateStage') {
    currentStage = newStage;
    setupMonster();
  }
};

function stopAutoBattle() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}


function autoUsePotion() {
  const missingHp = userData.maxHp - userData.hp;
  if (missingHp <= 0) return;

  if (userData.potion_quarter > 0 && missingHp >= 100000 + userData.maxHp * 0.50) {
    userData.potion_quarter--;
    const heal = Math.floor(100000 + userData.maxHp * 0.50);
    userData.hp += heal;
    postMessage({ type: "log", message: `슈퍼 물약 사용! 체력 ${heal} 회복` });

  } else if (userData.potion_extralarge > 0 && missingHp >= 10000 + userData.maxHp * 0.15) {
    userData.potion_extralarge--;
    const heal = Math.floor(10000 + userData.maxHp * 0.15);
    userData.hp += heal;
    postMessage({ type: "log", message: `초대형 물약 사용! 체력 ${heal} 회복` });

  } else if (userData.potion_large > 0 && missingHp >= 1000 + userData.maxHp * 0.07) {
    userData.potion_large--;
    const heal = Math.floor(1000 + userData.maxHp * 0.07);
    userData.hp += heal;
    postMessage({ type: "log", message: `대형 물약 사용! 체력 ${heal} 회복` });

  } else if (userData.potion_medium > 0 && missingHp >= 100 + userData.maxHp * 0.03) {
    userData.potion_medium--;
    const heal = Math.floor(100 + userData.maxHp * 0.03);
    userData.hp += heal;
    postMessage({ type: "log", message: `중형 물약 사용! 체력 ${heal} 회복` });

  } else if (userData.potion_small > 0 && missingHp >= 10 + userData.maxHp * 0.01) {
    userData.potion_small--;
    const heal = Math.floor(10 + userData.maxHp * 0.01);
    userData.hp += heal;
    postMessage({ type: "log", message: `소형 물약 사용! 체력 ${heal} 회복` });
  }

  userData.hp = Math.min(userData.hp, userData.maxHp);
}

function checkLevelUp() {
  while (userData.exp >= userData.level * 100) {
    const expToLevel = userData.level * 100;
    userData.exp -= expToLevel;
    userData.level++;
    userData.statPoints += 3;
    userData.hp = userData.maxHp;
    postMessage({
      type: "log",
      message: `레벨업! 현재 레벨: ${userData.level}, 스탯 포인트 +3`
    });
  }
}

function setupMonster() {
  reward = currentStage;
  monsterHp = Math.floor((currentStage / 7 + 1) * currentStage * 2);
  monsterCrit = currentStage;
  monsterHit = currentStage * 7;
  monsterDef = (currentStage / 20 + 1) * currentStage;
  monsterAtk = Math.floor((currentStage / 4 + 1) * currentStage);
  evasionRatePlayer = userData.totalDex / (userData.totalDex + monsterHit);
  monsterEvasion = currentStage - 1;
  evasionRateMonster = monsterEvasion / (monsterEvasion + userData.totalDex * 5 + userData.totalStr * 5 + 1);
}

function startBattleLoop() {
  intervalId = setInterval(() => {
    // 몬스터 -> 플레이어 공격
    if (Math.random() >= evasionRatePlayer) {
      const isCrit = Math.random() * 100 < monsterCrit;
      const playerDef = userData.totalCon;
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
      const playerAtk = 1 + ((userData.level / 2) + 1) * userData.totalStr * 1.5;
      const critStat = userData.totalDex * 5;
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
      
      checkLevelUp();

      setupMonster(); // 다음 몬스터 재생성
    }
    
    autoUsePotion();

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
