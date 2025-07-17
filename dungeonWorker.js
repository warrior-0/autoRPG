let interval;
let userData;
let currentStage;
let monsterHp, monsterCrit, monsterHit, monsterDef, monsterAtk, reward;
let evasionRatePlayer, monsterEvasion, evasionRateMonster;

function applyRandomVariance(value) {
  const variance = Math.random() * 0.2 - 0.1; // ±10%
  return Math.floor(value * (1 + variance));
}

function debugLog(msg) {
  postMessage({ type: 'debug', message: msg });
}

onmessage = function (e) {
  debugLog(`onmessage received: command=${e.data.command}`);

  if (e.data.command === 'start') {
    userData = e.data.userData;
    debugLog(`start: userData received, currentStage=${userData.currentStage}`);

    userData.maxHp = userData.maxHp ?? 100;
    userData.hp = userData.hp ?? userData.maxHp;

    currentStage = Number(userData.currentStage) || 1;
    debugLog(`currentStage set to ${currentStage}`);

    setupMonster();
    startCombat();
  } else if (e.data.command === 'stop') {
    clearInterval(interval);
    debugLog("stop command received: interval cleared");
  } else if (e.data.command === 'updateUserData') {
    userData = e.data.userData;
    debugLog("updateUserData command received");

    userData.maxHp = userData.maxHp ?? 100;
    userData.hp = userData.hp ?? userData.maxHp;
  }
};

function setupMonster() {
  debugLog("setupMonster called");
  monsterHp = Math.floor((currentStage / 7 + 1) * currentStage * 2);
  monsterCrit = currentStage;
  monsterHit = currentStage * 7;
  monsterDef = (currentStage / 20 + 1) * currentStage;
  monsterAtk = Math.floor((currentStage / 4 + 1) * currentStage);
  reward = currentStage;
  evasionRatePlayer = userData.dex / (userData.dex + monsterHit);
  monsterEvasion = currentStage - 1;
  evasionRateMonster = monsterEvasion / (monsterEvasion + userData.dex * 5 + userData.str * 5 + 1);

  debugLog(`Monster stats: HP=${monsterHp}, Crit=${monsterCrit}, Atk=${monsterAtk}`);
}

function startCombat() {
  debugLog("startCombat called");
  interval = setInterval(() => {
    debugLog("Combat tick start");
    let logMessages = [];

    // 몬스터 → 플레이어
    if (Math.random() < evasionRatePlayer) {
      postMessage({ type: 'debug', message: "플레이어가 몬스터 공격을 회피했습니다."});
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
        postMessage({ type: 'debug', message: "몬스터의 치명타 공격! 플레이어가 ${dmg} 피해를 받았습니다."});
        debugLog(`Monster crit damage applied: ${dmg}, player HP now ${userData.hp}`);
      } else {
        dmg = Math.floor(dmg * dmgReduction);
        dmg = applyRandomVariance(dmg);
        dmg = Math.max(1, dmg);
        userData.hp -= dmg;
        postMessage({ type: 'debug', message: `플레이어가 ${dmg} 피해를 받았습니다.` });
        debugLog(`Monster normal damage applied: ${dmg}, player HP now ${userData.hp}`);
      }
    }

    // 플레이어 → 몬스터
    if (Math.random() < evasionRateMonster) {
      postMessage({ type: 'debug', message: "몬스터가 플레이어 공격을 회피했습니다."});
      debugLog("Monster evaded player attack");
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
        postMessage({ type: 'debug', message: `플레이어의 치명타 공격! 몬스터가 ${dmg} 피해를 받았습니다.` });
        debugLog(`Player crit damage applied: ${dmg}, monster HP now ${monsterHp}`);
      } else {
        dmg = Math.floor(playerAtk * dmgReductionPlayer);
        dmg = applyRandomVariance(dmg);
        dmg = Math.max(1, dmg);
        monsterHp -= dmg;
        monsterHp = Math.max(0, monsterHp);
        postMessage({ type: 'debug', message: `몬스터가 ${dmg} 피해를 받았습니다.` });
        debugLog(`Player normal damage applied: ${dmg}, monster HP now ${monsterHp}`);
      }
    }

    debugLog(`Monster HP after attacks: ${monsterHp}`);
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
      debugLog("Monster defeated, granting rewards");
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
      debugLog("Player died, stopping combat");
      clearInterval(interval);
      postMessage({
        type: 'playerDead',
        userData
      });
    }
  }, 1000);
}

