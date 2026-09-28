import * as THREE from './vendor/three.module.min.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const canvas = $('#scene-canvas');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const mobile = matchMedia('(max-width: 760px)');
const clamp = THREE.MathUtils.clamp;
let renderer;
function showFallback(message) {
  $('#loading').hidden = true;
  $('#scene-fallback').hidden = false;
  $('#scene-status').textContent = message;
  $('#enter-scene').disabled = true;
  $$('[data-view], [data-light], #reset-view').forEach(button => { button.disabled = true; });
  document.body.classList.add('scene-started');
}
for (const name of ['reference', 'help']) {
  const dialog = $(`#${name}-dialog`), opener = $(`#open-${name}`);
  opener.addEventListener('click', () => dialog.showModal());
  $(`#close-${name}`).addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => opener.focus({ preventScroll: true }));
}
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (error) {
  showFallback('当前设备无法开启 3D，请查看实景参考');
  console.warn('WebGL unavailable', error);
}

// The reference photographs remain references. All room surfaces and furniture below are 3D geometry.
if (renderer) {
  try { start(); }
  catch (error) { showFallback('场景载入失败，请刷新或查看实景参考'); console.error(error); }
}

function start() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile.matches ? 1.5 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.shadowMap.enabled = !mobile.matches;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x171b16);
  scene.fog = new THREE.FogExp2(0x332519, 0.012);
  const camera = new THREE.PerspectiveCamera(64, 1, 0.06, 100);
  const architecture = new THREE.Group();
  const furniture = new THREE.Group();
  const cave = new THREE.Group();
  const flames = [];
  scene.add(architecture, furniture, cave);
  let seed = 82731;
  const random = () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
  const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
  const m = {
    wood: material(0x9b7250, { roughness: 0.53 }),
    paleWood: material(0xb19a72),
    dark: material(0x252a25, { metalness: 0.4, roughness: 0.4 }),
    brass: material(0xa8894d, { metalness: 0.8, roughness: 0.27 }),
    chrome: material(0xa3a49b, { metalness: 0.92, roughness: 0.26 }),
    stone: material(0x81775e),
    cream: material(0xd7d1b7, { roughness: 0.5 }),
    plate: material(0xeee7d3, { roughness: 0.2 }),
    linen: material(0xa39570, { roughness: 0.95 }),
    seat: material(0x36342c, { roughness: 0.9 }),
    bottle: material(0x182b17, { metalness: 0.05, roughness: 0.17 }),
    label: material(0xdcd3b2),
    wine: material(0x4d1017, { roughness: 0.15, metalness: 0.05 }),
    leaf: material(0x344329, { roughness: 0.83, side: THREE.DoubleSide }),
    leaf2: material(0x58633b, { roughness: 0.76, side: THREE.DoubleSide }),
    glow: new THREE.MeshBasicMaterial({ color: 0xffcf80 }),
    wick: new THREE.MeshBasicMaterial({ color: 0xfff0b0 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xece9dd, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false }),
  };

  // A small studio environment provides stable reflections on the wine glasses and metal lamps.
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x756349);
  const envBox = new THREE.Mesh(new THREE.BoxGeometry(30, 20, 30), new THREE.MeshBasicMaterial({ color: 0x544635, side: THREE.BackSide }));
  envScene.add(envBox);
  [[-5, 5, -8], [8, 8, 3], [-7, 3, 10]].forEach((p) => {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(5, 8), new THREE.MeshBasicMaterial({ color: 0xffeed0 }));
    panel.position.set(...p); panel.lookAt(0, 0, 0); envScene.add(panel);
  });
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(envScene, 0);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.25;
  pmrem.dispose();

  function mesh(geometry, mat, parent = furniture, p = [0, 0, 0], rotation = [0, 0, 0]) {
    const object = new THREE.Mesh(geometry, mat);
    object.position.set(...p); object.rotation.set(...rotation);
    object.castShadow = true; object.receiveShadow = true; parent.add(object);
    return object;
  }
  function box(w, h, d, mat, parent, p, rotation) { return mesh(new THREE.BoxGeometry(w, h, d), mat, parent, p, rotation); }
  function cylinder(rt, rb, h, mat, parent, p, segments = 24) { return mesh(new THREE.CylinderGeometry(rt, rb, h, segments), mat, parent, p); }
  function sphere(x, y, z, mat, parent, p, detail = 12) {
    const object = mesh(new THREE.SphereGeometry(1, detail, Math.max(6, detail / 2)), mat, parent, p);
    object.scale.set(x, y, z); return object;
  }
  function tube(points, radius, mat, parent = furniture) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    return mesh(new THREE.TubeGeometry(curve, 28, radius, 7, false), mat, parent);
  }
  function labelTexture(text, sub, background = '#233a31') {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
    const ctx = c.getContext('2d'); ctx.fillStyle = background; ctx.fillRect(0, 0, 1024, 256);
    ctx.fillStyle = '#eee4bd'; ctx.textAlign = 'center'; ctx.font = '60px serif'; ctx.fillText(text, 512, 112);
    ctx.font = '24px sans-serif'; ctx.fillText(sub, 512, 174);
    const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace; return texture;
  }

  // Continuous uneven limestone surfaces, with broad fractures rather than spherical boulders.
  const rock = material(0x998d76, { roughness: 0.96, side: THREE.DoubleSide });
  rock.onBeforeCompile = shader => {
    const noise = `
      varying vec3 vRock;
      float hashRock(vec3 p){ p=fract(p*0.3183099+vec3(.11,.37,.71));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      float noiseRock(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hashRock(i),hashRock(i+vec3(1,0,0)),f.x),mix(hashRock(i+vec3(0,1,0)),hashRock(i+vec3(1,1,0)),f.x),f.y),mix(mix(hashRock(i+vec3(0,0,1)),hashRock(i+vec3(1,0,1)),f.x),mix(hashRock(i+vec3(0,1,1)),hashRock(i+vec3(1,1,1)),f.x),f.y),f.z);}
      float rockFbm(vec3 p){return .5*noiseRock(p)+.26*noiseRock(p*2.13)+.13*noiseRock(p*4.31)+.065*noiseRock(p*8.77);}
    `;
    shader.vertexShader = 'varying vec3 vRock;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRock = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = noise + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float strata=rockFbm(vRock*vec3(1.15,2.8,1.1));
      float grain=noiseRock(vRock*5.);
      float fissure=smoothstep(.31,.43,abs(sin(vRock.y*8.+strata*12.+vRock.x*.5)));
      vec3 chalk=mix(vec3(.40,.36,.30),vec3(.98,.89,.70),smoothstep(.18,.78,strata));
      diffuseColor.rgb *= chalk*(.92+grain*.16)*(.86+.14*fissure);
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      float heightRock=rockFbm(vRock*2.)*.065+noiseRock(vRock*9.)*.006;
      vec3 dpdx=dFdx(vViewPosition);vec3 dpdy=dFdy(vViewPosition);
      vec3 r1=cross(dpdy,normal);vec3 r2=cross(normal,dpdx);
      float det=dot(dpdx,r1);
      normal=normalize(abs(det)*normal-sign(det)*(dFdx(heightRock)*r1+dFdy(heightRock)*r2));
    `);
  };
  function variation(x, z) {
    return Math.sin(x * .62 + z * .23) * .34 + Math.cos(z * .69 - x * .32) * .23 + Math.sin(x * 1.64 + z * 1.23) * .1 + Math.sin(z * 3.18 + x * 2.43) * .045;
  }
  function ceilingY(x, z) {
    return 5.0 + .55 * Math.sin(z * .25) + .45 * Math.sin(x * .37) + variation(x, z) - .55 * Math.exp(-((x - 5) ** 2) / 13) + .6 * Math.exp(-((x + 4) ** 2) / 8);
  }
  function surface(nu, nv, fn, mat, parent) {
    const positions = [], uv = [], indices = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { positions.push(...fn(i / nu, j / nv)); uv.push(i / nu, j / nv); }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + nu + 1; indices.push(a,b,a+1,b,b+1,a+1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(indices); g.computeVertexNormals(); return mesh(g, mat, parent);
  }
  surface(115, 135, (u,v) => { const x=(u-.5)*21,z=(v-.5)*27;return [x,ceilingY(x,z),z]; }, rock, cave);
  [-1,1].forEach(side => surface(100, 28, (u,v) => {
    const z=(u-.5)*27,y=v*6.4,x=side*(10.6-.75*Math.sin(v*Math.PI)+variation(z,y)); return [x,y,z];
  }, rock, cave));
  surface(75, 35, (u,v) => {const x=(u-.5)*21,y=v*6.5;return [x,y,-13.5+variation(x,y)*1.2];},rock,cave);
  // Broad hanging ledges break up the roof silhouette.
  for (let i=0;i<18;i++) {
    const x=(random()-.5)*18,z=(random()-.5)*24;
    const geo = new THREE.SphereGeometry(1, 32, 16);
    const pos=geo.attributes.position;
    for(let k=0;k<pos.count;k++){const vx=pos.getX(k),vy=pos.getY(k),vz=pos.getZ(k);const n=1+.07*Math.sin(vx*5+vz*6+vy*4);pos.setXYZ(k,vx*n,vy*n,vz*n);}
    geo.computeVertexNormals();
    const ledge=mesh(geo,rock,cave,[x,ceilingY(x,z)+.09,z],[random()*.15,random()*3,random()*.12]);
    ledge.scale.set(1.4+random()*2.4,.25+random()*.36,.75+random()*1.7);
  }

  const floorCanvas=document.createElement('canvas'); floorCanvas.width=1024;floorCanvas.height=1024;
  const fctx=floorCanvas.getContext('2d');fctx.fillStyle='#393a31';fctx.fillRect(0,0,1024,1024);
  for(let row=0;row<12;row++)for(let col=-1;col<5;col++){
    const value=92+Math.floor(random()*17);fctx.fillStyle=`rgb(${value+6},${value+2},${value-6})`;
    const x=col*256+(row%2)*128,y=row*85.333;fctx.fillRect(x+2,y+2,252,81);
    fctx.strokeStyle='rgba(210,201,175,.11)';fctx.strokeRect(x+3,y+3,250,79);
    for(let t=0;t<18;t++){fctx.fillStyle=`rgba(20,20,15,${random()*.05})`;fctx.fillRect(x+random()*255,y+random()*82,random()*130+5,1);}
  }
  const floorMap=new THREE.CanvasTexture(floorCanvas);floorMap.colorSpace=THREE.SRGBColorSpace;floorMap.wrapS=floorMap.wrapT=THREE.RepeatWrapping;floorMap.repeat.set(3,4);floorMap.anisotropy=4;
  const floorMat=material(0xbbb4a3,{map:floorMap,bumpMap:floorMap,bumpScale:.018,roughness:.8});
  box(21.4,.28,27.4,floorMat,architecture,[0,-.16,0]);
  [-1,1].forEach(side=>{
    box(8.8,.1,25.8,floorMat,architecture,[side*6.25,.02,-.3]);
    box(.028,.015,25.8,m.glow,architecture,[side*1.84,.076,-.3]);
    box(.1,.12,25.9,m.dark,architecture,[side*1.92,.003,-.3]);
  });
  // Low perimeter remains in the cutaway layout view.
  [-1,1].forEach(side=>box(.55,.45,27,rock,architecture,[side*10.5,.18,0]));
  box(21,.4,.5,rock,architecture,[0,.17,-13.3]);

  function wineGlass(parent, x, y, z) {
    const glassGroup=new THREE.Group();parent.add(glassGroup);glassGroup.position.set(x,y,z);
    cylinder(.06,.069,.009,m.glass,glassGroup,[0,.009,0],18);
    cylinder(.009,.009,.16,m.glass,glassGroup,[0,.089,0],8);
    const profile=[[.01,.16],[.065,.18],[.078,.22],[.076,.265],[.064,.31]].map(([a,b])=>new THREE.Vector2(a,b));
    mesh(new THREE.LatheGeometry(profile,20),m.glass,glassGroup);
    cylinder(.071,.053,.05,m.wine,glassGroup,[0,.207,0],20);
    mesh(new THREE.TorusGeometry(.064,.0024,4,20),m.plate,glassGroup,[0,.31,0],[Math.PI/2,0,0]);
  }
  function bottle(parent,x,y,z) {
    const pts=[[.001,0],[.075,0],[.077,.25],[.067,.31],[.029,.36],[.025,.46],[.028,.49]].map(([a,b])=>new THREE.Vector2(a,b));
    mesh(new THREE.LatheGeometry(pts,18),m.bottle,parent,[x,y,z]);
    cylinder(.079,.079,.12,m.label,parent,[x,y+.18,z],18);
    cylinder(.029,.029,.058,m.wine,parent,[x,y+.478,z],16);
  }
  function candle(parent,x,y,z,h=.22) {
    cylinder(.05,.06,.018,m.brass,parent,[x,y+.01,z],16);
    cylinder(.027,.03,h,m.cream,parent,[x,y+h/2+.025,z],12);
    const flame=sphere(.013,.04,.013,m.wick,parent,[x,y+h+.06,z],8);flame.userData.baseY=y+h+.06;flames.push(flame);
  }
  function chair(parent,x,z,angle,wooden=false) {
    const group=new THREE.Group();group.position.set(x,0,z);group.rotation.y=angle;parent.add(group);
    const seatMat=wooden?m.linen:m.seat;
    cylinder(.285,.28,.075,seatMat,group,[0,.51,0],20);
    const shell=new THREE.CylinderGeometry(.325,.3,.40,18,1,true,-1.42,2.84);
    const back=mesh(shell,wooden?m.paleWood:m.wood,group,[0,.77,0],[0,Math.PI,0]);back.material.side=THREE.DoubleSide;
    for(const sx of [-1,1])for(const sz of [-1,1]){
      const leg=cylinder(.017,.014,.50,wooden?m.wood:m.dark,group,[sx*.21,.25,sz*.18],7);leg.rotation.z=sx*-.09;leg.rotation.x=sz*.08;
    }
    tube([[-.29,.71,-.12],[-.30,.72,.17],[-.24,.68,.24]],.02,wooden?m.paleWood:m.wood,group);
    tube([[.29,.71,-.12],[.30,.72,.17],[.24,.68,.24]],.02,wooden?m.paleWood:m.wood,group);
  }
  function placeSetting(parent,x,z,angle,y=.905) {
    const g=new THREE.Group();g.position.set(x,y,z);g.rotation.y=angle;parent.add(g);
    cylinder(.185,.18,.008,m.brass,g,[0,0,0],24);
    cylinder(.167,.14,.024,m.plate,g,[0,.015,0],24);
    const rim=mesh(new THREE.TorusGeometry(.15,.011,6,24),m.plate,g,[0,.036,0],[Math.PI/2,0,0]);
    box(.15,.012,.19,m.linen,g,[0,.045,0],[0,.22,0]);
    box(.012,.01,.23,m.brass,g,[-.23,.013,0]);
    for(let i=0;i<3;i++)box(.005,.012,.045,m.brass,g,[-.238+i*.008,.014,-.13]);
    box(.012,.014,.26,m.brass,g,[.23,.014,0]);
    wineGlass(g,.23,0,-.27);
    cylinder(.046,.037,.06,m.plate,g,[-.2,.04,-.28],16);
  }
  function roundTable(x,z,r=1.45,guests=7,hero=false){
    const g=new THREE.Group();g.position.set(x,.09,z);furniture.add(g);
    cylinder(r,r,.09,m.cream,g,[0,.8,0],48);
    cylinder(.38,.62,.73,m.paleWood,g,[0,.39,0],24);
    cylinder(r*.56,r*.56,.033,m.cream,g,[0,.863,0],40);
    for(let i=0;i<guests;i++){
      const a=i/guests*Math.PI*2;
      chair(g,Math.sin(a)*(r+.47),Math.cos(a)*(r+.47),a+Math.PI);
      placeSetting(g,Math.sin(a)*(r-.32),Math.cos(a)*(r-.32),a,.85);
    }
    bottle(g,-.25,.888,.05);bottle(g,-.09,.888,.15);
    candle(g,.34,.888,.14,.20);candle(g,.1,.888,-.27,.29);
    cylinder(.12,.09,.19,m.cream,g,[0,.98,-.03],20);
    for(let i=0;i<9;i++){
      const a=i*2.4;const xx=Math.cos(a)*.15,zz=Math.sin(a)*.15;
      tube([[0,1,-.03],[xx*.5,1.2,zz*.5],[xx,1.3+random()*.12,zz]],.006,m.leaf,g);
      sphere(.07,.036,.06,m.cream,g,[xx,1.33+random()*.07,zz],8);
    }
    if(hero) candle(g,-.4,.888,-.23,.35);
  }
  function rectangularTable(x,z){
    const g=new THREE.Group();g.position.set(x,.09,z);furniture.add(g);
    box(2.25,.08,1.22,m.paleWood,g,[0,.8,0]);
    for(const sx of [-1,1])for(const sz of [-1,1])box(.06,.77,.06,m.wood,g,[sx*.97,.4,sz*.46]);
    for(const sx of [-.65,.65])for(const sz of [-1,1]){
      chair(g,sx,sz*1.02,sz>0?Math.PI:0,true);
      placeSetting(g,sx,sz*.31,sz>0?0:Math.PI,.85);
    }
    candle(g,0,.85,0,.24); bottle(g,.3,.85,0);
  }
  roundTable(5,5,1.6,8,true);roundTable(5,-2.1,1.45,7);roundTable(5.8,-8.5,1.55,8);
  rectangularTable(-4.4,7.5);rectangularTable(-5,3.8);rectangularTable(-4.5,-.3);rectangularTable(-5,-5.2);roundTable(-5,-10.1,1.45,6);

  function archLamp(x,z,dir=1){
    cylinder(.34,.37,.07,m.dark,furniture,[x,.13,z],24);
    tube([[x,.15,z],[x,1.4,z],[x+.12*dir,2.6,z],[x+1.25*dir,3.15,z],[x+2.05*dir,2.72,z]],.025,m.chrome);
    const px=x+2.05*dir;
    mesh(new THREE.SphereGeometry(.32,24,12,0,Math.PI*2,0,Math.PI/2),m.chrome,furniture,[px,2.65,z]);
    cylinder(.265,.265,.02,m.glow,furniture,[px,2.65,z],24);
  }
  archLamp(8.2,5,-1);archLamp(8.1,-2,-1);archLamp(-8.2,3.8,1);archLamp(-8.3,-5.2,1);

  function leafGeometry(length,width){
    const g=new THREE.BufferGeometry(),p=[],uv=[],ix=[];
    for(let i=0;i<=10;i++){
      const t=i/10,w=Math.sin(t*Math.PI)*width;
      p.push(-w,length*t,Math.sin(t*Math.PI)*length*.2,0,length*t,Math.sin(t*Math.PI)*length*.25,w,length*t,Math.sin(t*Math.PI)*length*.2);
      uv.push(0,t,.5,t,1,t);
      if(i<10){const b=i*3;ix.push(b,b+3,b+1,b+1,b+3,b+4,b+1,b+4,b+2,b+2,b+4,b+5);}
    }
    g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();return g;
  }
  function plant(x,z,scale=1){
    const g=new THREE.Group();g.position.set(x,.09,z);g.scale.setScalar(scale);furniture.add(g);
    cylinder(.29,.21,.5,m.cream,g,[0,.25,0],18);
    cylinder(.25,.25,.02,m.stone,g,[0,.51,0],18);
    for(let i=0;i<14;i++){
      const a=i*2.399;const h=.75+random()*.7;
      tube([[0,.46,0],[Math.sin(a)*.13,h*.85,Math.cos(a)*.13],[Math.sin(a)*.38,h,Math.cos(a)*.38]],.01,m.leaf,g);
      const leaf=mesh(leafGeometry(.55+random()*.5,.16+random()*.08),i%3?m.leaf:m.leaf2,g,[Math.sin(a)*.38,h,Math.cos(a)*.38],[-.8-random()*.4,a,random()*.3]);
    }
  }
  [[8.6,10,1.4],[-8.8,9.5,1.35],[8.6,1.4,1.25],[-8.5,-1,1.6],[-2.4,-4,1.05],[8.1,-11,1.2],[-8.6,-11.9,1.5],[2.8,-9.8,1.1],[-2.9,11.6,1],[3,11.6,1.15]].forEach(p=>plant(...p));

  // Restaurant service counter and wine display along the back wall.
  box(5.3,.95,.7,m.cream,furniture,[0,.5,-12.6]);
  box(5.6,.07,.95,m.stone,furniture,[0,1.015,-12.55]);
  for(let i=0;i<6;i++){
    box(.76,.83,.015,m.paleWood,furniture,[-2.23+i*.9,.5,-12.235]);
    box(.19,.018,.025,m.brass,furniture,[-2.23+i*.9,.68,-12.21]);
  }
  for(let row=0;row<3;row++){
    box(4.8,.05,.35,m.wood,furniture,[0,1.65+row*.6,-13]);
    for(let col=0;col<7;col++)bottle(furniture,-2+col*.64,1.69+row*.6,-13);
  }
  const sign=mesh(new THREE.PlaneGeometry(3.6,.9),new THREE.MeshBasicMaterial({map:labelTexture('山水之间 · 晚宴','NANYANG JOURNEY  /  PRIVATE DINING')}),furniture,[0,3.78,-13]);

  // Entry frame is visible from the entrance preset and from inside when looking back.
  const entry=new THREE.Group();entry.position.z=13.2;architecture.add(entry);
  box(11,.23,.26,m.dark,entry,[0,3.2,0]);
  for(const x of [-5.4,-2,2,5.4])box(.16,3.2,.22,m.dark,entry,[x,1.6,0]);
  for(const side of [-1,1]){
    box(3.2,.12,.18,m.dark,entry,[side*3.65,1.06,0]);
    box(3.15,3.05,.035,m.glass,entry,[side*3.7,1.59,.01]);
  }
  mesh(new THREE.PlaneGeometry(4.5,1.03),new THREE.MeshBasicMaterial({map:labelTexture('岩 洞 餐 厅','C A V E   R E S T A U R A N T')}),entry,[0,3.85,.18]);
  box(11,.25,4,m.stone,architecture,[0,-.2,15]);

  const hemisphere=new THREE.HemisphereLight(0xffe3b0,0x474238,1.4);scene.add(hemisphere);
  const ambient=new THREE.AmbientLight(0xcac1ab,.45);scene.add(ambient);
  const key=new THREE.DirectionalLight(0xffdfb0,2.2);key.position.set(-2,7,7);key.target.position.set(1,0,0);scene.add(key,key.target);
  key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-12,right:12,top:15,bottom:-15,near:.1,far:25});key.shadow.bias=-.0003;key.shadow.normalBias=.07;
  const entranceLight=new THREE.DirectionalLight(0xbecbd3,.7);entranceLight.position.set(0,4,18);entranceLight.target.position.set(0,1,0);scene.add(entranceLight,entranceLight.target);
  const accents=[];
  [[-8.5,2.6,6],[8.5,2.7,7],[-7.8,2.8,-5],[8.4,2.7,-5],[0,3,-11]].forEach((p,i)=>{
    const l=new THREE.PointLight(i%2?0xffb13b:0xffc164,85,14,2);l.position.set(...p);scene.add(l);accents.push(l);
    cylinder(.14,.2,.1,m.dark,architecture,[p[0],.15,p[2]],12);
  });
  const tableLights=[];
  [[5,2.4,5],[5,2.5,-2.1],[-4.5,2.5,3.8]].forEach(p=>{const l=new THREE.PointLight(0xffe7c2,13,5,2);l.position.set(...p);scene.add(l);tableLights.push(l);});

  // Merge static meshes by material: detailed tableware stays inexpensive on a phone.
  function batch(group) {
    group.updateMatrixWorld(true);const batches=new Map(), originals=[];
    group.traverse(obj=>{if(!obj.isMesh||flames.includes(obj))return;const g=(obj.geometry.index?obj.geometry.toNonIndexed():obj.geometry.clone());g.applyMatrix4(obj.matrixWorld);const key=obj.material.uuid;if(!batches.has(key))batches.set(key,{mat:obj.material,geos:[]});batches.get(key).geos.push(g);originals.push(obj);});
    for(const obj of originals){obj.removeFromParent();obj.geometry.dispose();}
    for(const {mat,geos} of batches.values()){
      const len=geos.reduce((n,g)=>n+g.attributes.position.count,0);const positions=new Float32Array(len*3),normals=new Float32Array(len*3),uvs=new Float32Array(len*2);let offset=0;
      for(const g of geos){const n=g.attributes.position.count;positions.set(g.attributes.position.array,offset*3);normals.set(g.attributes.normal.array,offset*3);if(g.attributes.uv)uvs.set(g.attributes.uv.array,offset*2);offset+=n;g.dispose();}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.setAttribute('normal',new THREE.BufferAttribute(normals,3));g.setAttribute('uv',new THREE.BufferAttribute(uvs,2));g.computeBoundingSphere();mesh(g,mat,group);
    }
  }
  batch(furniture);batch(architecture);batch(cave);
  cave.traverse(object=>{if(object.isMesh)object.castShadow=false;});

  const views={
    entrance:{pos:[0,1.72,16.5],look:[0,2.0,-2],label:'入口 · 走入山石之间',fov:65},
    hall:{pos:[-.65,1.9,9.5],look:[2.4,2.75,-4],label:'主厅 · 洞顶与用餐区',fov:68},
    table:{pos:[2.7,1.62,8.1],look:[5,1.12,4.8],label:'晚宴桌 · 红酒与烛光',fov:62},
    overview:{pos:[19,20,25],look:[0,0,0],label:'全景布局 · 桌区与中央通道',fov:54}
  };
  let activeView='hall',started=false,lightMode='dinner',transition=null,drag=null,keys=new Set(),lastTime=0,raf=0,dirty=true,hidden=false;
  const eye=new THREE.Vector3(...views.hall.pos);let yaw=0,pitch=0,targetYaw=0,targetPitch=0;
  const look=new THREE.Vector3(...views.hall.look);
  const direction=new THREE.Vector3(), projected=new THREE.Vector3();
  const overviewTarget=new THREE.Vector3(0,0,0);
  let overviewRadius=new THREE.Vector3(...views.overview.pos).length();
  function anglesTo(target){const v=target.clone().sub(eye).normalize();yaw=Math.atan2(v.x,-v.z);pitch=Math.asin(v.y);targetYaw=yaw;targetPitch=pitch;}
  anglesTo(look);camera.position.copy(eye);camera.lookAt(look);
  function selectView(name,animated=true){
    if(!views[name])return;
    activeView=name;const v=views[name];cave.visible=name!=='overview';
    scene.fog.density=name==='overview'?.006:.012;
    $('#view-label').textContent=v.label;
    $$('[data-view]').forEach(b=>{const chosen=b.dataset.view===name;b.classList.toggle('is-active',chosen);b.setAttribute('aria-pressed',String(chosen));});
    $('#detail-panel').hidden=true;
    const endEye=new THREE.Vector3(...v.pos),endLook=new THREE.Vector3(...v.look);
    if(name==='overview'){
      endEye.multiplyScalar(Math.max(1,Math.min(2.2,1/camera.aspect)));
      overviewRadius=endEye.length();
    }
    if(animated&&!reduced.matches){const forward=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);transition={start:performance.now(),duration:name==='entrance'?1000:1700,from:eye.clone(),to:endEye,fromLook:eye.clone().addScaledVector(forward,8),toLook:endLook,fromFov:camera.fov,toFov:v.fov};}
    else{eye.copy(endEye);anglesTo(endLook);camera.fov=v.fov;camera.updateProjectionMatrix();transition=null;}
    dirty=true;request();
  }
  function enter(){
    started=true;document.body.classList.add('scene-started');
    selectView('entrance',false);
    if(!reduced.matches){const v=views.hall;transition={start:performance.now(),duration:4600,from:eye.clone(),to:new THREE.Vector3(...v.pos),fromLook:new THREE.Vector3(0,2,0),toLook:new THREE.Vector3(...v.look),fromFov:65,toFov:v.fov};activeView='hall';$('#view-label').textContent='沿着灯光，走进晚宴主厅';$$('[data-view]').forEach(b=>{const selected=b.dataset.view==='hall';b.classList.toggle('is-active',selected);b.setAttribute('aria-pressed',String(selected));});}
    else selectView('hall',false);
    canvas.focus({preventScroll:true});request();
  }
  function setLight(mode){
    lightMode=mode;const dinner=mode==='dinner';
    accents.forEach(l=>{l.intensity=dinner?85:32;l.color.set(dinner?0xffb84d:0xffecd2);});
    hemisphere.intensity=dinner?1.4:2;ambient.intensity=dinner?.45:.65;entranceLight.intensity=dinner?.7:2.1;
    key.intensity=dinner?2.2:2.5;key.color.set(dinner?0xffdfb0:0xf2eee4);
    renderer.toneMappingExposure=dinner?1.25:1.3;
    $$('[data-light]').forEach(b=>{const chosen=b.dataset.light===mode;b.classList.toggle('is-active',chosen);b.setAttribute('aria-pressed',String(chosen));});dirty=true;request();
  }
  const hotspots=[
    {name:'天然洞顶',p:new THREE.Vector3(-1.6,4.55,-2),title:'山石之下，晚宴之上',copy:'宽低的石灰岩洞顶是空间的主角。暖色上照光掠过岩面，让层叠纹理与天然凹凸浮现。',view:'hall'},
    {name:'红酒晚宴',p:new THREE.Vector3(5,1.3,5),title:'一桌属于彼此的时光',copy:'以原餐厅圆桌为基础，加入红酒杯、烛光与低矮花艺。围桌而坐，保留交谈时的视线与舒适距离。',view:'table'},
    {name:'中央通道',p:new THREE.Vector3(0,.25,-5),title:'循着微光，慢慢走入',copy:'一条清楚的中央动线串联入口与主厅，两侧抬高桌区以暖白灯带勾勒边缘。',view:'hall'},
  ];
  for(const [i,h] of hotspots.entries()){
    const b=document.createElement('button');b.className='scene-hotspot';b.type='button';b.innerHTML=`<span class="hotspot-number">0${i+1}</span><span class="hotspot-label">${h.name}</span>`;b.setAttribute('aria-label',`了解${h.name}`);$('#hotspot-layer').append(b);h.button=b;
    b.addEventListener('click',()=>{selectView(h.view);$('#detail-title').textContent=h.title;$('#detail-copy').textContent=h.copy;$('#detail-panel').hidden=false;$('#detail-close').focus({preventScroll:true});});
  }
  function updateHotspots(){
    const width=canvas.clientWidth,height=canvas.clientHeight;
    hotspots.forEach(h=>{
      projected.copy(h.p).project(camera);
      const show=started&&!transition&&activeView!=='entrance'&&!(activeView==='overview'&&h.name==='天然洞顶')&&projected.z<1&&projected.z>-1&&Math.abs(projected.x)<.9&&Math.abs(projected.y)<.76;
      h.button.hidden=!show;
      if(show)h.button.style.transform=`translate(${(projected.x*.5+.5)*width}px,${(-projected.y*.5+.5)*height}px) translate(-50%,-50%)`;
    });
  }
  function resize(){const width=canvas.clientWidth,height=canvas.clientHeight;if(!width||!height)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();dirty=true;request();}
  new ResizeObserver(resize).observe(canvas);
  function stopTransition(){if(transition){transition=null;anglesTo(eye.clone().add(new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion)));}}
  const pointers = new Map();
  let pinchDistance = 0;
  const pointerDistance = () => { const [a,b] = [...pointers.values()]; return Math.hypot(a.x-b.x,a.y-b.y); };
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;stopTransition();
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    drag={id:e.pointerId,x:e.clientX,y:e.clientY};
    if(pointers.size===2)pinchDistance=pointerDistance();
    canvas.setPointerCapture(e.pointerId);canvas.classList.add('is-dragging');
  });
  canvas.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId))return;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size>=2){
      const distance=pointerDistance();
      if(pinchDistance>0){camera.fov=clamp(camera.fov*pinchDistance/Math.max(1,distance),35,85);camera.updateProjectionMatrix();}
      pinchDistance=distance;
    }else if(drag){
      targetYaw-=(e.clientX-drag.x)*.004;targetPitch=clamp(targetPitch+(e.clientY-drag.y)*.003,-1.2,1.1);
      drag.x=e.clientX;drag.y=e.clientY;
    }
    dirty=true;request();
  });
  const release=e=>{
    pointers.delete(e.pointerId);pinchDistance=0;
    const remaining=[...pointers.entries()][0];
    drag=remaining?{id:remaining[0],...remaining[1]}:null;
    if(!drag)canvas.classList.remove('is-dragging');
  };
  canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
  canvas.addEventListener('wheel',e=>{e.preventDefault();camera.fov=clamp(camera.fov+e.deltaY*.025,35,85);camera.updateProjectionMatrix();dirty=true;request();},{passive:false});
  canvas.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','w','a','s','d','W','A','S','D'].includes(e.key)){e.preventDefault();stopTransition();keys.add(e.key.toLowerCase());request();}if(e.key==='Home'){e.preventDefault();selectView('hall');}});
  window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>keys.clear());canvas.addEventListener('blur',()=>keys.clear());
  $('#enter-scene').addEventListener('click',enter);
  $$('[data-view]').forEach(b=>b.addEventListener('click',()=>{started=true;document.body.classList.add('scene-started');selectView(b.dataset.view);}));
  $$('[data-light]').forEach(b=>b.addEventListener('click',()=>setLight(b.dataset.light)));
  $('#reset-view').addEventListener('click',()=>selectView('hall'));
  $('#detail-close').addEventListener('click',()=>{$('#detail-panel').hidden=true;canvas.focus({preventScroll:true});});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#detail-panel').hidden){$('#detail-panel').hidden=true;canvas.focus({preventScroll:true});}});
  $('#fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{$('#scene-status').textContent='当前浏览器未开放全屏，请使用横屏查看';}});
  document.addEventListener('fullscreenchange',()=>{$('#fullscreen').setAttribute('aria-pressed',String(!!document.fullscreenElement));resize();});
  for(const name of ['reference','help']) $(`#open-${name}`).addEventListener('click',()=>keys.clear());
  let contextLost=false;
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;cancelAnimationFrame(raf);raf=0;showFallback('3D 显示中断，刷新页面可重新载入');});
  document.addEventListener('visibilitychange',()=>{hidden=document.hidden;lastTime=0;if(hidden){cancelAnimationFrame(raf);raf=0;keys.clear();}else{dirty=true;request();}});
  reduced.addEventListener('change',()=>{dirty=true;request();});
  function request(){if(!raf&&!hidden&&!contextLost)raf=requestAnimationFrame(frame);}
  function frame(time){
    raf=0;const dt=Math.min(.04,(time-(lastTime||time))/1000);lastTime=time;
    if(transition){
      const t=clamp((time-transition.start)/transition.duration,0,1),ease=t*t*(3-2*t);
      eye.lerpVectors(transition.from,transition.to,ease);look.lerpVectors(transition.fromLook,transition.toLook,ease);camera.position.copy(eye);camera.lookAt(look);camera.fov=THREE.MathUtils.lerp(transition.fromFov,transition.toFov,ease);camera.updateProjectionMatrix();
      if(t===1){anglesTo(transition.toLook);transition=null;$('#view-label').textContent=views[activeView].label;}
      dirty=true;
    }else{
      if(keys.has('arrowleft'))targetYaw+=dt;if(keys.has('arrowright'))targetYaw-=dt;if(keys.has('arrowup'))targetPitch+=dt*.6;if(keys.has('arrowdown'))targetPitch-=dt*.6;
      targetPitch=activeView==='overview'?clamp(targetPitch,-1.35,-.2):clamp(targetPitch,-1.2,1.1);
      const smooth=reduced.matches?1:1-Math.exp(-dt*14);yaw=THREE.MathUtils.lerp(yaw,targetYaw,smooth);pitch=THREE.MathUtils.lerp(pitch,targetPitch,smooth);
      if(activeView!=='overview'){
        let moveX=0,moveZ=0;
        if(keys.has('w')){moveX+=Math.sin(yaw);moveZ-=Math.cos(yaw);}if(keys.has('s')){moveX-=Math.sin(yaw);moveZ+=Math.cos(yaw);}
        if(keys.has('a')){moveX-=Math.cos(yaw);moveZ-=Math.sin(yaw);}if(keys.has('d')){moveX+=Math.cos(yaw);moveZ+=Math.sin(yaw);}
        // Walk on the central route; close table views are reached using the presets.
        if(moveX||moveZ){
          // Return smoothly to the aisle from a close-up instead of snapping sideways.
          const aisleX=clamp(eye.x,-1.45,1.45);
          if(Math.abs(eye.x-aisleX)>.03){eye.x=THREE.MathUtils.damp(eye.x,aisleX,3,dt);}
          else{eye.x=clamp(eye.x+moveX*dt*2.3,-1.45,1.45);eye.z=clamp(eye.z+moveZ*dt*2.3,-10.7,16.5);}
          eye.y=THREE.MathUtils.damp(eye.y,1.72,4,dt);
        }
      }
      direction.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));
      if(activeView==='overview')eye.copy(overviewTarget).addScaledVector(direction,-overviewRadius);
      camera.position.copy(eye);camera.lookAt(eye.clone().add(direction));
      if(keys.size||Math.abs(yaw-targetYaw)>.0001||Math.abs(pitch-targetPitch)>.0001)dirty=true;
    }
    if(!reduced.matches&&lightMode==='dinner'){
      flames.forEach((f,i)=>{f.scale.y=.04*(1+.13*Math.sin(time*.006+i*2));});dirty=true;
    }
    if(dirty){renderer.render(scene,camera);updateHotspots();dirty=false;}
    if(transition||keys.size||drag||(!reduced.matches&&lightMode==='dinner')||Math.abs(yaw-targetYaw)>.0001||Math.abs(pitch-targetPitch)>.0001)request();
  }
  resize();selectView('hall',false);setLight('dinner');
  $('#loading').hidden=true;$('#scene-fallback').hidden=true;$('#scene-status').textContent='3D 场景已就绪';
  canvas.dataset.ready='true';
  // Read-only diagnostics for local verification.
  window.caveDemo={get state(){return {view:activeView,started,light:lightMode,ready:true,position:eye.toArray(),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles};}};
  request();
}
