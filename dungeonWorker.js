let interval;
let userData;
let currentStage;
let monsterHp, monsterCrit, monsterHit, monsterDef, monsterAtk, reward;
let evasionRatePlayer, monsterEvasion, evasionRateMonster;

function applyRandomVariance(value) {
  const variance = Math.random() * 0.2 - 0.1; // ±10%
  return Math.floor(value * (1 + variance));
}

onmessage = function (e) {
  if (e.data.command === 'start') {
    userData = e.data.userData;

    // userData.hp 와 maxHp가 null 또는 undefined면 기본값 넣기
    userData.maxHp = userData.maxHp ?? 100;
    userData.hp = userData.hp ?? userData.maxHp;

    currentStage = Number(e.data.currentStage) || 1;

    setupMonster();
    startCombat();
  } else if (e.data.command === 'stop') {
    clearInterval(interval);
  } else if (e.data.command === 'updateUserData') {
    userData = e.data.userData;

    userData.maxHp = userData.maxHp ?? 100;
    userData.hp = userData.hp ?? userData.maxHp;
  }
};

function setupMonster() {
  monsterHp = Math.floor((currentStage / 7 + 1) * currentStage * 2);
  monsterCrit = currentStage;
  monsterHit = currentStage * 7;
  monsterDef = (currentStage / 20 + 1) * currentStage;
  monsterAtk = Math.floor((currentStage / 4 + 1) * currentStage);
  reward = currentStage;
  evasionRatePlayer = userData.dex / (userData.dex + monsterHit);
  monsterEvasion = currentStage - 1;
  evasionRateMonster = monsterEvasion / (monsterEvasion + userData.dex * 5 + userData.str * 5 + 1);
}

function startCombat() {
  interval = setInterval(() => {
    let logMessages = [];

    // 몬스터 → 플레이어
    if (Math.random() < evasionRatePlayer) {
      logMessages.push("플레이어가 몬스터 공격을 회피했습니다.");
    } else {
      let isCrit = Math.random() * 100 < monsterCrit;
      let playerDef = userData.con;
      let dmgReduction = 1 - (playerDef / (userData.level * 2 + playerDef));
      let dmg = monsterAtk;

      if (isCrit) {
        dmg = Math.floor(monsterAtk * (monsterCrit / 2000 + 1.1));
        dmg = Math.floor(dmg * dmgReduction);
        dmg = applyRandomVariance(dmg);
        dmg = Math.max(1, dmg);
        userData.hp -= dmg;
        logMessages.push(`몬스터의 치명타 공격! 플레이어가 ${dmg} 피해를 받았습니다.`);
      } else {
        dmg = Math.floor(dmg * dmgReduction);
        dmg = applyRandomVariance(dmg);
        dmg = Math.max(1, dmg);
        userData.hp -= dmg;
        logMessages.push(`플레이어가 ${dmg} 피해를 받았습니다.`);
      }
    }

    // 플레이어 → 몬스터
    if (Math.random() < evasionRateMonster) {
      logMessages.push("몬스터가 플레이어 공격을 회피했습니다.");
    } else {
      const playerAtk = 1 + ((userData.level / 2) + 1) * userData.str * 1.5;
      const critStat = userData.dex * 5;
      const critChance = (critStat / (critStat + 150)) * 100;
      let isCrit = Math.random() * 100 < critChance;

      let dmg;
      let dmgReductionPlayer = 1 - (monsterDef / (userData.level * 2 + monsterDef));

      if (isCrit) {
        const critDamage = playerAtk * (critStat / 2000 + 1.1);
        dmg = Math.floor(critDamage * dmgReductionPlayer);
        dmg = applyRandomVariance(dmg);
        dmg = Math.max(1, dmg);
        monsterHp -= dmg;
        monsterHp = Math.max(0, monsterHp);
        logMessages.push(`플레이어의 치명타 공격! 몬스터가 ${dmg} 피해를 받았습니다.`);
      } else {
        dmg = Math.floor(playerAtk * dmgReductionPlayer);
        dmg = applyRandomVariance(dmg);
        dmg = Math.max(1, dmg);
        monsterHp -= dmg;
        monsterHp = Math.max(0, monsterHp);
        logMessages.push(`몬스터가 ${dmg} 피해를 받았습니다.`);
      }
    }

    logMessages.push(`몬스터 남은 체력: ${Math.max(0, monsterHp)}`);

    // 전투 결과 전송
    postMessage({
      type: 'combatTick',
      userData,
      monsterHp,
      logs: logMessages
    });

    // 몬스터 사망 처리
    if (monsterHp <= 0) {
      userData.gold += reward * 20;
      userData.exp += reward * 10;

      postMessage({
        type: 'monsterDefeated',
        gold: reward * 20,
        exp: reward * 10,
        userData
      });

      setupMonster();
    }

    // 사망 처리
    if (userData.hp <= 0) {
      clearInterval(interval);
      postMessage({
        type: 'playerDead',
        userData
      });
    }
  }, 1000);
}
