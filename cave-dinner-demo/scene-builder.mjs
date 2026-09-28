import * as THREE from './vendor/three.module.min.js';
import { mergeVertices } from './vendor/utils/BufferGeometryUtils.js';
import signOutlines from './models/sign-outlines.json' with { type:'json' };

// Authoring model in metres. Coordinates are design estimates, not a site survey.
// Run scripts/export-glb.mjs to turn these authored surfaces into the delivered GLB.
export function buildRestaurant() {
  const root = new THREE.Group(); root.name = 'Yangshuo_Cave_Restaurant';
  root.userData = { venue:'岩洞餐厅 · 千古情店', unit:'metre', reconstruction:'Reference-led interpretation; dimensions and occluded areas inferred.' };
  const groups = {};
  for(const name of ['ShellRoof','ShellWalls','Facade','Grounds','Dining','Service','Plants','Fixtures','Lights']) {
    const g = new THREE.Group(); g.name=name; root.add(g); groups[name]=g;
  }
  let seed=109237;
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const clamp=THREE.MathUtils.clamp;
  const textures={};
  function texture(file){
    if(textures[file])return textures[file];
    const t=new THREE.Texture();t.name=file;t.userData.uri=`textures/${file}`;t.flipY=false;
    t.wrapS=t.wrapT=THREE.RepeatWrapping;return textures[file]=t;
  }
  function mat(name,color,extra={}){const m=new THREE.MeshStandardMaterial({color,roughness:.75,...extra});m.name=name;return m;}
  const rock=mat('Limestone_PBR_CC0',0xaaa397,{map:texture('rock-color.jpg'),normalMap:texture('rock-normal.jpg'),normalScale:new THREE.Vector2(.72,.72),roughnessMap:texture('rock-arm.jpg'),aoMap:texture('rock-arm.jpg'),aoMapIntensity:.48,roughness:1,side:THREE.DoubleSide});
  const rockOuter=rock.clone();rockOuter.name='Exterior_Limestone';rockOuter.color.set(0x85877b);
  const wood=mat('Warm_Elm',0xd9c8a8,{map:texture('elm-color.jpg'),roughness:.48});
  const woodPale=wood.clone();woodPale.name='Light_Elm';woodPale.color.set(0xf3dfb9);
  const cane=mat('Woven_Cane',0xe8d4ad,{map:texture('cane-color.jpg'),roughness:.9});
  const paver=mat('Warm_Grey_Pavers',0xc2bbaa,{map:texture('pavers-color.jpg'),roughness:.85});
  const m={rock,rockOuter,wood,woodPale,cane,paver,
    dark:mat('Black_Painted_Steel',0x222823,{metalness:.4,roughness:.38}),
    olive:mat('Olive_Entrance_Joinery',0x414e3b,{metalness:.16,roughness:.53}),
    bronze:mat('Aged_Bronze',0x88764c,{metalness:.77,roughness:.33}),
    chrome:mat('Brushed_Silver',0xb6b6b0,{metalness:.94,roughness:.21}),
    cream:mat('Ivory_Table_Stone',0xe5dfcd,{roughness:.36}),
    plaster:mat('Warm_White_Partition',0xc9c6b5,{roughness:.84}),
    ceramic:mat('Celadon_Tea_Service',0xe8e2b7,{roughness:.23}),
    ink:mat('Ceramic_Dark_Edge',0x424631,{roughness:.31}),
    linen:mat('Linen_Napkin',0xc0ad8a,{roughness:.95}),
    seat:mat('Charcoal_Seat',0x262925,{roughness:.81}),
    bottle:mat('Green_Wine_Bottle',0x13231a,{metalness:.08,roughness:.18}),
    label:mat('Reserve_Label',0xffffff,{map:texture('wine-label.png'),roughness:.76}),
    wine:mat('Red_Wine',0x4a0812,{metalness:.1,roughness:.16}),
    leaf:mat('Palm_Leaf',0x304128,{roughness:.74,side:THREE.DoubleSide}),
    leafLight:mat('New_Leaf',0x617148,{roughness:.72,side:THREE.DoubleSide}),
    soil:mat('Soil',0x292820,{roughness:1}),
    gravel:mat('Courtyard_Gravel',0x999b8b,{roughness:.98}),
    glow:mat('Warm_Diffuser',0xffe7b2,{emissive:0xffca77,emissiveIntensity:2.1,roughness:.7}),
    whiteGlow:mat('Service_Cool_Diffuser',0xc9e0ed,{emissive:0xb8d7e6,emissiveIntensity:.9}),
    wick:mat('Candle_Flame',0xffe3a5,{emissive:0xffb85d,emissiveIntensity:3}),
    glass:new THREE.MeshPhysicalMaterial({name:'Clear_Glass',color:0xc8d2cc,roughness:.11,metalness:.08,transparent:true,opacity:.22,depthWrite:false,side:THREE.DoubleSide}),
  };
  const obstacles=[];
  function group(name,parent=groups.Dining,p=[0,0,0],rotation=0){const g=new THREE.Group();g.name=name;g.position.set(...p);g.rotation.y=rotation;parent.add(g);return g;}
  function mesh(g,material,parent,p=[0,0,0],rot=[0,0,0],name=''){
    const o=new THREE.Mesh(g,material);o.name=name||material.name;o.position.set(...p);o.rotation.set(...rot);parent.add(o);return o;
  }
  function box(w,h,d,material,parent,p,rot){return mesh(new THREE.BoxGeometry(w,h,d),material,parent,p,rot);}
  function cyl(a,b,h,material,parent,p,n=20){return mesh(new THREE.CylinderGeometry(a,b,h,n),material,parent,p);}
  function ball(s,material,parent,p,n=12){const o=mesh(new THREE.SphereGeometry(1,n,Math.max(6,n/2)),material,parent,p);o.scale.set(...s);return o;}
  function tube(points,r,material,parent,n=18){return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),n,r,6,false),material,parent);}
  function edgeBetween(a,b,r,material,parent){const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b);const o=cyl(r,r,va.distanceTo(vb),material,parent,va.clone().add(vb).multiplyScalar(.5).toArray(),7);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),vb.sub(va).normalize());return o;}
  function obstacleCircle(x,z,r){obstacles.push({type:'circle',x,z,r});}
  function obstacleBox(x,z,w,d){obstacles.push({type:'box',minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2});}
  function hash(x,y){const v=Math.sin(x*127.1+y*311.7)*43758.5453;return v-Math.floor(v);}
  function noise(x,y){const a=Math.floor(x),b=Math.floor(y);let u=x-a,v=y-b;u=u*u*(3-2*u);v=v*v*(3-2*v);return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(a,b),hash(a+1,b),u),THREE.MathUtils.lerp(hash(a,b+1),hash(a+1,b+1),u),v);}
  function fbm(x,z){return .56*noise(x,z)+.26*noise(x*2.03+21,z*2.03)+.12*noise(x*4.13,z*4.13+3)+.06*noise(x*8.19,z*8.19);}
  const zFront=10.8,zBack=-9.8;
  function wallX(side,z){return side*(7.05+.22*Math.sin(z*.45)+.12*Math.sin(z*.91+side));}
  function roofY(x,z){
    const slab=Math.exp(-(((x-4.35)/2.7)**2)-((z+1.0)/6.5)**2);
    const leftRidge=Math.exp(-(((x+3.5)/2.0)**2)-((z-2.0)/5.8)**2);
    const fractured=fbm(x*.65,z*.65);
    const plate=THREE.MathUtils.smoothstep(fractured,.34,.54);
    return 5.25-1.63*slab-.40*leftRidge+.20*Math.sin(z*.51)+.30*Math.cos(x*.52+z*.18)+.27*(plate-.5)+.17*(fbm(x*2.1,z*2.1)-.5);
  }
  // Closed surface pairs with a joined perimeter give every shell part physical thickness.
  function thickSurface(name,nu,nv,inner,outer,uvFn,parent,material=rock){
    const pos=[],uv=[],colors=[],index=[];const layerSize=(nu+1)*(nv+1);
    for(let layer=0;layer<2;layer++)for(let j=0;j<=nv;j++)for(let i=0;i<=nu;i++){
      const u=i/nu,v=j/nv,p=(layer?outer:inner)(u,v);pos.push(...p);uv.push(...uvFn(p,u,v));
      const detail=.80+.20*fbm(p[0]*.43+8,p[2]*.49+p[1]*.6);colors.push(detail,detail*.985,detail*.96);
    }
    for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){
      const a=j*(nu+1)+i,b=a+nu+1,c=a+1,d=b+1;
      index.push(a,b,c,b,d,c,a+layerSize,c+layerSize,b+layerSize,b+layerSize,c+layerSize,d+layerSize);
    }
    const perimeter=[];for(let i=0;i<=nu;i++)perimeter.push(i);for(let j=1;j<=nv;j++)perimeter.push(j*(nu+1)+nu);for(let i=nu-1;i>=0;i--)perimeter.push(nv*(nu+1)+i);for(let j=nv-1;j>0;j--)perimeter.push(j*(nu+1));
    for(let i=0;i<perimeter.length;i++){const a=perimeter[i],b=perimeter[(i+1)%perimeter.length];index.push(a,b,a+layerSize,b,b+layerSize,a+layerSize);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(index);g.computeVertexNormals();
    const mt=material.clone();mt.vertexColors=true;mt.name=material.name;const o=mesh(g,mt,parent,[0,0,0],[0,0,0],name);o.userData={solid:true,part:name};return o;
  }
  const top=(u,v)=>{const z=zBack+(zFront-zBack)*v,x=THREE.MathUtils.lerp(wallX(-1,z),wallX(1,z),u);return [x,roofY(x,z),z];};
  thickSurface('Continuous_Thick_Cave_Roof',126,180,top,(u,v)=>{const p=top(u,v);p[1]+=1.65+.12*Math.sin(p[0]);return p;},p=>[p[0]/2.8,p[2]/2.8],groups.ShellRoof);
  for(const side of [-1,1]){
    const face=(u,v)=>{const z=zBack+(zFront-zBack)*u,x0=wallX(side,z),h=roofY(x0,z);const inset=Math.sin(v*Math.PI)*(.18+.3*fbm(z*.65,v*3.5));return [x0-side*inset,-.2+(h+.2)*v,z];};
    thickSurface(side<0?'Left_Cave_Wall':'Right_Cave_Wall',150,40,face,(u,v)=>{const p=face(u,v);p[0]+=side*1.4;return p;},p=>[p[2]/2.8,p[1]/2.8],groups.ShellWalls);
  }
  const rear=(u,v)=>{const x=THREE.MathUtils.lerp(wallX(-1,zBack),wallX(1,zBack),u);return [x,-.2+(roofY(x,zBack)+.2)*v,zBack+Math.sin(u*Math.PI)*Math.sin(v*Math.PI)*.27];};
  thickSurface('Closed_Rear_Rock_Wall',88,42,rear,(u,v)=>{const p=rear(u,v);p[2]-=1.3;return p;},p=>[p[0]/2.8,p[1]/2.8],groups.ShellWalls);
  const frontUpper=(u,v)=>{const x=THREE.MathUtils.lerp(wallX(-1,zFront),wallX(1,zFront),u);return [x,3.22+(roofY(x,zFront)-3.22)*v,zFront];};
  thickSurface('Rock_Above_Entrance',88,20,frontUpper,(u,v)=>{const p=frontUpper(u,v);p[2]+=.9;return p;},p=>[p[0]/2.8,p[1]/2.8],groups.Facade);
  box(.85,3.6,1.15,rock,groups.Facade,[-6.92,1.55,10.9]);
  box(3.8,3.6,1.15,rock,groups.Facade,[5.25,1.55,10.9]);

  // Floor with side platforms and real edge strips. Paving UVs are in metres.
  function pavedBox(w,h,d,parent,p,material=m.paver){const g=new THREE.BoxGeometry(w,h,d);const uv=g.attributes.uv,n=g.attributes.normal,ps=g.attributes.position;for(let i=0;i<uv.count;i++){if(Math.abs(n.getY(i))>.5)uv.setXY(i,(ps.getX(i)+p[0])/2,(ps.getZ(i)+p[2])/2);}return mesh(g,material,parent,p);}
  pavedBox(14.5,.28,21.2,groups.Grounds,[0,-.2,.4]);
  for(const side of [-1,1]){
    pavedBox(5.45,.10,18.9,groups.Grounds,[side*4.1,-.01,.15]);
    box(.035,.019,18.8,m.glow,groups.Fixtures,[side*1.37,.049,.15]);
    box(.035,.06,18.8,m.dark,groups.Grounds,[side*1.41,.01,.15]);
  }
  pavedBox(23,.34,11.6,groups.Grounds,[0,-.29,16.2],m.gravel);
  pavedBox(10.0,.13,2,groups.Grounds,[-1.55,-.08,11.8]);
  for(let z=13.4;z<19.5;z+=.84)pavedBox(2.0,.14,.65,groups.Grounds,[1.65,-.06,z]);

  // Distinctive dark olive shopfront: wide glazing to the left, double door on the right.
  const facade=groups.Facade;
  box(10.1,.37,.42,m.olive,facade,[-1.57,3.03,11.12]);
  box(10.25,.085,.62,m.olive,facade,[-1.57,3.26,11.15]);
  box(10.25,.07,.59,m.olive,facade,[-1.57,2.8,11.12]);
  for(const x of [-6.55,-3.85,-1.1,.55,2.8])box(.11,2.82,.22,m.olive,facade,[x,1.39,11.03]);
  for(const [x,w] of [[-5.2,2.58],[-2.48,2.62],[-.26,1.55]]){
    box(w,.48,.16,m.olive,facade,[x,.25,11.04]);
    box(w,2.25,.028,m.glass,facade,[x,1.67,11.07]);
    box(w,.065,.18,m.olive,facade,[x,.53,11.08]);
    for(let sx=x-w/2+.06;sx<x+w/2;sx+=.11)box(.028,.33,.04,m.dark,facade,[sx,.25,11.135]);
  }
  for(const side of [-1,1]){
    const door=group('Open_Door_Leaf',facade,[side<0?.58:2.77,0,11.03],side<0?-1.24:1.24);
    const dx=side<0?.49:-.49;
    for(const yy of [.1,.75,2.71])box(.97,.09,.09,m.olive,door,[dx,yy,0]);
    for(const xx of [dx-.46,dx+.46])box(.07,2.75,.11,m.olive,door,[xx,1.37,0]);
    box(.85,1.87,.027,m.glass,door,[dx,1.73,0]);box(.84,.55,.055,m.olive,door,[dx,.4,0]);
    edgeBetween([dx+(side<0?.29:-.29),.98,.12],[dx+(side<0?.29:-.29),1.38,.12],.022,m.chrome,door);
  }
  // Solid individual glyphs, like the pale raised lettering directly on the real rock.
  function lettering(text,height,centerX,y,z,spacing=.07){
    const advances=[...text].map(ch=>signOutlines[ch].advance*height+spacing),total=advances.reduce((a,b)=>a+b,0)-spacing;
    let x=centerX-total/2;
    for(const [i,ch] of [...text].entries()){
      const path=new THREE.ShapePath();
      for(const c of signOutlines[ch].commands){
        const p=c.slice(1).map(n=>n*height);
        if(c[0]==='m')path.moveTo(...p);if(c[0]==='l')path.lineTo(...p);if(c[0]==='q')path.quadraticCurveTo(...p);if(c[0]==='c')path.bezierCurveTo(...p);if(c[0]==='z')path.currentPath.closePath();
      }
      const shapes=path.toShapes(false);
      if(shapes.length)mesh(new THREE.ExtrudeGeometry(shapes,{depth:.06,bevelEnabled:true,bevelSize:.003,bevelThickness:.003,bevelSegments:1,curveSegments:5}),m.cream,facade,[x,y,z]);
      x+=advances[i];
    }
  }
  lettering('岩洞餐厅',.94,-1.10,3.90,11.77,.07);
  lettering('CAVE RESTAURANT',.28,-1.10,3.48,11.78,.032);
  const logo=group('Cave_Sign_Emblem',facade,[-4.15,3.58,11.78]);
  box(.14,.97,.065,m.cream,logo,[-.36,.46,0],[0,0,-.13]);box(.14,.97,.065,m.cream,logo,[.36,.46,0],[0,0,.13]);
  box(.54,.13,.065,m.cream,logo,[0,.93,0]);box(1.14,.035,.065,m.cream,logo,[0,.01,0]);
  tube([[.1,1.10,0],[-.12,.9,0],[.12,.65,0],[-.12,.36,0]],.018,m.cream,logo,18);
  // Rock ledge and side planters enclose the courtyard sightlines.
  for(const side of [-1,1]){
    const g=new THREE.BoxGeometry(2.7,3.2,10.5,8,6,24),p=g.attributes.position;
    for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);p.setXYZ(i,x+(fbm(z*.6,y*.6)-.5)*.5,y+(fbm(x,z)-.5)*.3,z);}
    g.computeVertexNormals();mesh(g,rockOuter,groups.Grounds,[side*11.3,1.1,15.8]);
    box(2.0,.5,9.2,m.plaster,groups.Grounds,[side*9.6,.1,16.1]);
  }
  box(23,2.6,1.4,rockOuter,groups.Grounds,[0,.95,21.3]);
  box(21,.47,1.1,m.plaster,groups.Grounds,[0,.10,20.1]);

  function curvedBack(parent,material){
    const shape=new THREE.Shape(),outer=.29,inner=.265,lo=-1.3,hi=1.3;
    for(let i=0;i<=22;i++){const a=lo+(hi-lo)*i/22,x=Math.sin(a)*outer,z=Math.cos(a)*outer;i?shape.lineTo(x,z):shape.moveTo(x,z);}
    for(let i=22;i>=0;i--){const a=lo+(hi-lo)*i/22;shape.lineTo(Math.sin(a)*inner,Math.cos(a)*inner);}shape.closePath();
    const geo=new THREE.ExtrudeGeometry(shape,{depth:.30,bevelEnabled:true,bevelThickness:.006,bevelSize:.006,bevelSegments:1,steps:1});
    mesh(geo,material,parent,[0,.86,0],[Math.PI/2,0,0]);
  }
  function chair(parent,x,z,a,woven=false){
    const g=group(woven?'Woven_Dining_Chair':'Curved_Elm_Chair',parent,[x,.05,z],a);
    if(woven){
      box(.43,.045,.44,m.cane,g,[0,.44,0]);
      for(const sx of [-1,1]){
        box(.038,.88,.04,m.woodPale,g,[sx*.215,.44,.19]);
        box(.038,.44,.04,m.woodPale,g,[sx*.215,.22,-.19]);
      }
      box(.45,.042,.05,m.woodPale,g,[0,.87,.19]);box(.4,.29,.027,m.cane,g,[0,.70,.19]);
      for(const side of [-1,1])box(.03,.035,.40,m.woodPale,g,[side*.215,.30,0]);
    }else{
      cyl(.265,.258,.065,m.seat,g,[0,.46,0],24);curvedBack(g,m.wood);
      for(const sx of [-1,1])for(const sz of [-1,1])edgeBetween([sx*.20,.44,sz*.17],[sx*.255,0,sz*.23],.013,m.dark,g);
      tube([[-.26,.65,.12],[-.28,.66,-.13],[-.23,.60,-.22]],.014,m.wood,g,8);
      tube([[.26,.65,.12],[.28,.66,-.13],[.23,.60,-.22]],.014,m.wood,g,8);
    }
  }
  function wineGlass(parent,x,y,z){
    const g=group('Wine_Glass',parent,[x,y,z]);
    cyl(.046,.052,.009,m.glass,g,[0,.008,0],18);cyl(.005,.005,.112,m.glass,g,[0,.063,0],7);
    const profile=[[.008,.116],[.046,.132],[.057,.170],[.052,.21],[.044,.249],[.041,.249],[.049,.21],[.053,.170],[.042,.135],[.008,.123]].map(p=>new THREE.Vector2(...p));
    mesh(new THREE.LatheGeometry(profile,20),m.glass,g);
    cyl(.051,.038,.032,m.wine,g,[0,.153,0],20);
  }
  function bottle(parent,x,y,z){
    const g=group('Wine_Bottle',parent,[x,y,z]);
    mesh(new THREE.LatheGeometry([[0,0],[.052,0],[.054,.21],[.049,.24],[.019,.29],[.018,.37],[.021,.38]].map(p=>new THREE.Vector2(...p)),24),m.bottle,g);
    cyl(.020,.020,.05,m.wine,g,[0,.362,0],18);
    mesh(new THREE.CylinderGeometry(.055,.055,.115,24,1,true),m.label,g,[0,.153,0]);
  }
  function candle(parent,x,y,z,h){
    cyl(.035,.043,.018,m.bronze,parent,[x,y+.012,z],16);cyl(.021,.022,h,m.cream,parent,[x,y+.022+h/2,z],12);
    const f=ball([.011,.027,.011],m.wick,parent,[x,y+h+.05,z],8);f.name='Flame';
  }
  function teaSetting(parent,x,z,a,y=.805,withWine=false){
    const g=group('Tea_Setting',parent,[x,y,z],a);
    cyl(.137,.119,.016,m.ceramic,g,[0,.013,0],24);
    mesh(new THREE.TorusGeometry(.13,.0025,5,24),m.ink,g,[0,.024,0],[Math.PI/2,0,0]);
    const bowlPts=[[.044,0],[.049,.012],[.063,.063],[.058,.067],[.044,.018],[.040,.008]].map(p=>new THREE.Vector2(...p));
    mesh(new THREE.LatheGeometry(bowlPts,18),m.ceramic,g,[-.033,.026,0]);
    mesh(new THREE.TorusGeometry(.059,.0028,5,18),m.ink,g,[-.033,.093,0],[Math.PI/2,0,0]);
    cyl(.043,.035,.058,m.ceramic,g,[.083,.054,.08],16);
    mesh(new THREE.TorusGeometry(.035,.006,6,14,Math.PI*1.35),m.ceramic,g,[.127,.064,.08],[0,0,-.68]);
    for(const x0 of [.195,.215])box(.006,.006,.245,m.ink,g,[x0,.015,.02],[0,.11,0]);
    box(.078,.012,.025,m.ceramic,g,[.204,.013,-.05]);
    box(.14,.012,.09,m.linen,g,[-.15,.01,.0],[0,.18,0]);
    if(withWine)wineGlass(g,.15,.006,-.17);
  }
  function flowers(parent,x,y,z){
    cyl(.065,.045,.13,m.glass,parent,[x,y+.065,z],16);
    for(let i=0;i<7;i++){
      const a=i*2.4,px=x+Math.sin(a)*.078,pz=z+Math.cos(a)*.078,py=y+.25+rand()*.055;
      edgeBetween([x,y+.06,z],[px,py,pz],.003,m.leaf,parent);
      for(let j=0;j<5;j++){const b=j*1.256;ball([.025,.012,.027],m.cream,parent,[px+Math.sin(b)*.02,py,pz+Math.cos(b)*.02],8);}
    }
  }
  function roundTable(x,z,r,n=8,hero=false){
    const g=group(hero?'Private_Wine_Dinner':'Round_Dining_Table',groups.Dining,[x,.055,z]);
    cyl(r,r-.015,.065,m.cream,g,[0,.75,0],48);cyl(.25,.43,.715,m.woodPale,g,[0,.37,0],32);
    cyl(r*.57,r*.57,.022,m.cream,g,[0,.80,0],40);cyl(.12,.15,.025,m.chrome,g,[0,.775,0],20);
    for(let i=0;i<n;i++){
      const a=i/n*Math.PI*2;chair(g,Math.sin(a)*(r+.33),Math.cos(a)*(r+.33),a);
      teaSetting(g,Math.sin(a)*(r-.22),Math.cos(a)*(r-.22),a,.784,hero);
    }
    flowers(g,0,.813,.04);
    if(hero){bottle(g,-.26,.813,-.09);bottle(g,-.37,.813,.11);candle(g,.31,.813,-.1,.17);candle(g,.24,.813,.17,.25);}
    // Menu on a small wooden stand.
    box(.19,.022,.095,m.wood,g,[.13,.798,-.27]);box(.155,.20,.015,m.label,g,[.13,.903,-.27],[.04,0,0]);
    obstacleCircle(x,z,r+.62);return g;
  }
  function longTable(x,z,w=1.8,d=.93){
    const g=group('Rectangular_Table',groups.Dining,[x,.055,z]);
    box(w,.065,d,m.woodPale,g,[0,.75,0]);
    for(const sx of [-1,1])for(const sz of [-1,1])box(.045,.73,.045,m.woodPale,g,[sx*(w/2-.1),.375,sz*(d/2-.09)]);
    for(const xx of [-w*.27,w*.27])for(const s of [-1,1]){chair(g,xx,s*(d/2+.30),s<0?Math.PI:0,true);teaSetting(g,xx,s*(d/2-.17),s<0?Math.PI:0,.787);}
    flowers(g,0,.783,0);cyl(.055,.052,.24,m.ceramic,g,[.18,.905,0],18);box(.016,.075,.016,m.ink,g,[.21,1.025,.0]);
    obstacleBox(x,z,w+.2,d+1.10);
  }
  roundTable(3.25,3.45,1.13,8,true);roundTable(3.65,-1.85,1.03,7);roundTable(3.8,-6.25,1.02,7);
  longTable(-3.45,6.4);longTable(-3.55,2.7);longTable(-3.75,-1.15);longTable(-4.1,-5.1);
  // Rear-right platform has a low planter divider and smaller dining tables.
  box(4.55,.64,.24,m.plaster,groups.Service,[3.94,.34,-8.40]);
  box(4.7,.065,.36,m.cream,groups.Service,[3.94,.68,-8.40]);
  obstacleBox(3.94,-8.40,4.7,.36);

  function arcLamp(x,z,dir=-1){
    cyl(.25,.29,.065,m.dark,groups.Fixtures,[x,.095,z],24);
    const px=x+dir*1.48;
    tube([[x,.13,z],[x,1.55,z],[x+dir*.25,2.30,z],[x+dir*1.02,2.55,z],[px,2.20,z]],.014,m.chrome,groups.Fixtures,28);
    const shade=mesh(new THREE.SphereGeometry(.265,32,16,0,Math.PI*2,0,Math.PI/2),m.chrome,groups.Fixtures,[px,2.14,z]);
    cyl(.23,.23,.014,m.glow,groups.Fixtures,[px,2.14,z],24);
    obstacleCircle(x,z,.30);
  }
  arcLamp(5.25,3.7);arcLamp(5.6,-1.7);arcLamp(5.75,-6.1);
  function straightLamp(x,z){
    cyl(.2,.23,.04,m.dark,groups.Fixtures,[x,.08,z]);
    edgeBetween([x,.1,z],[x,2.14,z],.018,m.dark,groups.Fixtures);
    edgeBetween([x-.05,2.12,z],[x+1.02,2.00,z],.016,m.dark,groups.Fixtures);
    const shade=cyl(.105,.215,.24,m.dark,groups.Fixtures,[x+.97,1.82,z],24);
    cyl(.20,.20,.012,m.glow,groups.Fixtures,[x+.97,1.70,z],20);obstacleCircle(x,z,.24);
  }
  straightLamp(-5.25,5.9);straightLamp(-5.5,-1.0);

  // Real restaurant-style cabinets, tea station and glazed drinks fridge.
  const service=group('Tea_And_Drinks_Service',groups.Service,[0,0,0]);
  box(4.65,.83,.64,m.plaster,service,[-2.42,.455,-8.9]);box(4.84,.05,.77,m.woodPale,service,[-2.42,.895,-8.9]);
  for(let i=0;i<6;i++){
    const x=-4.40+i*.79;box(.72,.66,.021,m.woodPale,service,[x,.48,-8.562]);
    box(.018,.15,.025,m.chrome,service,[x+.25,.60,-8.537]);
  }
  for(let i=0;i<4;i++){
    const x=-4.12+i*.32;cyl(.075,.072,.22,m.ceramic,service,[x,1.025,-8.82]);cyl(.055,.063,.05,m.ink,service,[x,1.16,-8.82]);
  }
  box(.58,.035,.29,m.chrome,service,[-1.15,.945,-8.8]);
  for(let i=0;i<8;i++)cyl(.044,.039,.04,m.ceramic,service,[-1.35+(i%4)*.10,.985+Math.floor(i/4)*.04,-8.8],12);
  box(.5,.34,.33,m.dark,service,[-.47,1.085,-8.83]);box(.42,.18,.016,m.chrome,service,[-.47,1.08,-8.652]);
  obstacleBox(-2.42,-8.9,4.85,.8);
  // Fridge situated at right rear, as visible in main-dining references.
  const fridge=group('Drinks_Refrigerator',service,[6.18,.05,-6.8],-.5*Math.PI);
  box(.83,1.95,.67,m.dark,fridge,[0,.975,0]);
  box(.74,1.72,.055,m.whiteGlow,fridge,[0,.94,.345]);
  for(let shelf=0;shelf<4;shelf++){
    box(.71,.025,.40,m.chrome,fridge,[0,.25+shelf*.40,.365]);
    for(let i=0;i<5;i++){cyl(.038,.038,.17,i%2?m.ceramic:m.bottle,fridge,[-.27+i*.135,.36+shelf*.40,.46],12);}
  }
  box(.77,1.74,.015,m.glass,fridge,[0,.95,.52]);box(.023,.57,.025,m.chrome,fridge,[.28,1.06,.545]);
  obstacleBox(6.18,-6.8,.9,1.05);
  // Low front welcome desk, justified by entrance video, with a discreet menu.
  box(1.30,.90,.58,m.wood,groups.Service,[4.5,.47,9.5]);box(1.37,.055,.66,m.dark,groups.Service,[4.5,.945,9.5]);
  box(.28,.022,.2,m.label,groups.Service,[4.55,.99,9.5],[.1,0,0]);obstacleBox(4.5,9.5,1.4,.75);

  function leafBlade(length,width,bend=.18){
    const p=[],uv=[],idx=[];for(let i=0;i<=8;i++){
      const t=i/8,w=Math.pow(Math.sin(Math.PI*t),.75)*width;
      p.push(-w,t*length,Math.sin(t*Math.PI)*bend,0,t*length,Math.sin(t*Math.PI)*bend+.012,w,t*length,Math.sin(t*Math.PI)*bend);uv.push(0,t,.5,t,1,t);
      if(i<8){const n=i*3;idx.push(n,n+3,n+1,n+1,n+3,n+4,n+1,n+4,n+2,n+2,n+4,n+5);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
  }
  function palm(x,z,s=1,pot=true){
    const g=group('Palm_Plant',groups.Plants,[x,.055,z]);g.scale.setScalar(s);
    if(pot){cyl(.20,.14,.36,m.plaster,g,[0,.18,0],24);cyl(.18,.18,.018,m.soil,g,[0,.363,0]);}
    for(let i=0;i<9;i++){
      const angle=i*2.40,length=1.1+rand()*.48;
      const stem=group('Palm_Frond',g,[0,.25,0],angle);
      const points=[[0,0,0],[.13,.45,0],[.36,.92,0],[.67,length,0],[.96,length-.09,0]];
      tube(points,.005,m.leaf,stem,12);
      for(let k=1;k<=10;k++){
        const t=k/11,px=.10+.82*t,py=.30+(length-.30)*Math.sin(t*Math.PI*.57),l=.20+.16*Math.sin(t*Math.PI);
        for(const side of [-1,1]){
          const o=mesh(leafBlade(l,.021,.035),k%3?m.leaf:m.leafLight,stem,[px,py,0],[side*.91,.0,-.8]);
          o.rotation.z=-.75+(t-.5)*.7;
        }
      }
    }
    if(pot)obstacleCircle(x,z,.22*s);
  }
  function broadPlant(x,z,s=1){
    const g=group('Broad_Leaf_Plant',groups.Plants,[x,.055,z]);g.scale.setScalar(s);
    cyl(.20,.145,.36,m.plaster,g,[0,.18,0]);cyl(.18,.18,.016,m.soil,g,[0,.368,0]);
    for(let i=0;i<9;i++){
      const a=i*2.4,h=.55+rand()*.7,px=Math.sin(a)*.25,pz=Math.cos(a)*.25;
      tube([[0,.3,0],[px*.4,h*.8,pz*.4],[px,h,pz]],.007,m.leaf,g,10);
      mesh(leafBlade(.46,.15,.08),i%3?m.leaf:m.leafLight,g,[px,h,pz],[-.6-rand()*.5,a,.1]);
    }
    obstacleCircle(x,z,.24*s);
  }
  [[5.9,6.6,1.38],[-5.8,7.0,1.3],[-5.8,0,1.35],[5.9,.5,1.25],[1.8,-6.6,1.1],[-5.8,-7.3,1.15],[-1.6,-7.7,1.05],[-1.75,5.4,1.08],[6.1,-8.8,.95],[3.4,-8.8,1.1]].forEach(p=>palm(...p));
  [[-5.8,12.0,1.15],[-2.6,12.0,.8],[3.6,12.3,1.18],[-.7,11.9,.92],[5.2,-4.3,.95],[-5.8,-3.1,.95]].forEach(p=>broadPlant(...p));
  for(let z=13;z<20;z+=1.4){palm(-9.5,z,1.35);palm(9.4,z,1.45);}
  for(let x=-8.8;x<9;x+=1.4)palm(x,20.15,1.3);
  for(let i=0;i<7;i++)broadPlant(2.1+i*.61,-8.9,.65);

  // Recessed rock uplights and room lighting export as KHR_lights_punctual.
  const lights=[];
  function point(name,x,y,z,intensity,color,range=11){const l=new THREE.PointLight(color,intensity,range,2);l.name=name;l.position.set(x,y,z);l.userData={lightingRole:name.startsWith('Rock')?'rock':name.startsWith('Entry')?'entry':'table',baseIntensity:intensity};groups.Lights.add(l);lights.push(l);return l;}
  [[-5.75,2.3,5.9],[5.95,2.6,5.8],[-5.65,2.3,-2.9],[5.7,2.3,-3.9],[.0,3.4,-8.7]].forEach((p,i)=>{
    point(`Rock_Uplight_${i+1}`,...p,43,0xffc572,10);cyl(.09,.12,.08,m.dark,groups.Fixtures,[p[0],.12,p[2]],12);
  });
  point('Table_Private_Dinner',3.25,2.15,3.45,14,0xffe0ab,5.3);
  point('Table_Back_Dining',3.6,2.1,-3.7,9,0xffe3b3,7);
  point('Table_Left_Dining',-3.8,2.2,2.2,12,0xffe5c0,8);
  point('Entry_Cool_Fill',1.65,2.9,13.2,32,0xc4d8df,10);
  // Solid boundary obstacles correspond to actual façade pieces and glazing.
  obstacleBox(-3.06,10.94,7.25,.44);obstacleBox(5.09,10.94,4.55,.44);
  // Open doors swing outwards; keep walking cylinder clear of the leaves.
  obstacleBox(.23,11.56,.34,1.0);obstacleBox(3.16,11.56,.34,1.0);

  // Batch independently per named architectural zone, retaining separate shell visibility.
  function batch(parent){
    root.updateMatrixWorld(true);const batches=new Map(),old=[];
    parent.traverse(o=>{
      if(!o.isMesh)return;
      let g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(o.matrixWorld);
      const key=o.material.uuid,record=batches.get(key)||{material:o.material,geometries:[]};record.geometries.push(g);batches.set(key,record);old.push(o);
    });
    for(const o of old){o.removeFromParent();o.geometry.dispose();}
    // Discard empty construction groups after baking their transforms.
    for(const c of [...parent.children])if(c.isGroup)parent.remove(c);
    for(const {material,geometries} of batches.values()){
      const count=geometries.reduce((n,g)=>n+g.attributes.position.count,0),p=new Float32Array(count*3),n=new Float32Array(count*3),uv=new Float32Array(count*2),colors=new Float32Array(count*3).fill(1);let offset=0,hasColors=false;
      for(const g of geometries){const num=g.attributes.position.count;p.set(g.attributes.position.array,offset*3);n.set(g.attributes.normal.array,offset*3);if(g.attributes.uv)uv.set(g.attributes.uv.array,offset*2);if(g.attributes.color){colors.set(g.attributes.color.array,offset*3);hasColors=true;}offset+=num;g.dispose();}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));g.setAttribute('normal',new THREE.BufferAttribute(n,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));if(hasColors)g.setAttribute('color',new THREE.BufferAttribute(colors,3));g.computeBoundingBox();g.computeBoundingSphere();
      const indexed=mergeVertices(g,1e-5);g.dispose();
      if(material.normalMap)indexed.computeTangents();
      if(!material.map&&!material.normalMap&&!material.roughnessMap&&!material.metalnessMap&&!material.aoMap)indexed.deleteAttribute('uv');
      mesh(indexed,material,parent,[0,0,0],[0,0,0],`${parent.name}_${material.name}`);
    }
  }
  for(const [name,g] of Object.entries(groups))if(name!=='Lights')batch(g);
  const views={
    entrance:{pos:[1.65,1.63,16.4],look:[-.8,2.35,9.4],fov:61,label:'入口 · 岩石与橄榄绿门面'},
    hall:{pos:[-.2,1.63,7.55],look:[2.7,2.3,-1.4],fov:66,label:'主厅 · 山石之间的晚宴'},
    table:{pos:[1.30,1.55,5.75],look:[3.3,1.03,3.35],fov:56,label:'晚宴桌 · 红酒与围坐'},
    service:{pos:[-.05,1.63,-6.85],look:[-2.4,1.2,-8.95],fov:68,label:'后方区域 · 茶水与服务台'},
    overview:{pos:[23,25,32],look:[0,1,2],fov:49,label:'全景布局 · 入口、桌区与通道'}
  };
  const metadata={
    version:2,unit:'metre',venue:root.userData.venue,
    inferred:'Overall dimensions, hidden wall shapes, exact table count/spacing and service layout are inferred. Photo06 direction relative to facade is uncertain. Wine/candles are conceptual dinner styling.',
    views,
    navigation:{radius:.22,areas:[{minX:-6.52,maxX:6.52,minZ:-9.25,maxZ:11.12},{minX:-9.15,maxX:9.15,minZ:10.65,maxZ:18.65}],obstacles},
    tour:[{x:1.65,z:16.4},{x:1.65,z:12.65},{x:1.65,z:10.25},{x:.3,z:8.45},{x:-.2,z:7.55},{x:.05,z:5.65},{x:1.28,z:5.65}],
    comparisons:{
      hall:{image:'references/09-main-hall.jpg',pos:[2.18,1.46,6.8],look:[3.1,2.1,-1.75],fov:66,label:'主厅 · 参考照片 09',note:'以右前圆桌、跨桌银灯和右侧大岩板校准构图；属于近似机位。'},
      aisle:{image:'references/06-central-walkway.jpg',pos:[-.35,1.60,-5.8],look:[.8,2.6,10.75],fov:64,label:'中央通道 · 参考照片 06',note:'对照通道、左右桌区和洞顶高度；照片中远端开口与门面方向关系尚未确认。'},
      entrance:{image:'references/11-exterior-entrance.jpg',pos:[1.4,1.72,17.8],look:[-1.45,2.55,11.04],fov:60,label:'门面 · 参考照片 11',note:'对照右侧入口、左侧玻璃与橄榄绿门面；比例依据照片推估。'}
    },
    hotspots:[
      {name:'天然岩板',pos:[3.65,3.58,-.8],title:'头顶的天然岩层',copy:'右侧岩板向用餐区压低，宽低洞顶由不规则裂隙与层叠岩面组成。模型轮廓参考实拍，具体尺寸为推估。',view:'hall'},
      {name:'私人晚宴',pos:[3.25,1.08,3.45],title:'围坐一席，慢慢晚宴',copy:'保留原餐厅圆桌、转盘与中式茶具，加入少量红酒、烛光和低矮花艺作为晚宴布置。',view:'table'},
      {name:'弧形银灯',pos:[4.42,2.40,3.7],title:'划过桌面的银色弧线',copy:'细长金属灯杆与半球灯罩，参照主厅实拍制作。圆桌区的弧形灯与长桌区的深色直杆灯分别保留。',view:'table'},
      {name:'中央通道',pos:[0,.16,-1.0],title:'由入口延伸的参观路线',copy:'两侧桌区略高于中央铺装，暖白边缘灯勾勒出通道。沿通道可走到后方，也能靠近主要晚宴桌。',view:'hall'},
      {name:'后方服务区',pos:[-2.1,1.07,-8.55],title:'茶水与日常服务',copy:'根据柜台和饮品设备的实拍线索补全服务区域；未拍到的细节与相互位置采用合理推估。',view:'service'}
    ],
    sources:[{type:'venuePhotos',url:'https://www.trip.com/moments/detail/guilin-28-142998242/'},{type:'venueVideo',url:'https://my.trip.com/moments/detail/yangshuo-702-147467854?locale=en-MY'},{type:'genericRockPBR',url:'https://polyhaven.com/a/rock_boulder_dry',license:'CC0',note:'Material microdetail only; not a scan of this restaurant.'}]
  };
  root.userData.navigation=metadata.navigation;
  return {root,metadata};
}
