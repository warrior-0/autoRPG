export default class User {
  #uid; #nickname; #gold; #exp; #level; #hp; #maxHp; #statsPoints;
  constructor({ uid, nickname, gold, exp, level, hp, maxHp, statsPoints }) {
    this.#uid         = uid;
    this.#nickname    = nickname;
    this.#gold        = gold;
    this.#exp         = exp;
    this.#level       = level;
    this.#hp          = hp;
    this.#maxHp       = maxHp;
    this.#statsPoints = statsPoints;
  }
  get uid()          { return this.#uid; }
  get nickname()     { return this.#nickname; }
  get gold()         { return this.#gold; }
  get exp()          { return this.#exp; }
  get level()        { return this.#level; }
  get hp()           { return this.#hp; }
  get maxHp()        { return this.#maxHp; }
  get statsPoints()  { return this.#statsPoints; }
}