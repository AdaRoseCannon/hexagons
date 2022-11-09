import Perlin from './perlin.js';
import {HexagonGrid, Set2D, Map2D} from './hexagons.js';

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
  NoToneMapping,
  PMREMGenerator,
  WebGLCubeRenderTarget,
  CubeCamera,
  RGBAFormat,
  LinearMipmapLinearFilter,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  Color,
  MeshBasicMaterial,
  BoxGeometry,
  sRGBEncoding,
  SpotLight
} from 'https://cdn.skypack.dev/three@0.134.0';
import { OrbitControls } from 'https://cdn.skypack.dev/three@0.134.0/examples/jsm/controls/OrbitControls.js';
import { Sky } from 'https://cdn.skypack.dev/three@0.134.0/examples/jsm/objects/Sky.js';
import { LightProbeGenerator } from 'https://cdn.skypack.dev/three@0.134.0/examples/jsm/lights/LightProbeGenerator.js';
  
const tempMatrix = new Matrix4();
const tempQuaternion = new Quaternion();
const tempPosition = new Vector3();
const tempScale = new Vector3();
const tempColor = new Color();
const origin = [0,0];
const outerRadius = 15;

export const renderer = new WebGLRenderer({
  antialias: true
});
renderer.physicallyCorrectLights = true;
renderer.logarithmicDepthBuffer = true;
renderer.outputEncoding = sRGBEncoding;
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = VSMShadowMap;
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

const spotLight = new SpotLight( 0xffffff, 2, 0, 0.3, 0.1 );
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
const cubeRenderTarget = new WebGLCubeRenderTarget(256, { format: RGBAFormat, generateMipmaps: true, minFilter: LinearMipmapLinearFilter });
const cubeCamera = new CubeCamera(0.1, 1500, cubeRenderTarget);
cubeCamera.position.set(0, 1.6, 0);
let lightProbe;

function lightIntensity(k) {
  if (lightProbe) lightProbe.intensity = k/4;
  dirLight.intensity = 3*k/4;
}

const sky = new Sky();
sky.scale.set(1000,1000,1000);
scene.add( sky );

const sun = new Mesh(new SphereGeometry(50), new MeshBasicMaterial());
scene.add(sun);

function updateSky(options) {
  scene.add(sky);
  scene.background = null;
  scene.environment = null;
  renderer.toneMapping = ACESFilmicToneMapping;
  
  const uniforms = sky.material.uniforms;
  uniforms[ 'turbidity' ].value = options.turbidity;
  uniforms[ 'rayleigh' ].value = options.rayleigh;
  uniforms[ 'mieCoefficient' ].value = options.mieCoefficient;
  uniforms[ 'mieDirectionalG' ].value = options.mieDirectionalG;

  const phi = MathUtils.degToRad( 90 - Math.min(options.elevation,175) );
  const theta = MathUtils.degToRad( options.azimuth );

  dirLight.position.setFromSphericalCoords( 20, phi, theta );
  sun.position.setFromSphericalCoords( 1000, phi, theta );

  uniforms[ 'sunPosition' ].value.copy( dirLight.position );
  renderer.toneMappingExposure = options.exposure;
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
  dirLight.color.lerpColors(skyOrange,skyMidday,0.9*Math.sin(Math.PI*proportionThroughDay));
  sun.material.color.copy(dirLight.color);
  updateSky({
    turbidity: 10,
    rayleigh: 3,// Math.max(Math.min(10, 0.1/Math.sin(Math.PI*elevation/180)),0.01),
    mieCoefficient: 0.005,
    mieDirectionalG: 0.7,
    elevation,
    azimuth: 245,
    exposure: 0.5*(Math.sin(Math.PI*proportionThroughDay))
  });
  lightIntensity(0.6 + 0.6*(Math.sin(Math.PI*proportionThroughDay)));
}
updateByTime();

function renderEnv() {
  const tempScene = new Scene();
  tempScene.add(floor);
  tempScene.add( sky );
  cubeCamera.update(renderer, tempScene);
  tempScene.remove( sky );
  scene.add(floor);

  if (lightProbe) lightProbe.removeFromParent();
  lightProbe = LightProbeGenerator.fromCubeRenderTarget(renderer, cubeRenderTarget);
  scene.add(lightProbe);
  lightProbe.intensity = dirLight.intensity;

  scene.background = cubeRenderTarget.texture;
  scene.environment = pmremGenerator.fromCubemap(
    cubeRenderTarget.texture
  ).texture;
  
  // const skyCube = new Mesh(
  //   new BoxGeometry(1000, 1000, 1000),
  //   new MeshBasicMaterial({
  //     color: 0xffffff,
  //     envMap: cubeRenderTarget.texture,
  //     toneMapped: false,
  //     side: 1
  //   })
  // );
  // scene.add(skyCube);
  // window.skyCube = skyCube;
  
  renderer.toneMapping = NoToneMapping;
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
      const d = HexagonGrid.realDistance(origin, testPoint);
      const cutOff = Math.max(0.5-0.5*d/outerRadius, 0.1);
      const [x,y] = HexagonGrid.fromPoint(testPoint, outerRadius);
      const perlinXY = perlin.get(perlinScale*testPoint[0], perlinScale*testPoint[1]);
      // console.log(perlinXY);
      return x==0 &&
        y==0 && 
        perlinXY>=cutOff;
    }
  );
  
  const hexMeshMat = hex.material.clone();
  hexMeshMat.roughness = 0.4;
  hexMeshMat.metalness = 0.2;
  const hexMesh = new InstancedMesh( hex.geometry, hexMeshMat, set2D.size );
  hexMesh.castShadow = true
  hexMesh.receiveShadow = true
  scene.add( hexMesh );

  const shadowMesh = new InstancedMesh( shadow.geometry, shadow.material, set2D.size );
  scene.add( shadowMesh );

  let index = 0;
  for (const hex of set2D) {
    const center = hexes.getCenter(hex);
    const [x,z] = center;
    const dist = HexagonGrid.realDistance(origin, center);
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
  
  dirLight.shadow.needsUpdate = true;
}

const texture = new TextureLoader().load( 'https://cdn.glitch.me/2c81f270-d553-46c7-a777-7a487fed9eab%2Foriental-tiles.png?v=1634896030797', renderEnv);
const material = new MeshPhongMaterial( { map: texture  } );
texture.repeat.x = texture.repeat.y = 50;
texture.wrapS = texture.wrapT = RepeatWrapping;
const geometry = new PlaneGeometry(100,100,10,10);
const floor = new Mesh(geometry, material);
floor.castShadow = false;
floor.receiveShadow = true;
floor.rotation.x=-Math.PI/2;
scene.add(floor);
