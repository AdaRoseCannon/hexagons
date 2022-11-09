import { HexagonGrid, Set2D, Map2D } from "./hexagons.js";
import {
  Matrix4,
  Quaternion,
  Vector3,
  Color,
  Scene,
  InstancedMesh,
  DynamicDrawUsage,
  InstancedBufferGeometry,
  InstancedBufferAttribute,
  Float32BufferAttribute,
  MeshPhongMaterial,
  MeshBasicMaterial,
  MeshDepthMaterial,
  Group,
  MathUtils,
  PlaneGeometry,
  Mesh
} from "https://cdn.skypack.dev/three@0.134.0";
import { GLTFLoader } from "https://cdn.skypack.dev/three@0.134.0/examples/jsm/loaders/GLTFLoader.js";
import { GLTFExporter } from "https://cdn.skypack.dev/three@0.134.0/examples/jsm/exporters/GLTFExporter.js";
import { createMeshesFromInstancedMesh } from "https://cdn.skypack.dev/three@0.134.0/examples/jsm/utils/SceneUtils.js";
import { mergeBufferGeometries } from "https://cdn.skypack.dev/three@0.134.0/examples/jsm/utils/BufferGeometryUtils.js";
import {
  controls,
  scene,
  renderCallbacks,
  addDecoration,
  renderer,
  camera
} from "./environment.js";
import { rotateLeft6 } from "./utils.js";
import Perlin from "./perlin.js";
import { DragControls } from 'https://cdn.skypack.dev/three@0.134.0/examples/jsm/controls/DragControls.js';

const gridSize = 1.3;
const hexes = (function () {
  const cellSize = gridSize / 25;
  return new HexagonGrid(cellSize / 2);
}());
let hexMesh;

const loadGLTF = (function() {
  const loader = new GLTFLoader();
  return url =>
    new Promise(function(resolve, reject) {
      loader.load(url, resolve, null, reject);
    }).then(model => model.scene);
})();

const tempMatrix = new Matrix4();
const tempQuaternion = new Quaternion();
const tempPosition = new Vector3();
const tempScale = new Vector3();
const tempColor = new Color();
const loader = new GLTFLoader();
const yAxis = new Vector3(0, 1, 0);

function round(number, to) {
  return number-(number%to);
}

const visibleHexes = new Set2D();
const dragGroup = new Group();
scene.add(dragGroup);
const dragControls = new DragControls([dragGroup], camera, renderer.domElement);
dragControls.transformGroup = true;
let intervalID;
function onDrag() {
  const hexRadius = hexes.getRadius();
  updateGrid(0, gridSize, [round(-dragGroup.position.x, hexRadius*2), round(-dragGroup.position.z, hexRadius*2)]);
}
dragControls.addEventListener( 'dragstart', function ( event ) {
  controls.enabled = false;
  intervalID = setInterval(onDrag, 60);
});
dragControls.addEventListener ( 'drag', function( event ){
  const zoom = dragGroup.position.y;
  dragGroup.position.y = 0;
  const oldRadius = hexes.getRadius();
  hexes.setRadius(MathUtils.clamp(
    oldRadius*(1+0.2*zoom*oldRadius),
    0.5*gridSize/60, // most zoomed out
    0.5*gridSize/8 // most zoomed in
  ));
});
dragControls.addEventListener( 'dragend', function ( event ) {
  clearInterval(intervalID);
  controls.enabled = true;
  onDrag();
});

function exportGLB(objects, instances) {
  const exporter = new GLTFExporter();
  const outScene = new Scene();
  for (const m of objects) {
    outScene.add(m);
  }
  const materials = {};
  for (const i of instances) {
    const group = createMeshesFromInstancedMesh(i);
    let index = 0;
    for (const mesh of group.children) {
      mesh.getColorAt(index++, tempColor);
      const color = tempColor.getHex();
      mesh.material = materials[color] =
        materials[color] || mesh.material.clone();
      materials[color].color.setHex(color);
    }
    outScene.add(group);
  }
  exporter.parse(
    outScene,
    function(gltf) {
      const blob = new Blob([gltf], { type: "model/gltf-binary" });
      const a = document.createElement("a");
      a.href = window.URL.createObjectURL(blob);
      a.setAttribute("download", "hexes.glb");
      a.click();
    },
    {
      binary: true
    }
  );
}

const gridInfo = new Map2D();
const hillPerlin = new Perlin(3);
const islandPerlin = new Perlin(2);
const cityPerlin = new Perlin(5);
const hillScale = Math.PI*0.03;

function islandHeightForHex([x,y]) {
  const islandScale = hillScale*0.01;
  const islandHeightScale = Math.round(50/(1+Math.sqrt(x**2+y**2)*0.0015));
  const islandHeight = Math.floor((islandPerlin.get(x*islandScale,y*islandScale)+1)*islandHeightScale/2); // large scale geometry
  return islandHeight;
}

function heightForHex([x,y]) {
  const localHeightScale = 4;
  const localHeight = Math.floor((hillPerlin.get(x*hillScale,y*hillScale)+1)*localHeightScale/2); // small local hills
  return localHeight+islandHeightForHex([x,y]);
}
function getGridInfo(hex) {
  if (!gridInfo.has(hex)) {
    if (cityPerlin.get(...hex.map(a=>0.1*a))>0.3) {
      const [i, j, k] = HexagonGrid.rowToCube(hex);
      gridInfo.set(hex, [
        Math.tan(Math.cos(Math.sin(i * j * k))) > 1 ? 1 : 2,
        heightForHex(hex),
        islandHeightForHex(hex)
      ]);
    } else {
      gridInfo.set(hex, [
        2,
        heightForHex(hex),
        islandHeightForHex(hex)
      ]);
    }
  }
  return gridInfo.get(hex);
}

function updateMesh(oldMesh, count) {
  dragGroup.remove(oldMesh);
  const newMesh = new InstancedMesh(oldMesh.geometry, oldMesh.material, count);
  newMesh.geometry.setAttribute("visiblevertices", new InstancedBufferAttribute(new Float32Array(2*count), 2));
  newMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  newMesh.castShadow = oldMesh.castShadow;
  newMesh.receiveShadow = oldMesh.receiveShadow;
  newMesh.customDepthMaterial = oldMesh.customDepthMaterial;
  newMesh.visible = oldMesh.visible;
  dragGroup.add(newMesh);
  return newMesh;
}

function setTempColorByHexData(data) {
  const height = data[1];
  const islandHeight = data[2];
  if (islandHeight < 7 || height < 8) return tempColor.set(`blue`);
  if (islandHeight < 8) return tempColor.set(`yellow`);
  tempColor.set(`rgb(${height*5.0},${height*5.0},${height*5.0})`);
}

function updateGrid(shape = 0, size = 10, outerOffset = [0, 0]) {
  const hexRadius = hexes.getRadius();
  const tableTopPos = (1.06 * gridSize) / 2;

  switch (shape) {
    case 0:
      hexes.getHexesInHexagon(visibleHexes, size / 2, outerOffset);
      break;
    case 1:
      hexes.getHexesInCircle(visibleHexes, size / 2, outerOffset);
      break;
    case 2:
      hexes.getHexesFromBoundingBox(
        visibleHexes,
        size + outerOffset[1],
        size + outerOffset[0],
        -size + outerOffset[1],
        -size + outerOffset[0]
      );
      break;
  }

  // Check if the instanced meshes need more instances
  let buildingCount = 0;
  let grassCount = 0;
  let islandHeight = 0;
  for (const hex of visibleHexes) {
    const info = getGridInfo(hex);
    if (info[0] === 1) buildingCount += 1;
    if (true || info[0] === 2) grassCount += 1;
    islandHeight = Math.max(islandHeight, info[2]);
  }
  islandHeight--;
  if (buildingCount > buildingMesh.instanceMatrix.count) buildingMesh = updateMesh(buildingMesh, buildingCount);
  if (grassCount > grassMesh.instanceMatrix.count) grassMesh = updateMesh(grassMesh, grassCount);
  
  // Position eaach instance in the meshes
  let buildingIndex = 0;
  let grassIndex = 0;
  const centerHex = [0,0];
  for (const hex of visibleHexes) {
    const info = gridInfo.get(hex);
    tempColor.set(0xffffff);

    // this hex is a building
    if (info[0] === 1) {
      if (info[3] === undefined) {
        const neighbours = HexagonGrid.adjacent(hex);
        const signature = `0b${neighbours
          .map(hex => getGridInfo(hex)[0] === 1 ? 1 : 0 )
          .join("")}`;
        info[3] = Number(signature);
        info[4] = 0;
      }

      for (let i = 0; i < 6; i++) {
        if (buildingGeomInfo.has(info[3])) {
          const [vertexStart, vertexEnd] = buildingGeomInfo.get(info[3]);
          buildingMesh.geometry.attributes.visiblevertices.array[buildingIndex*2] = vertexStart;
          buildingMesh.geometry.attributes.visiblevertices.array[buildingIndex*2 + 1] = vertexEnd;
          buildingMesh.geometry.attributes.visiblevertices.needsUpdate = true;
          break;
        }
        info[4] -= Math.PI/3;
        info[3] = rotateLeft6(info[3]);
      }
      
      setInstancedMesh(buildingMesh, buildingIndex, hex, info[4], tableTopPos + hexRadius*(info[1]-islandHeight), 1);
      buildingIndex++;
    }
    
    // this hex is grass
    if (true || info[0] === 2) {
      setTempColorByHexData(info);

      if (info[3] === undefined) {
        const neighbours = HexagonGrid.adjacent(hex);
        const signature = `0b${neighbours
          .map(nHex => getGridInfo(nHex)[1] >= info[1] ? 1 : 0)
          .join("")}`;
        info[3] = Number(signature);
        info[4] = 0;
      }

      for (let i = 0; i < 6; i++) {
        if (grassGeomInfo.has(info[3])) {
          const [vertexStart, vertexEnd] = grassGeomInfo.get(info[3]);
          grassMesh.geometry.attributes.visiblevertices.array[grassIndex*2] = vertexStart;
          grassMesh.geometry.attributes.visiblevertices.array[grassIndex*2 + 1] = vertexEnd;
          grassMesh.geometry.attributes.visiblevertices.needsUpdate = true;
          break;
        }
        info[4] -= Math.PI / 3;
        info[3] = rotateLeft6(info[3]);
      }
      
      setInstancedMesh(grassMesh, grassIndex, hex, info[4], tableTopPos + hexRadius + hexRadius*(info[1]-islandHeight), info[1]-(islandHeight-1));
      grassIndex++;
    }
  }
}

function setInstancedMesh(mesh, index, hex, rotation, height, scaleY=1) {
  const hexRadius = hexes.getRadius();
  const [x, y] = hexes.getCenter(hex);
  tempQuaternion.identity();
  tempQuaternion.setFromAxisAngle(yAxis, rotation);
  tempPosition.set(x, height, y);
  tempScale.set(hexRadius*1.0, hexRadius*scaleY, hexRadius*1.0);

  tempMatrix.compose( tempPosition, tempQuaternion, tempScale );

  mesh.count = index;
  mesh.setMatrixAt(index, tempMatrix);
  mesh.setColorAt(index, tempColor);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
}

function onBeforeCompile( shader ) {
    console.log(this, shader)
    shader.vertexShader = `attribute vec2 visiblevertices;
attribute float myVertexIndex;
${shader.vertexShader}`
.replace('#include <project_vertex>',`
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition * float(myVertexIndex >= visiblevertices[0] && myVertexIndex <= visiblevertices[1]);
gl_Position = projectionMatrix * mvPosition;
    `);
};  

const customDepthMaterial = new MeshDepthMaterial();
customDepthMaterial.onBeforeCompile = onBeforeCompile;

async function loadInterchangableHex(url, prefix) {
  const gltf = await loadGLTF(url);

  const meshes = new Map();
  meshes.set(0b000000, gltf.getObjectByName(prefix + "00"));
  meshes.set(0b100000, gltf.getObjectByName(prefix + "10"));
  meshes.set(0b110000, gltf.getObjectByName(prefix + "20"));
  meshes.set(0b101000, gltf.getObjectByName(prefix + "21"));
  meshes.set(0b100100, gltf.getObjectByName(prefix + "22"));
  meshes.set(0b110001, gltf.getObjectByName(prefix + "30"));
  meshes.set(0b110100, gltf.getObjectByName(prefix + "31"));
  meshes.set(0b110010, gltf.getObjectByName(prefix + "32"));
  meshes.set(0b010101, gltf.getObjectByName(prefix + "33"));
  meshes.set(0b011110, gltf.getObjectByName(prefix + "40"));
  meshes.set(0b110101, gltf.getObjectByName(prefix + "41"));
  meshes.set(0b110110, gltf.getObjectByName(prefix + "42"));
  meshes.set(0b111110, gltf.getObjectByName(prefix + "50"));
  meshes.set(0b111111, gltf.getObjectByName(prefix + "60"));
  
  let sum=0;
  const mergedGeom = mergeBufferGeometries(Array.from(meshes.values()).map(m=>m.geometry));
  const instancedGeom = new InstancedBufferGeometry().copy(mergedGeom);
  mergedGeom.dispose();
  const material = true && meshes.get(0b000000).material;
  for (const [key,mesh] of meshes.entries()) {
    const size = mesh.geometry.attributes.position.count;
    meshes.set(key, [sum, sum+size]);
    sum+=size;
    mesh.geometry.dispose();
  }
  
  material.depthWrite = true;
  material.onBeforeCompile = onBeforeCompile

  const instancedMesh = new InstancedMesh(instancedGeom, material, 32);
  instancedMesh.geometry.setAttribute("visiblevertices", new InstancedBufferAttribute(new Float32Array(2*32), 2));
  instancedMesh.geometry.setAttribute("myVertexIndex", new Float32BufferAttribute(new Float32Array(sum),1));
  for (let i=0;i<sum;i++) instancedMesh.geometry.attributes.myVertexIndex.array[i] = i;
  instancedMesh.geometry.attributes.myVertexIndex.needsUpdate = true;
  instancedMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  instancedMesh.castShadow = true;
  instancedMesh.receiveShadow = true;
  // instancedMesh.customDepthMaterial = customDepthMaterial;
  
  return [instancedMesh, meshes, gltf.getObjectByName(prefix + "00")];
}

async function loadHex() {
  const gltf = await loadGLTF(
    "https://cdn.glitch.me/2c81f270-d553-46c7-a777-7a487fed9eab%2Fhex-shadow.glb?v=1634932839879"
  );

  const hexMeshFromGLB = gltf.children[0];
  const shadow = gltf.children[1];
  shadow.position.y += 0.01;
  shadow.scale.multiplyScalar(1.05);
  hexMeshFromGLB.matrix.compose(
    hexMeshFromGLB.position,
    hexMeshFromGLB.quaternion,
    hexMeshFromGLB.scale
  );
  hexMeshFromGLB.geometry.applyMatrix4(hexMeshFromGLB.matrix);
  shadow.matrix.compose(
    shadow.position,
    shadow.quaternion,
    shadow.scale
  );
  shadow.geometry.applyMatrix4(shadow.matrix);
  shadow.position.set(0, 0, 0);
  shadow.scale.set(1, 1, 1);
  hexMeshFromGLB.position.set(0, 0, 0);
  hexMeshFromGLB.scale.set(
    (1.0 * 1.06 * gridSize) / 2,
    (1.0 * 1.06 * gridSize) / 2,
    (1.0 * 1.06 * gridSize) / 2
  );
  hexMeshFromGLB.material.color.set(0xffffff);
  hexMeshFromGLB.castShadow = true;
  hexMeshFromGLB.receiveShadow = true;
  hexMeshFromGLB.layers.enable(2);
  scene.add(hexMeshFromGLB);

  addDecoration(hexMeshFromGLB, shadow);
  hexMesh = hexMeshFromGLB;
};

let buildingMesh, buildingGeomInfo, grassMesh, grassGeomInfo;
(async function () {
  let sampleMesh;
  [buildingMesh, buildingGeomInfo] = await loadInterchangableHex(
    'https://cdn.glitch.me/2c81f270-d553-46c7-a777-7a487fed9eab%2Fbuildings.glb?v=1636914857544',
    'b');
  [grassMesh, grassGeomInfo, sampleMesh] = await loadInterchangableHex(
    'https://cdn.glitch.me/2c81f270-d553-46c7-a777-7a487fed9eab%2Fgrasses.glb?v=1636666825305',
    'c');
  
  buildingMesh.receiveShadow = false;
  window.mat = grassMesh.material;
  
  sampleMesh.position.x = 0;
  sampleMesh.position.y = 1;
  sampleMesh.position.z = -2;
  dragGroup.add(buildingMesh);
  dragGroup.add(grassMesh);
  await loadHex();
  updateGrid(0, gridSize);
}());

// Draw the map
(function () {
  const w=100;
  const h=100;
  const mapGeom = new PlaneGeometry(1,1, w-1,h-1);
  const colArray = new Float32Array(3*w*h);
  const posArray = mapGeom.getAttribute('position').array;
  const coord=[];
  for (let i=0;i<w;i++) {
    for (let j=0;j<h;j++) {
      const index = (j*w + i) * 3;
      coord[0]=(i-w/2)*50;
      coord[1]=(j-h/2)*50;
      const data = getGridInfo(coord);
      const height = data[1];
      if (data[0] === 1) {
        tempColor.set('white');
      } else {
        setTempColorByHexData(data);
        if (data[2] > 8) {
          tempColor.r *= 0.5;
          tempColor.b *= 0.5;
        } else {
          tempColor.r *= data[2]/8;
          tempColor.g *= data[2]/8;
          tempColor.b *= data[2]/8;
        }
      }
      colArray[index+0] = tempColor.r;
      colArray[index+1] = tempColor.g;
      colArray[index+2] = tempColor.b;
      posArray[index+2] = height/w;
    }
  }
  mapGeom.addAttribute('color', new Float32BufferAttribute(colArray, 3, true));
  const mapMesh = new Mesh(mapGeom, new MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    reflectivity: 0.5,
    toneMapped: false
  }));
  mapMesh.position.set(-1,1,-1.5);
  mapMesh.rotation.set(-0.3*Math.PI, 0,0);
  scene.add(mapMesh);
}())