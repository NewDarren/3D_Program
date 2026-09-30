import * as THREE from '../cave-dinner-demo/vendor/three.module.min.js';
import { GLTFLoader } from '../cave-dinner-demo/vendor/loaders/GLTFLoader.js';
import { createNavigator } from '../cave-dinner-demo/navigation.mjs';
import { easeCamera, roundWalkingPath } from '../cave-dinner-demo/camera-motion.mjs';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const canvas = $('#scene-canvas'), reduced = matchMedia('(prefers-reduced-motion: reduce)'), mobile = matchMedia('(max-width: 760px)');
const clamp = THREE.MathUtils.clamp;
let motion = !reduced.matches, override = false;
try { const v = localStorage.getItem('magpie-motion'); if (v !== null) { motion = v === 'on'; override = true; } } catch {}
const state = {ready:false,started:false,overview:false,roof:false,view:'entrance',light:'show',yaw:0,pitch:0,animation:null,keys:new Set(),pad:new Set(),pointers:new Map(),dirty:true};
let renderer,scene,camera,model,manifest,navigator,roof,walls,ambient,hemisphere;
let previousTime=0,lastRender=0,elapsed=0,lastHotspots=0,lightBlend=0;
const lights=[],emissives=[],hotspots=[],occluders=[],beams=[];
const orbit={target:new THREE.Vector3(0,.8,0),radius:29,theta:.65,phi:.73};
const raycaster=new THREE.Raycaster(),projected=new THREE.Vector3(),direction=new THREE.Vector3(),euler=new THREE.Euler(0,0,0,'YXZ'),poseCamera=new THREE.PerspectiveCamera();
const status = text => { if ($('#scene-status').textContent!==text) $('#scene-status').textContent=text; };
function clearInput(){state.keys.clear();state.pad.clear();state.pointers.clear();$$('[data-move]').forEach(b=>b.classList.remove('is-active'));}
for(const name of ['reference','help']){
  const dialog=$(`#${name}-dialog`),opener=$(`#open-${name}`);
  opener.addEventListener('click',()=>{clearInput();if(!dialog.open)dialog.showModal();});
  $(`#close-${name}`).addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
  dialog.addEventListener('close',()=>{opener.focus({preventScroll:true});state.dirty=true;});
}
$('#detail-close').addEventListener('click',()=>{$('#detail-panel').hidden=true;});
$('#fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else status('请使用浏览器菜单进入全屏');}catch{status('请使用浏览器菜单进入全屏');}});
const home=document.querySelector('a[href="../index.html"]');
if(home){const url=new URL(home.href),ref=new URLSearchParams(location.search).get('ref');if(ref)url.searchParams.set('ref',ref);home.href=url.href;}
function resize(){if(!renderer)return;const stage=$('#scene-stage'),w=Math.max(1,stage.clientWidth),h=Math.max(1,stage.clientHeight);renderer.setPixelRatio(Math.min(devicePixelRatio||1,mobile.matches?1.15:1.6));renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();state.dirty=true;}
function syncAngles(){euler.setFromQuaternion(camera.quaternion,'YXZ');state.yaw=euler.y;state.pitch=euler.x;}
function setPose(pose){camera.position.fromArray(pose.pos);camera.lookAt(...pose.look);camera.fov=pose.fov||66;camera.updateProjectionMatrix();syncAngles();state.dirty=true;}
function quaternion(pose){poseCamera.position.fromArray(pose.pos);poseCamera.lookAt(...pose.look);return poseCamera.quaternion.clone();}
function begin(){state.started=true;document.body.classList.add('is-started');}
function shell(){if(roof)roof.visible=!state.overview||state.roof;if(walls)walls.visible=!state.overview||state.roof;$('#toggle-roof').hidden=!state.overview;$('#toggle-roof').setAttribute('aria-pressed',String(state.roof));$('#toggle-roof').textContent=state.roof?'剖开屋顶':'显示完整建筑';state.dirty=true;}
function setOverview(value){state.overview=value;document.body.classList.toggle('is-overview',value);shell();}
function selected(name){state.view=name;$$('[data-view]').forEach(b=>{const active=b.dataset.view===name;b.classList.toggle('is-active',active);b.setAttribute('aria-pressed',String(active));});$('#mode-label').textContent=manifest.views[name].label;}
function travelUI(active){document.body.classList.toggle('is-travelling',active);$('#tour-skip').hidden=!active;status(active?'正在前往 · 拖动可接管镜头':state.overview?'拖动旋转 · 滚轮或双指缩放':'拖动环顾 · W A S D / 方向键行走');}
function orbitFromCamera(){const offset=camera.position.clone().sub(orbit.target);orbit.radius=clamp(offset.length(),8,55);orbit.theta=Math.atan2(offset.x,offset.z);orbit.phi=clamp(Math.acos(offset.y/(offset.length()||1)),.15,1.42);}
function applyOrbit(){camera.position.set(orbit.target.x+orbit.radius*Math.sin(orbit.phi)*Math.sin(orbit.theta),orbit.target.y+orbit.radius*Math.cos(orbit.phi),orbit.target.z+orbit.radius*Math.sin(orbit.phi)*Math.cos(orbit.theta));camera.lookAt(orbit.target);state.dirty=true;}
function cancelTravel(){if(!state.animation)return;const flight=state.animation.type==='flight';state.animation=null;if(flight){setOverview(true);orbitFromCamera();selected('overview');}syncAngles();travelUI(false);}
function makePath(points){const distances=[0];for(let i=1;i<points.length;i++)distances.push(distances.at(-1)+Math.hypot(points[i].x-points[i-1].x,points[i].z-points[i-1].z));return{points,distances,length:distances.at(-1)};}
function samplePath(path,d){for(let i=1;i<path.points.length;i++){if(d<=path.distances[i]){const t=(d-path.distances[i-1])/(path.distances[i]-path.distances[i-1]||1);return{x:THREE.MathUtils.lerp(path.points[i-1].x,path.points[i].x,t),z:THREE.MathUtils.lerp(path.points[i-1].z,path.points[i].z,t)};}}return path.points.at(-1);}
function walkTo(name,then){
  const pose=manifest.views[name],points=navigator.findPath({x:camera.position.x,z:camera.position.z},{x:pose.pos[0],z:pose.pos[2]});
  if(!points.length){status('暂时无法到达这个位置，请先返回入口');return;}
  const route=makePath(roundWalkingPath(points,navigator));
  if(!motion||route.length<.03){setPose(pose);travelUI(false);then?.();return;}
  state.animation={type:'walk',path:route,duration:clamp(route.length/2.2,1.3,10),time:0,startQ:camera.quaternion.clone(),endQ:quaternion(pose),pose,name,then};travelUI(true);
}
function fly(toOverview,groundName='entrance'){
  const pose=manifest.views[toOverview?'overview':'entrance'];setOverview(true);
  if(!motion){setPose(pose);if(toOverview){orbitFromCamera();selected('overview');}else{setOverview(false);walkTo(groundName);}return;}
  const start=camera.position.clone(),end=new THREE.Vector3(...pose.pos),high=new THREE.Vector3(0,9,14);
  const curve=new THREE.CatmullRomCurve3([start,high,end],false,'centripetal');
  state.animation={type:'flight',curve,time:0,duration:3.7,startQ:camera.quaternion.clone(),endQ:quaternion(pose),pose,toOverview,groundName};travelUI(true);
}
function selectView(name,instant=false){
  if(!state.ready||!manifest.views[name])return;begin();clearInput();cancelTravel();$('#detail-panel').hidden=true;selected(name);
  if(instant||!motion){setOverview(name==='overview');setPose(manifest.views[name]);if(state.overview)orbitFromCamera();travelUI(false);return;}
  if(name==='overview'){if(state.overview)fly(true);else walkTo('entrance',()=>fly(true));}
  else if(state.overview)fly(false,name);else walkTo(name);
}
function updateTravel(dt){
  const a=state.animation;if(!a)return;a.time+=dt;const t=clamp(a.time/a.duration,0,1),u=easeCamera(t);
  if(a.type==='walk'){const p=samplePath(a.path,a.path.length*u);camera.position.set(p.x,a.pose.pos[1],p.z);}else camera.position.copy(a.curve.getPoint(u));
  camera.quaternion.slerpQuaternions(a.startQ,a.endQ,u);state.dirty=true;if(t<1)return;
  state.animation=null;setPose(a.pose);travelUI(false);
  if(a.type==='flight'){if(a.toOverview){orbitFromCamera();selected('overview');}else{setOverview(false);selected(a.groundName);walkTo(a.groundName);}}else a.then?.();
}
function turn(dx,dy){if(!state.ready)return;begin();cancelTravel();if(state.overview){orbit.theta-=dx*.005;orbit.phi=clamp(orbit.phi+dy*.004,.15,1.42);applyOrbit();}else{state.yaw-=dx*.004;state.pitch=clamp(state.pitch-dy*.0035,-1.35,1.35);camera.rotation.set(state.pitch,state.yaw,0,'YXZ');state.dirty=true;}}
function zoom(delta){if(!state.ready)return;cancelTravel();if(state.overview){orbit.radius=clamp(orbit.radius*Math.exp(delta*.001),10,52);applyOrbit();}else{camera.fov=clamp(camera.fov+delta*.026,43,80);camera.updateProjectionMatrix();state.dirty=true;}}
function movement(dt){
  if(state.overview||state.animation||!state.started)return;
  const forward=Number(state.keys.has('KeyW')||state.keys.has('ArrowUp')||state.pad.has('forward'))-Number(state.keys.has('KeyS')||state.keys.has('ArrowDown')||state.pad.has('backward'));
  const right=Number(state.keys.has('KeyD')||state.keys.has('ArrowRight')||state.pad.has('right'))-Number(state.keys.has('KeyA')||state.keys.has('ArrowLeft')||state.pad.has('left'));
  if(!forward&&!right)return;const speed=dt*2.15/Math.max(1,Math.hypot(forward,right));
  const p=navigator.move({x:camera.position.x,z:camera.position.z},(-Math.sin(state.yaw)*forward+Math.cos(state.yaw)*right)*speed,(-Math.cos(state.yaw)*forward-Math.sin(state.yaw)*right)*speed);
  camera.position.x=p.x;camera.position.z=p.z;state.dirty=true;status(p.blocked?'已到达边界 · 可沿通道继续参观':'自由行走 · 拖动环顾');
}
function bindInputs(){
  $$('[data-view]').forEach(b=>b.addEventListener('click',()=>selectView(b.dataset.view)));
  $('#enter-scene').addEventListener('click',()=>selectView('seats'));$('#reset-view').addEventListener('click',()=>selectView('entrance'));
  $('#toggle-roof').addEventListener('click',()=>{state.roof=!state.roof;shell();});
  $('#tour-skip').addEventListener('click',()=>selectView(state.animation?.toOverview?'overview':state.animation?.groundName||state.view,true));
  $('#toggle-motion').setAttribute('aria-pressed',String(motion));
  $('#toggle-motion').addEventListener('click',()=>{motion=!motion;override=true;try{localStorage.setItem('magpie-motion',motion?'on':'off');}catch{}$('#toggle-motion').setAttribute('aria-pressed',String(motion));if(!motion&&state.animation)$('#tour-skip').click();status(motion?'镜头过场已开启':'镜头过场已关闭');});
  $$('[data-light]').forEach(b=>b.addEventListener('click',()=>{state.light=b.dataset.light;$$('[data-light]').forEach(el=>{el.classList.toggle('is-active',el===b);el.setAttribute('aria-pressed',String(el===b));});state.dirty=true;}));
  for(const button of $$('[data-move]')){
    button.addEventListener('pointerdown',event=>{event.preventDefault();if(!state.ready||state.overview)return;begin();cancelTravel();button.setPointerCapture(event.pointerId);state.pad.add(button.dataset.move);button.classList.add('is-active');});
    const release=()=>{state.pad.delete(button.dataset.move);button.classList.remove('is-active');};for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,release);
  }
  canvas.addEventListener('pointerdown',event=>{if(!state.ready||event.button>0)return;begin();canvas.focus({preventScroll:true});canvas.setPointerCapture(event.pointerId);state.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});});
  canvas.addEventListener('pointermove',event=>{const old=state.pointers.get(event.pointerId);if(!old)return;const other=[...state.pointers.entries()].find(([id])=>id!==event.pointerId)?.[1];if(other){zoom((Math.hypot(old.x-other.x,old.y-other.y)-Math.hypot(event.clientX-other.x,event.clientY-other.y))*4);}else turn(event.clientX-old.x,event.clientY-old.y);state.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,event=>state.pointers.delete(event.pointerId));
  canvas.addEventListener('wheel',event=>{event.preventDefault();zoom(event.deltaY);},{passive:false});
  window.addEventListener('keydown',event=>{if($('dialog[open]')||/INPUT|TEXTAREA|SELECT/.test(event.target.tagName))return;if(!['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code))return;if(event.target.closest('button,a')&&event.code.startsWith('Arrow'))return;event.preventDefault();if(!state.ready||state.overview)return;begin();cancelTravel();state.keys.add(event.code);});
  window.addEventListener('keyup',event=>state.keys.delete(event.code));window.addEventListener('blur',clearInput);
  document.addEventListener('visibilitychange',()=>{clearInput();previousTime=0;state.dirty=true;});document.addEventListener('fullscreenchange',resize);
  reduced.addEventListener('change',()=>{if(!override){motion=!reduced.matches;$('#toggle-motion').setAttribute('aria-pressed',String(motion));if(!motion&&state.animation)$('#tour-skip').click();}state.dirty=true;});
  new ResizeObserver(resize).observe($('#scene-stage'));mobile.addEventListener('change',resize);
}
function buildHotspots(){
  for(const item of manifest.hotspots||[]){const b=document.createElement('button');b.type='button';b.className='hotspot';b.setAttribute('aria-label',item.title);b.title=item.title;b.innerHTML='<span class="hotspot-dot" aria-hidden="true">+</span><span class="hotspot-label"></span>';b.querySelector('.hotspot-label').textContent=item.title;b.addEventListener('click',()=>{clearInput();$('#detail-title').textContent=item.title;$('#detail-copy').textContent=item.body;$('#detail-panel').hidden=false;});$('#hotspots').append(b);hotspots.push({button:b,point:new THREE.Vector3(...item.pos)});}
}
function updateHotspots(time){
  if(time-lastHotspots<.1&&!state.dirty)return;lastHotspots=time;const rect=canvas.getBoundingClientRect();
  for(const{button,point}of hotspots){let visible=state.started&&!state.animation&&!state.overview;projected.copy(point).project(camera);visible&&=projected.z>-1&&projected.z<1&&Math.abs(projected.x)<.89&&Math.abs(projected.y)<.78&&point.distanceTo(camera.position)<12;if(visible){direction.subVectors(point,camera.position);const distance=direction.length();raycaster.set(camera.position,direction.normalize());raycaster.far=Math.max(0,distance-.18);visible=!raycaster.intersectObjects(occluders,false).length;}button.hidden=!visible;if(visible){button.style.left=`${(projected.x*.5+.5)*rect.width}px`;button.style.top=`${(-projected.y*.5+.5)*rect.height}px`;}}
}
function environmentMap(){
  const room=new THREE.Scene();room.background=new THREE.Color(0x45404b);room.add(new THREE.Mesh(new THREE.BoxGeometry(22,15,26),new THREE.MeshBasicMaterial({color:0x54464b,side:THREE.BackSide})));
  for(const[pos,size,color]of[[[-7,3,-4],[3,5],0xffbcb3],[[7,4,-5],[3,5],0xb3bbff],[[0,6,7],[7,2],0xffecd2]]){const p=new THREE.Mesh(new THREE.PlaneGeometry(...size),new THREE.MeshBasicMaterial({color}));p.position.fromArray(pos);p.lookAt(0,1,0);room.add(p);}
  const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(room,.15).texture;scene.environmentIntensity=.5;pmrem.dispose();room.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
}
function addLights(){
  ambient=new THREE.AmbientLight(0xffe9e0,.32);hemisphere=new THREE.HemisphereLight(0xaec8ff,0x47292d,.72);scene.add(ambient,hemisphere);
  for(const[pos,target,color,intensity,range,angle,shadow]of[
    [[-2.8,4,-4.9],[0,1,-7.3],0xff5090,75,14,.72,true],[[2.8,4,-5.3],[-1,.8,-7.8],0x6de4e9,65,14,.7,false],
    [[-3.5,3.7,2],[-3.5,0,2],0xffc58b,36,10,1.1,false],[[3.5,3.7,4],[3.5,0,4],0xffbd96,34,10,1.1,false],
    [[4.9,3.4,-3],[4,.8,-3],0xf6ae70,28,7,.95,false],[[0,4.6,11.5],[0,1.5,8.5],0xffbc9e,65,14,1.2,false]]){
    const light=new THREE.SpotLight(color,intensity,range,angle,.85,2);light.position.fromArray(pos);light.target.position.fromArray(target);light.castShadow=shadow;
    if(shadow){light.shadow.mapSize.set(1024,1024);light.shadow.bias=-.0006;light.shadow.normalBias=.035;}scene.add(light,light.target);lights.push({light,base:intensity,color:new THREE.Color(color)});
  }
  for(const[x,z,color]of[[-2.8,-4.9,0xff4391],[2.8,-5.3,0x59d2e9]]){const beam=new THREE.Mesh(new THREE.ConeGeometry(.95,3.6,24,1,true),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.035,depthWrite:false,side:THREE.DoubleSide}));beam.position.set(x,2.1,z-.65);beam.rotation.x=.22;scene.add(beam);beams.push(beam);}
}
const white=new THREE.Color(0xffead6);
function lighting(dt){
  const target=state.light==='visit'?1:0;lightBlend+=(target-lightBlend)*(reduced.matches?1:1-Math.exp(-dt*4));if(Math.abs(target-lightBlend)<.002)lightBlend=target;
  ambient.intensity=.32+lightBlend*.8;hemisphere.intensity=.72+lightBlend*1.25;scene.environmentIntensity=.48+lightBlend*.35;renderer.toneMappingExposure=1.02+lightBlend*.08;
  lights.forEach(({light,base,color},i)=>{light.color.copy(color).lerp(white,lightBlend*.85);light.intensity=base*(1+lightBlend*.15)*(i<2&&!reduced.matches&&state.light==='show'?1+Math.sin(elapsed*.55+i)*.065:1);});
  emissives.forEach(({material,base})=>{material.emissiveIntensity=base*(1-lightBlend*.55);});beams.forEach(b=>{b.visible=state.light==='show'&&!state.overview;});
}
function diagnostics(){Object.assign(canvas.dataset,{ready:'true',view:state.overview?'overview':state.view,light:state.light,animating:state.animation?.type||'false',position:JSON.stringify(camera.position.toArray().map(n=>+n.toFixed(3))),drawCalls:String(renderer.info.render.calls),triangles:String(renderer.info.render.triangles),roofVisible:String(roof?.visible),wallsVisible:String(walls?.visible),motion:String(motion)});}
function frame(ms){requestAnimationFrame(frame);if(!state.ready||document.hidden){previousTime=0;return;}const time=ms/1000,dt=previousTime?Math.min(time-previousTime,.05):.016;previousTime=time;elapsed+=dt;if(!$('dialog[open]')){updateTravel(dt);movement(dt);}const dynamic=!reduced.matches&&state.light==='show',changing=Math.abs(lightBlend-(state.light==='visit'?1:0))>.002;if(state.dirty||state.animation||changing||time-lastRender>(dynamic?1/30:1)){lighting(dt);camera.updateMatrixWorld();renderer.render(scene,camera);updateHotspots(time);diagnostics();state.dirty=false;lastRender=time;}}
function fail(error){console.error('Magpie scene unavailable',error);state.ready=false;canvas.dataset.ready='error';$('#loading').hidden=true;$('#fallback').hidden=false;$$('[data-view],[data-move],[data-light],#enter-scene,#toggle-roof,#reset-view,#tour-skip').forEach(b=>b.disabled=true);status('暂时无法打开三维场景，请刷新或查看实拍参考');}
async function initialize(){
  canvas.dataset.ready='loading';renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  scene=new THREE.Scene();scene.background=new THREE.Color(0x100e16);scene.fog=new THREE.Fog(0x100e16,36,75);camera=new THREE.PerspectiveCamera(66,1,.045,120);environmentMap();addLights();resize();
  const[data,gltf]=await Promise.all([fetch('./models/scene-manifest.json').then(r=>{if(!r.ok)throw Error(`Manifest ${r.status}`);return r.json();}),new GLTFLoader().loadAsync('./models/magpie-bar.glb',p=>{$('#loading-label').textContent=p.total?`正在打开完整酒馆 · ${Math.round(p.loaded/p.total*100)}%`:'正在打开完整酒馆';})]);
  manifest=data;navigator=createNavigator({areas:manifest.areas,obstacles:manifest.obstacles,radius:.23,gridStep:.25});model=gltf.scene;scene.add(model);roof=model.getObjectByName('Roof');walls=model.getObjectByName('Walls');
  const materials=new Set(),aniso=Math.min(renderer.capabilities.getMaxAnisotropy(),mobile.matches?4:8);
  model.traverse(o=>{if(o.isLight){o.visible=false;return;}if(!o.isMesh)return;o.castShadow=!/glass|neon|bloom/i.test(o.name);o.receiveShadow=true;if(o.parent===walls||o.parent?.name==='Facade')occluders.push(o);for(const mat of Array.isArray(o.material)?o.material:[o.material]){if(materials.has(mat))continue;materials.add(mat);for(const value of Object.values(mat))if(value?.isTexture)value.anisotropy=aniso;if(mat.emissive?.getHex()>0)emissives.push({material:mat,base:mat.emissiveIntensity||1});}});
  bindInputs();buildHotspots();setPose(manifest.views.entrance);selected('entrance');shell();lighting(.016);if(renderer.compileAsync)await renderer.compileAsync(scene,camera);renderer.render(scene,camera);renderer.shadowMap.autoUpdate=false;state.ready=true;$('#loading').hidden=true;status('场景已就绪 · 走进喜鹊酒馆');diagnostics();requestAnimationFrame(frame);
}
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();fail(Error('WebGL context lost'));});
initialize().catch(fail);
