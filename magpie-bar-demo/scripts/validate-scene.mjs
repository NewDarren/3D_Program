import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {validateGlb} from '../../cave-dinner-demo/scripts/export-glb.mjs';
import {createNavigator} from '../../cave-dinner-demo/navigation.mjs';
import {roundWalkingPath} from '../../cave-dinner-demo/camera-motion.mjs';

const base=new URL('../models/',import.meta.url);
const bytes=await readFile(new URL('magpie-bar.glb',base));
const manifest=JSON.parse(await readFile(new URL('scene-manifest.json',base),'utf8'));
validateGlb(bytes);
assert.equal(manifest.file,'magpie-bar.glb');
assert.equal(manifest.byteLength,bytes.length,'Manifest must match the exported binary');
const jsonLength=bytes.readUInt32LE(12);
const gltf=JSON.parse(bytes.subarray(20,20+jsonLength).toString('utf8').trim());
const binaryStart=20+jsonLength+8;
function attribute(index){
  const a=gltf.accessors[index],v=gltf.bufferViews[a.bufferView],width={VEC2:2,VEC3:3}[a.type];
  assert.equal(a.componentType,5126,'Text attributes should be FLOAT');
  const start=binaryStart+(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||width*4;
  return Array.from({length:a.count},(_,i)=>Array.from({length:width},(_,j)=>bytes.readFloatLE(start+i*stride+j*4)));
}
let textSurfaces=0;
for(const name of ['Illuminated facade lettering','Stage LED artwork','Table menu']){
  const material=gltf.materials.findIndex(m=>m.name===name);
  const primitives=gltf.meshes.flatMap(m=>m.primitives).filter(p=>p.material===material);
  assert.ok(primitives.length,`Missing ${name}`);
  for(const p of primitives){
    const positions=attribute(p.attributes.POSITION),uvs=attribute(p.attributes.TEXCOORD_0);
    const top=Math.max(...positions.map(p=>p[1])),bottom=Math.min(...positions.map(p=>p[1]));
    positions.forEach(([x,y],i)=>{
      if(Math.abs(y-top)<1e-4)assert.ok(uvs[i][1]<.001,`${name}: top must sample top of image`);
      if(Math.abs(y-bottom)<1e-4)assert.ok(uvs[i][1]>.999,`${name}: bottom must sample bottom of image`);
    });
    if(name!=='Table menu'){
      const left=Math.min(...positions.map(p=>p[0])),right=Math.max(...positions.map(p=>p[0]));
      positions.forEach(([x],i)=>{
        if(Math.abs(x-left)<1e-4)assert.ok(uvs[i][0]<.001,`${name}: not mirrored horizontally`);
        if(Math.abs(x-right)<1e-4)assert.ok(uvs[i][0]>.999);
      });
      attribute(p.attributes.NORMAL).forEach(n=>assert.ok(n[2]>.99,'Lettering must face the visitor'));
    }
    textSurfaces++;
  }
}
const lanterns=manifest.geometryQA.lanternClearances;
assert.equal(lanterns.length,10);
lanterns.forEach(l=>assert.ok(l.clearance>=.2,`${l.name} overlaps or is too close to ${l.nearest}: ${l.clearance}`));
const nav=createNavigator({...manifest,radius:.23,gridStep:.25});
const views=Object.entries(manifest.views).filter(([name])=>name!=='overview');
let routes=0;
for(const[from,a]of views)for(const[to,b]of views){
  const start={x:a.pos[0],z:a.pos[2]},end={x:b.pos[0],z:b.pos[2]};
  assert.ok(nav.canStand(start.x,start.z),`${from} must be walkable`);
  const path=nav.findPath(start,end);assert.ok(path.length,`${from} to ${to} unreachable`);
  const rounded=roundWalkingPath(path,nav);
  rounded.slice(1).forEach((p,i)=>assert.ok(nav.canTraverse(rounded[i],p),`${from} to ${to} crosses furniture/wall`));
  routes++;
}
for(const[from,delta]of[[{x:0,z:-5.9},{x:0,z:-10}],[{x:1.9,z:-2.75},{x:6,z:0}],[{x:0,z:12},{x:20,z:0}]]){
  const result=nav.move(from,delta.x,delta.z);
  assert.ok(result.blocked,'Movement should stop at stage, bar and exterior boundaries');
  assert.ok(nav.canStand(result.x,result.z));
}
for(const group of ['Roof','Walls','Facade','Floor','Seating','Stage','Bar','Decor'])assert.ok(gltf.nodes.some(n=>n.name===group),`Missing complete-model group ${group}`);
console.log(JSON.stringify({model:fileURLToPath(new URL('magpie-bar.glb',base)),bytes:bytes.length,textSurfaces,lanterns:lanterns.length,minLanternClearance:Math.min(...lanterns.map(l=>l.clearance)),walkableRoutes:routes,completeGroups:8,result:'PASS'},null,2));
