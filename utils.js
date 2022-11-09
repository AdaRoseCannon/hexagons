export function mod(n, m) {
  return ((n % m) + m) % m;
}
export function rotateLeft6(n,d) {
    return ((n << 1) | (n >> 5)) & (0b111111);
}
export function rotateRight6(n,d) {
    return ((n >> 1) | (n << 5)) & (0b111111);
}
export class Map2D {
  constructor () {
    this._space = {};
  }
  set(arr, value) {
    const [x,y] = arr;
    if (this._space[x] === undefined) {
      this._space[x] = new Map();
    }
    this._space[x].set(y, value);
    return arr;
  }
  delete(arr) {
    const [x,y] = arr;
    const has = this.has(arr);
    if (has) {
      this._space[x].delete(y);
    }
    return has;
  }
  has(arr) {
    const [x,y] = arr;
    return !!(this._space[x]?.has(y));
  }
  clear() {
    for (const map of Object.values(this._space)) {
      map.clear();
    }
  }
  get size() {
    let i=0;
    for (const map of Object.values(this._space)) {
      i+=map.size;
    }
    return i;
  }
  get(arr) {
    const [x,y] = arr;
    if (this.has(arr)) return this._space[x].get(y);
    return undefined;
  }
  *[Symbol.iterator]() {
    for (const map of Object.entries(this._space)) {
      for (const entry of map[1].entries()) {
        yield [[parseInt(map[0]), entry[0]], entry[1]];
      }
    }
  }
}

export class Set2D {
  constructor () {
    this._space = {};
  }
  add(arr) {
    const [x,y] = arr;
    if (this._space[x] === undefined) {
      this._space[x] = new Set();
    }
    this._space[x].add(y);
    return arr;
  }
  delete(arr) {
    const [x,y] = arr;
    const has = this.has(arr);
    if (has) {
      this._space[x].delete(y);
    }
    return has;
  }
  clear() {
    for (const set of Object.values(this._space)) {
      set.clear();
    }
  }
  get size() {
    let i=0;
    for (const set of Object.values(this._space)) {
      i+=set.size;
    }
    return i;
  }
  has(arr) {
    const [x,y] = arr;
    return !!(this._space[x]?.has(y));
  }
  *[Symbol.iterator]() {
    for (const set of Object.entries(this._space)) {
      for (const entry of set[1]) {
        yield [parseInt(set[0]), entry];
      }
    }
  }
}