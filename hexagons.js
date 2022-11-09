import {Map2D, Set2D, mod} from './utils.js';
export {
  Set2D, Map2D
}

// inspired by https://www.redblobgames.com/grids/hexagons/
// This uses an even-r grid, even rows are pushed by half a column
export class HexagonGrid {
  constructor (radius=0.5) {
    this.setRadius(radius);
    this._offset = [0,0];
  }
  setRadius(radius) {
    this._radius = radius;
  }
  getRadius(radius) {
    return this._radius;
  }
  setOffset([x,y]) {
    this._offset[0] = x;
    this._offset[1] = y;
  }
  fromPoint(coordinate) {
    return HexagonGrid.fromPoint(coordinate, this._radius, this._offset);
  }
  getHexesFromBoundingBox(set2D, upperBoundY, upperBoundX, lowerBoundY, lowerBoundX, testFn) {
    set2D.clear();
    const cellRadius = this.getRadius();
    const cw = 0.5 * Math.sqrt(3) * cellRadius;
    const ch = 0.5 * cellRadius;
    lowerBoundX=Math.floor((lowerBoundX - this._offset[0])/(2*cw));
    upperBoundX=Math.ceil((upperBoundX - this._offset[0])/(2*cw));
    lowerBoundY=Math.floor((lowerBoundY - this._offset[1])/(3*ch));
    upperBoundY=Math.ceil((upperBoundY - this._offset[1])/(3*ch));
    for (let i=lowerBoundX;i<upperBoundX;i++) {
      for (let j=lowerBoundY;j<upperBoundY;j++) {
        const hex = [i,j];
        if (testFn?testFn(hex):true) set2D.add(hex);
      }
    }
    return set2D;
  }
  getHexesInHexagon(set2D, radius=1,offset=[0,0]) {
    this.getHexesFromBoundingBox(set2D,
    radius+offset[1],
    radius+offset[0],
    -radius+offset[1],
    -radius+offset[0],
    hex => {
      const testPoint = this.getCenter(hex);
      const [x,y] = HexagonGrid.fromPoint(testPoint, radius, offset);
      return x==0&&y==0;
    });
    return set2D;
  }
  getHexesInCircle(set2D, radius=1,offset=[0,0]) {
    this.getHexesFromBoundingBox(set2D,
    radius+offset[1],
    radius+offset[0],
    -radius+offset[1],
    -radius+offset[0],
    hex => {
      const p1 = offset;
      const p2 = this.getCenter(hex);
      return (p1[0] - p2[0])**2 + (p1[1] - p2[1])**2<radius**2;
    });
    return set2D;
  }
  static fromPoint([xIn,yIn], radius=1, offset=[0,0]) {
    const x = xIn - offset[0];
    const y = yIn - offset[1];
    const cw = 0.5 * Math.sqrt(3) * radius;
    const ch = 0.5 * radius;
    const xCell = Math.floor(x/cw);
    const yCell = Math.floor(y/ch);
    
    let hexY = Math.round(yCell/3);
    let hexX = Math.round((xCell + mod(hexY,2))/2);

    if (mod(yCell, 3) === 1) {
      const yPos = (y - yCell * ch)/ch;
      let xPos = (x - xCell * cw)/cw;
      if (mod(xCell,2) === mod(hexY,2)) xPos = 1-xPos;
      if (xPos < yPos) {
        if (!mod(xCell,2)) {
          hexX += (mod(hexY,2) ? -1 : 1);
        }
        hexY++;
      }
    }
    
    return [hexX, hexY];
  }
  getCenter(rowOrCube) {
    return HexagonGrid.getCenter(rowOrCube, this._radius, this._offset);
  }
  static getCenter(rowOrCube, radius=1, offset=[0,0]) {
    const [x,y] = HexagonGrid.parseInputToRow(rowOrCube);
    const cw = 0.5 * Math.sqrt(3) * radius;
    const ch = 0.5 * radius;
    return [
      x * cw * 2 + offset[0] - mod(y,2)*cw,
      y * ch * 3 + offset[1]
    ]
  }
  realDistance(rowOrCubeTo, rowOrCubeFrom) {
    return HexagonGrid.realDistance(rowOrCubeTo, rowOrCubeFrom, this._radius);
  }
  static realDistance(rowOrCubeTo, rowOrCubeFrom, radius=1) {
    return Math.sqrt(HexagonGrid.realDistance2(rowOrCubeTo, rowOrCubeFrom, radius));
  }
  static realDistance2(rowOrCubeTo, rowOrCubeFrom, radius=1) {
    const from = HexagonGrid.parseInputToRow(rowOrCubeFrom);
    const to = HexagonGrid.parseInputToRow(rowOrCubeTo);
    const p1 = HexagonGrid.getCenter(from, radius);
    const p2 = HexagonGrid.getCenter(to, radius);
    return (p1[0] - p2[0])**2 + (p1[1] - p2[1])**2;
  }
  static parseInputToRow(rowOrCube) {
    if (rowOrCube.length === 2) return rowOrCube;
    if (rowOrCube.length === 3) return HexagonGrid.cubeToRow(rowOrCube);
    throw Error(`Could not determine whether input ${rowOrCube} was row or Cube`);
  }
  static parseInputToCube(rowOrCube) {
    if (rowOrCube.length === 3) return rowOrCube;
    if (rowOrCube.length === 2) return HexagonGrid.rowToCube(rowOrCube);
    throw Error(`Could not determine whether input ${rowOrCube} was row or Cube`);
  }
  path(map2D, rowOrCubeFrom, rowOrCubeTo, forbidden, maxDistance=Infinity) {
    // https://en.wikipedia.org/wiki/Dijkstra%27s_algorithm#Algorithm
    map2D.clear();
    
    const from = HexagonGrid.parseInputToRow(rowOrCubeFrom);
    const to = HexagonGrid.parseInputToRow(rowOrCubeTo);
    
    const searchSpace = new Set2D();
    const distances = new Map2D();
    const nextList = [from];
    
    distances.set(from, 0);
    
    let i=0;
    while (nextList.length) {
      const next = nextList.shift();
      if (searchSpace.has(next)) continue;
      if (i++>40000) break; // Stop if the search has been going on way too long
      const currentDistance = distances.get(next);

      // Found the end so iterate back along the path to find the beginning
      if (next[0]===to[0] && next[1]===to[1]) {
        map2D.set(next, Math.floor(currentDistance));
        let current = next;
        for (let i=1;i<Math.floor(currentDistance);i++) {
          const adjacent = HexagonGrid.adjacent(current);
          current = adjacent.sort((a,b) => {
            const aDistance = distances.get(a) || Infinity;
            const bDistance = distances.get(b) || Infinity;
            return aDistance - bDistance;
          }).shift();
          map2D.set(current, Math.floor(distances.get(current)));
        }
        map2D.set(from, 0);
        return map2D;
      }
      
      // otherwise carry on the search radiating outwards from the start point
      searchSpace.add(next);
      const adjacent = HexagonGrid.adjacent(next)
      .filter(adjacentHex => !(
        (forbidden && forbidden.has(adjacentHex)) ||
        searchSpace.has(adjacentHex)
      ))
      .sort((hexA, hexB) => {
        const hexADist = HexagonGrid.realDistance2(hexA, to) + HexagonGrid.realDistance2(hexA, from);
        const hexBDist = HexagonGrid.realDistance2(hexB, to) + HexagonGrid.realDistance2(hexB, from);
        return hexADist - hexBDist;
      });
      let adjacentIndex=0;
      for (const a of adjacent) {
        const oldDistance = distances.get(a) || Infinity;
        const newDistance = Math.min(oldDistance, currentDistance + 1 + Math.random()*adjacentIndex*1e-4);
        distances.set(a, newDistance);
        if (newDistance<maxDistance) nextList.push(...adjacent);
        adjacentIndex++;
      }
    }
    return map2D;
  }
  static distance(rowOrCubeFrom, rowOrCubeTo) {
    const from = HexagonGrid.parseInputToCube(rowOrCubeFrom);
    const to = HexagonGrid.parseInputToCube(rowOrCubeTo);
    return (Math.abs(from[0] - to[0]) +
      Math.abs(from[1] - to[1]) +
      Math.abs(from[2] - to[2]))*0.5;
  }
  static line(rowOrCubeFrom, rowOrCubeTo) {
    const l = HexagonGrid.distance(rowOrCubeFrom, rowOrCubeTo);
    let [x1,y1] = HexagonGrid.getCenter(rowOrCubeFrom);
    let [x2,y2] = HexagonGrid.getCenter(rowOrCubeTo);
    x1+=1e-6;
    y1+=-1e-6;
    x2+=1e-6;
    y2+=-1e-6;
    const out = [];
    for (let i=0;i<=l;i++) {
      const pos = [
        x1 + x2*i/l,
        y1 + y2*i/l,
      ]
      out.push(HexagonGrid.fromPoint(pos));
    }
    return out;
  }
  static adjacent(rowOrCube) {
    if (rowOrCube.length === 2) {
      const [x,y] = rowOrCube;
      return [
        [x-1,y],
        [x+mod(y+1,2)-1,y-1],
        [x+mod(y+1,2)  ,y-1],
        [x+1,y],
        [x+mod(y+1,2),y+1],
        [x+mod(y+1,2)-1,y+1]
      ]
    }
    if (rowOrCube.length === 3) {
      const [x,y,z] = rowOrCube;
      return [
        [x-1,y+1,z],
        [x,y+1,z-1],
        [x+1,y,z-1]
        [x+1,y-1,z],
        [x,y-1,z+1],
        [x-1,y,z+1],
      ]
    }
    throw Error(`Could not determine whether input ${rowOrCube} was row or Cube`);
  }
  static cubeToRow(cube){
    const col = cube[0] + (cube[2] + mod(cube[2],2)) / 2;
    const row = cube[2];
    return [col, row];
  }
  static rowToCube(hex) {
    const x = hex[0] - (hex[1] + mod(hex[1], 2)) / 2;
    const z = hex[1];
    const y = -x-z;
    return [x,y,z];
  }
}