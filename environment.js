import { Perlin } from './perlin.js';
import {HexagonGrid, Set2D} from './hexagons.js';

import {
  Scene,
  WebGLRenderer,
  PerspectiveCamera,
  DirectionalLight,
  Mesh,
  MeshPhongMaterial,
  TextureLoader,
  PlaneGeometry,
  SphereGeometry,
  RepeatWrapping,
  VSMShadowMap,
  MathUtils,
  ACESFilmicToneMapping,
  PMREMGenerator,
  WebGLCubeRenderTarget,
  CubeCamera,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  Color,
  MeshBasicMaterial,
  sRGBEncoding,
  SpotLight} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { LightProbeGenerator } from 'three/examples/jsm/lights/LightProbeGenerator.js';
  
const tempMatrix = new Matrix4();
const tempQuaternion = new Quaternion();
const tempPosition = new Vector3();
const tempScale = new Vector3();
const tempColor = new Color();
const gridOrigin = [0,0];
const outerRadius = 15;

export const renderer = new WebGLRenderer({
  antialias: true
});
renderer.toneMapping = ACESFilmicToneMapping;
renderer.physicallyCorrectLights = true;
renderer.logarithmicDepthBuffer = true;
renderer.outputEncoding = sRGBEncoding;
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = VSMShadowMap;
window.renderer = renderer;
document.body.appendChild( renderer.domElement );

export const scene = new Scene();
export const camera = new PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 0.01, 1500 );
export const controls = new OrbitControls( camera, renderer.domElement );
controls.target = new Vector3(0,0.6,0);

function onWindowResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize( window.innerWidth, window.innerHeight );
}
window.addEventListener('resize', onWindowResize);

//controls.update() must be called after any manual changes to the camera's transform
camera.position.set( 0, 1.2, 2 );
controls.update();

const dirLight = new DirectionalLight();
dirLight.castShadow = true;
dirLight.position.set(8,11,-8);
dirLight.shadow.bias = -1e-4;
dirLight.shadow.normalBias = -1e-4;
dirLight.shadow.mapSize.width = 1024;
dirLight.shadow.mapSize.height = 1024;
dirLight.shadow.camera.near = 1;
dirLight.shadow.camera.far = 50;
dirLight.shadow.autoUpdate = false;
dirLight.shadow.camera.left = dirLight.shadow.camera.bottom = -outerRadius*0.75;
dirLight.shadow.camera.top = dirLight.shadow.camera.right = outerRadius*0.75;
window.dirLight = dirLight;
scene.add(dirLight);

const spotLight = new SpotLight( 0xffffff, 20, 0, 0.3, 0.1 );
spotLight.position.set( 2, 3, 0 );
spotLight.lookAt(scene.position);
spotLight.castShadow = true;
spotLight.shadow.mapSize.width = 128;
spotLight.shadow.mapSize.height = 128;
spotLight.shadow.camera.near = 0.5;
spotLight.shadow.camera.far = 40;
spotLight.shadow.bias = -1e-4;
spotLight.shadow.normalBias = -1e-4;
spotLight.shadow.camera.fov = 180*0.3/Math.PI;
scene.add( spotLight );

const pmremGenerator = new PMREMGenerator(renderer);
pmremGenerator.compileCubemapShader();
const cubeRenderTarget = new WebGLCubeRenderTarget(256, { generateMipmaps: true});
const cubeCamera = new CubeCamera(0.1, 1500, cubeRenderTarget);
let lightProbe;

const sky = new Sky();
sky.scale.set(1000,1000,1000);
scene.add( sky );

const sun = new Mesh(new SphereGeometry(50), new MeshBasicMaterial({
  toneMapped: false
}));
scene.add(sun);

function updateSky(options) {
  scene.add(sky);

  const phi = MathUtils.degToRad( 90 - Math.min(options.elevation,175) );
  const theta = MathUtils.degToRad( options.azimuth );

  dirLight.position.setFromSphericalCoords( 20, phi, theta );
  sun.position.setFromSphericalCoords( 1000, phi, theta );
  renderer.toneMappingExposure = options.exposure;

  const uniforms = sky.material.uniforms;
  uniforms.turbidity.value = options.turbidity;
  uniforms.rayleigh.value = options.rayleigh;
  uniforms.mieCoefficient.value = options.mieCoefficient;
  uniforms.mieDirectionalG.value = options.mieDirectionalG;
  uniforms.sunPosition.value.copy( dirLight.position );
}

export const renderCallbacks = [];
function animate(t) {
  for (const fn of renderCallbacks) fn(t);
  controls.update();
  renderer.render( scene, camera );
}
renderer.setAnimationLoop(animate);

function sigmoid01(inVal) {
  const x = (inVal-0.5)*8;
  const eX = 2.718**x;
  return eX/(eX+1);
}

const skyOrange = new Color('#ffb23f');
const skyMidday = new Color('#ffffff');
function updateByTime(time) {
  const d=new Date();
  time=time === undefined ? d.getHours()+d.getMinutes()/60 : time;
  const proportionThroughDay = sigmoid01(MathUtils.clamp(MathUtils.inverseLerp(5,22,time),1/180,180/180));
  const elevation = 182*proportionThroughDay-1;

  const sunUpness = Math.sqrt(1-Math.pow(proportionThroughDay*2-1,2));

  dirLight.color.lerpColors(skyOrange,skyMidday,sunUpness);
  sun.material.color.copy(dirLight.color);
  updateSky({
    turbidity: 10,
    rayleigh: 3,// Math.max(Math.min(10, 0.1/Math.sin(Math.PI*elevation/180)),0.01),
    mieCoefficient: 0.005,
    mieDirectionalG: 0.7,
    elevation,
    azimuth: 245,
    exposure: 0.2
  });

  dirLight.intensity = 2 + 8 * sunUpness;
  dirLight.shadow.needsUpdate = true;

  renderEnv();
  lightProbe.intensity = 2 + 5 * sunUpness;
}
updateByTime(18);

function renderEnv() {
  scene.environment = undefined;
  if (lightProbe) lightProbe.removeFromParent();
  cubeCamera.position.set(0, 0.5, 0);
  cubeCamera.update(renderer, scene);

  lightProbe = LightProbeGenerator.fromCubeRenderTarget(renderer, cubeRenderTarget);
  scene.add(lightProbe);

  // Can't use the same for background and environment because
  // background is tonemapped so it gets tonemapped twice!!
  // scene.background = cubeRenderTarget.texture;
  scene.environment = pmremGenerator.fromCubemap(
    cubeRenderTarget.texture
  ).texture;
  
}

export function addDecoration(hex, shadow) {
  const perlin = new Perlin(4);
  const hexRadius = 0.7;
  const hexes = new HexagonGrid(hexRadius);
  const set2D = new Set2D();
  const perlinScale=1.5;
  
  hexes.getHexesFromBoundingBox(set2D,
    outerRadius,
    outerRadius,
    -outerRadius,
    -outerRadius,
    hex => {
      const testPoint = hexes.getCenter(hex);
      const d = HexagonGrid.realDistance(gridOrigin, testPoint);
      const cutOff = Math.max(0.5-0.5*d/outerRadius, 0.1);
      const [x,y] = HexagonGrid.fromPoint(testPoint, outerRadius);
      const perlinXY = perlin.get(perlinScale*testPoint[0], perlinScale*testPoint[1]);
      // console.log(perlinXY);
      return x===0 &&
        y===0 && 
        perlinXY>=cutOff;
    }
  );
  
  const hexMeshMat = hex.material.clone();
  hexMeshMat.color.set(0xffffff);
  hexMeshMat.roughness = 0.4;
  hexMeshMat.metalness = 0.2;
  const hexMesh = new InstancedMesh( hex.geometry, hexMeshMat, set2D.size );
  hexMesh.castShadow = true;
  hexMesh.receiveShadow = true;
  scene.add( hexMesh );

  const shadowMesh = new InstancedMesh( shadow.geometry, shadow.material, set2D.size );
  scene.add( shadowMesh );

  let index = 0;
  for (const hex of set2D) {
    const center = hexes.getCenter(hex);
    const [x,z] = center;
    const dist = HexagonGrid.realDistance(gridOrigin, center);
    const height = 8*perlin.get(perlinScale*x, perlinScale*z)*(dist/outerRadius)**2;

    // Set color
    tempColor.set(`hsl(120, 50%, ${Math.round(100 - 40*dist/outerRadius)}%)`);
    hexMesh.setColorAt( index, tempColor );

    // Set position
    tempQuaternion.identity();
    tempPosition.set(x,0,z);
    tempScale.set(hexRadius,height,hexRadius);
    tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
    hexMesh.setMatrixAt(index, tempMatrix);
    tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
    shadowMesh.setMatrixAt(index, tempMatrix);
    index++;
  }
  
  updateByTime(18);
}

const texture = new TextureLoader().load( 'https://cdn.glitch.me/2c81f270-d553-46c7-a777-7a487fed9eab%2Foriental-tiles.png?v=1634896030797');
const material = new MeshPhongMaterial( { map: texture  } );
texture.repeat.x = texture.repeat.y = 50;
texture.wrapS = texture.wrapT = RepeatWrapping;
const geometry = new PlaneGeometry(100,100,10,10);
const floor = new Mesh(geometry, material);
floor.castShadow = false;
floor.receiveShadow = true;
floor.rotation.x=-Math.PI/2;
scene.add(floor);

window.updateByTime = updateByTime;
