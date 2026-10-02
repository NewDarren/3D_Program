import * as THREE from '../cave-dinner-demo/vendor/three.module.min.js';
import { mergeGeometries, mergeVertices } from '../cave-dinner-demo/vendor/utils/BufferGeometryUtils.js';

// Coordinates are a coherent inferred plan, not measurements of the venue.
export async function buildBar() {
  const root=new THREE.Group();root.name='PicaPicaBar';
  const groups=Object.fromEntries(['Roof','Walls','Facade','Floor','Seating','Stage','Bar','Decor'].map(name=>{const g=new THREE.Group();g.name=name;root.add(g);return[name,g];}));
  let seed=93026;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const tex=(file,repeat=[1,1])=>{const t=new THREE.Texture();t.name=file;t.userData.uri=`textures/${file}`;t.flipY=false;t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(...repeat);return t;};
  const mat=(name,color,roughness=.65,metalness=0,extra={})=>{const m=new THREE.MeshStandardMaterial({color,roughness,metalness,...extra});m.name=name;return m;};
  const pbr=(base,repeat=[1,1],normalStrength=.3)=>{
    const normalMap=tex(`${base}-normal.png`,repeat),arm=tex(`${base}-arm.jpg`,repeat);
    normalMap.colorSpace=arm.colorSpace=THREE.NoColorSpace;
    return{normalMap,normalScale:new THREE.Vector2(normalStrength,normalStrength),roughnessMap:arm,metalnessMap:arm,aoMap:arm,aoMapIntensity:.45};
  };
  const m={
    wood:mat('Walnut furniture',0xffffff,1,0,{map:tex('walnut.jpg'),...pbr('walnut',[1,1],.3)}),
    wall:mat('Dark timber panels',0xffffff,1,0,{map:tex('dark-timber.jpg',[2,1]),...pbr('walnut',[2,1],.25)}),
    leather:mat('Black stitched leather',0xffffff,1,0,{map:tex('leather.jpg',[2,2]),...pbr('leather',[2,2],.32)}),
    floor:mat('Ceramic floor tile',0xffffff,1,0,{map:tex('tiles.jpg',[3,4.5]),...pbr('tiles',[3,4.5],.4)}),
    plaster:mat('Charcoal plaster',0xffffff,.93,0,{map:tex('plaster.jpg',[4,4])}),
    iron:mat('Blackened steel',0x171923,.48,.7), brass:mat('Aged champagne brass',0xb3996c,1,1,{...pbr('brass',[1,1],.16)}),
    red:mat('Red silk lanterns',0xffffff,1,0,{map:tex('silk.jpg'),...pbr('silk',[1,1],.22),emissive:0x89152e,emissiveIntensity:.22}),
    drum:mat('Lacquered burgundy drum shells',0x6c2031,.24,.16),
    pink:mat('Blossom petals',0xc87495,.88,0,{side:THREE.DoubleSide}),rose:mat('Blossom highlights',0xe6acbb,.85,0,{side:THREE.DoubleSide}),
    green:mat('Dark foliage',0x254d3e,.76),sage:mat('Leaf highlights',0x537858,.73),
    cream:mat('Ivory porcelain',0xe1d7b8,.23), black:mat('Matte black',0x0b0c12,.66),
    chrome:mat('Polished chrome',0x98a3ad,.22,.9),rubber:mat('Drum heads and rubber',0x29262c,.85),
    amber:mat('Amber bottle glass',0x55301b,.18,.2),bottle:mat('Deep green bottle glass',0x183f34,.19,.22),
    glass:Object.assign(new THREE.MeshPhysicalMaterial({color:0xf2fbff,roughness:.08,metalness:0,transmission:.82,thickness:.003,ior:1.5,envMapIntensity:1.25}),{name:'Glassware'}),
    wine:mat('Ruby wine',0x581323,.15,.05,{transparent:true,opacity:.86}),
    linen:mat('Natural linen napkin',0xcebfaa,.91),cork:mat('Cork coasters',0x70533b,.9),stitch:mat('Leather piping',0x514741,.72),
    window:mat('Facade glazing',0x7b8d95,.13,.2,{transparent:true,opacity:.18,side:THREE.DoubleSide}),
    label:mat('Bottle labels',0xffffff,.7,0,{map:tex('bottle-label.png')}),gravel:mat('Exterior paving',0x69636a,.92),
    neon:mat('Rose neon',0xffa1cf,.4,0,{emissive:0xff3f9b,emissiveIntensity:3}),
    cyan:mat('Cyan neon',0xafffed,.4,0,{emissive:0x43d5be,emissiveIntensity:2.4}),
    glow:mat('Warm bulbs',0xffead0,.3,0,{emissive:0xffc078,emissiveIntensity:2.2}),
  };
  const signTex=tex('facade-sign.png'),screenTex=tex('stage-screen.png');
  m.sign=mat('Illuminated facade lettering',0xffffff,.4,0,{map:signTex,emissiveMap:signTex,emissive:0xffffff,emissiveIntensity:.9});
  m.screen=mat('Stage LED artwork',0xffffff,.5,0,{map:screenTex,emissiveMap:screenTex,emissive:0xffffff,emissiveIntensity:.7});
  m.menu=mat('Table menu',0xffffff,.65,0,{map:tex('table-menu.png')});
  const mesh=(g,geometry,material,x=0,y=0,z=0,rot=[0,0,0])=>{
    // Native Three.js UVs are bottom-origin; embedded glTF images are top-origin.
    // Bake this into the exported geometry, not a browser-only texture workaround.
    if(material.map||material.normalMap){const uv=geometry.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setY(i,1-uv.getY(i));}
    const o=new THREE.Mesh(geometry,material);o.position.set(x,y,z);o.rotation.set(...rot);g.add(o);return o;
  };
  const box=(g,material,x,y,z,w,h,d,rot)=>mesh(g,new THREE.BoxGeometry(w,h,d),material,x,y,z,rot);
  const lettering=(g,material,x,y,z,w,h,rotation=0)=>mesh(g,new THREE.PlaneGeometry(w,h),material,x,y,z,[0,rotation,0]);
  const cyl=(g,material,x,y,z,r,h,top=r,rot,segments=12)=>mesh(g,new THREE.CylinderGeometry(top,r,h,segments),material,x,y,z,rot);
  const sphere=(g,material,x,y,z,r,scale=[1,1,1])=>{const o=mesh(g,new THREE.SphereGeometry(r,10,7),material,x,y,z);o.scale.set(...scale);return o;};
  const rod=(g,material,a,b,r=.025,segments=8)=>{const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),o=cyl(g,material,...va.clone().add(vb).multiplyScalar(.5).toArray(),r,va.distanceTo(vb),r,undefined,segments);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),vb.sub(va).normalize());return o;};
  const tube=(g,material,points,r=.025,closed=false)=>mesh(g,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),closed,'centripetal'),Math.max(12,points.length*4),r,6,closed),material);
  const ring=(g,material,x,y,z,r,t=.002)=>mesh(g,new THREE.TorusGeometry(r,t,5,24),material,x,y,z,[Math.PI/2,0,0]);
  function rounded(g,material,x,y,z,w,h,d,r=.07){
    r=Math.min(r,w/3,h/3,d/3);const shape=new THREE.Shape(),a=-w/2+r,b=-h/2+r;
    shape.moveTo(a-r,b);shape.quadraticCurveTo(a-r,b-r,a,b-r);shape.lineTo(-a,b-r);shape.quadraticCurveTo(-a+r,b-r,-a+r,b);shape.lineTo(-a+r,-b);shape.quadraticCurveTo(-a+r,-b+r,-a,-b+r);shape.lineTo(a,-b+r);shape.quadraticCurveTo(a-r,-b+r,a-r,-b);shape.closePath();
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:Math.max(.01,d-2*r),steps:1,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:r,bevelThickness:r,curveSegments:3});geometry.translate(0,0,-d/2+r);return mesh(g,geometry,material,x,y,z);
  }
  function tuftedBack(g,x,y,z){
    const geometry=new THREE.BoxGeometry(3,.92,.22,48,16,2),position=geometry.getAttribute('position');
    const radius=.07,half=new THREE.Vector3(1.5,.46,.11),p=new THREE.Vector3(),core=new THREE.Vector3();
    for(let i=0;i<position.count;i++){
      p.fromBufferAttribute(position,i);const front=p.z>.10;
      core.set(...['x','y','z'].map(a=>THREE.MathUtils.clamp(p[a],-half[a]+radius,half[a]-radius)));
      p.sub(core).normalize().multiplyScalar(radius).add(core);
      if(front){
        const edge=Math.max(0,Math.sin(Math.PI*(p.x/3+.5))*Math.sin(Math.PI*(p.y/.92+.5)));
        p.z+=.026*edge;
        for(let button=0;button<8;button++){const dx=p.x-(-1.25+button*.36);p.z-=.036*Math.exp(-(dx*dx/.0035+p.y*p.y/.0045))*edge;}
      }
      position.setXYZ(i,p.x,p.y,p.z);
    }
    geometry.computeVertexNormals();return mesh(g,geometry,m.leather,x,y,z);
  }
  function bottle(g,x,y,z,type=0){
    const material=type%2?m.amber:m.bottle;
    const profile=[[0,0],[.037,0],[.050,.012],[.055,.035],[.055,.25],[.051,.276],[.035,.297],[.023,.315],[.023,.402],[.025,.407],[.025,.421],[0,.421]];
    mesh(g,new THREE.LatheGeometry(profile.map(p=>new THREE.Vector2(...p)),16),material,x,y,z);
    cyl(g,m.brass,x,y+.408,z,.026,.035,.026,undefined,16);
    mesh(g,new THREE.CylinderGeometry(.0555,.0555,.11,16,1,true),m.label,x,y+.145,z);
    ring(g,m.brass,x,y+.39,z,.0235,.0015);
  }
  function glass(g,x,y,z,wine=false){
    cyl(g,m.cork,x,y+.003,z,.073,.006,.073,undefined,20);y+=.006;
    if(wine){
      cyl(g,m.glass,x,y+.007,z,.057,.014,.052,undefined,24);cyl(g,m.glass,x,y+.073,z,.004,.126,.006,undefined,14);
      const profile=[[.006,.13],[.025,.139],[.047,.16],[.057,.196],[.056,.22],[.047,.278],[.0445,.278],[.0535,.22],[.0545,.196],[.0445,.162],[.023,.143],[.006,.136]];
      mesh(g,new THREE.LatheGeometry(profile.map(p=>new THREE.Vector2(...p)),24),m.glass,x,y,z);
      mesh(g,new THREE.LatheGeometry([[0,.146],[.024,.146],[.043,.165],[.052,.192],[.052,.208],[0,.208]].map(p=>new THREE.Vector2(...p)),24),m.wine,x,y,z);
      ring(g,m.glass,x,y+.278,z,.0458,.0016);
    }else{
      const profile=[[0,0],[.039,0],[.043,.016],[.054,.18],[.051,.18],[.040,.017],[0,.017]];
      mesh(g,new THREE.LatheGeometry(profile.map(p=>new THREE.Vector2(...p)),24),m.glass,x,y,z);
      cyl(g,m.amber,x,y+.066,z,.04,.095,.046,undefined,20);ring(g,m.glass,x,y+.18,z,.0525,.0017);
    }
  }
  function tableLight(g,x,y,z){
    cyl(g,m.brass,x,y+.015,z,.11,.03,.10,undefined,24);ring(g,m.brass,x,y+.027,z,.099,.003);
    cyl(g,m.brass,x,y+.17,z,.014,.29,.012,undefined,16);
    const shade=[[.158,.255],[.163,.259],[.157,.279],[.104,.36],[.082,.376],[0,.376],[0,.367],[.079,.367],[.098,.352],[.150,.276],[.151,.259]];
    mesh(g,new THREE.LatheGeometry(shade.map(p=>new THREE.Vector2(...p)),28),m.brass,x,y,z);
    cyl(g,m.glow,x,y+.262,z,.148,.008,.148,undefined,24);ring(g,m.brass,x,y+.255,z,.157,.003);
  }
  function plant(g,x,y,z,height=1.2){
    cyl(g,m.plaster,x,y+.17,z,.22,.34,.28);cyl(g,m.iron,x,y+.342,z,.255,.025);
    for(let i=0;i<9;i++){const angle=i*2.399,end=[x+Math.cos(angle)*.42,y+.35+height*(.5+random()*.5),z+Math.sin(angle)*.42];rod(g,m.green,[x,y+.33,z],end,.012,6);const leaf=sphere(g,i%3?m.green:m.sage,...end,.15,[.5,1.6,.2]);leaf.rotation.set(.4,angle,.6);}
  }
  const lanternBodies=[];
  function lantern(parent,x,y,z){
    // Attach the upper cap to the lower truss, with no floating gap.
    rod(parent,m.iron,[x,y+.33,z],[x,3.73,z],.012,6);
    const g=new THREE.Group();g.name=`Lantern ${lanternBodies.length+1}`;parent.add(g);lanternBodies.push(g);
    const silk=mesh(g,new THREE.SphereGeometry(.25,24,16),m.red,x,y,z);silk.scale.set(1,1.25,1);
    for(let i=0;i<8;i++){const a=i*Math.PI/4;const points=[];for(let j=0;j<=8;j++){const t=j/8*Math.PI;points.push([x+Math.sin(t)*.254*Math.cos(a),y+Math.cos(t)*.32,z+Math.sin(t)*.254*Math.sin(a)]);}tube(g,m.brass,points,.008);}
    cyl(g,m.brass,x,y+.31,z,.085,.04);cyl(g,m.brass,x,y-.31,z,.085,.04);cyl(g,m.red,x,y-.49,z,.035,.27);sphere(g,m.glow,x,y-.31,z,.055);
    for(let i=0;i<8;i++){const a=i*Math.PI/4;rod(g,m.red,[x+Math.cos(a)*.025,y-.37,z+Math.sin(a)*.025],[x+Math.cos(a)*.038,y-.63,z+Math.sin(a)*.038],.003,5);}
  }
  function bird(g,x,y,z,rotation=0,scale=1){
    const b=new THREE.Group();b.position.set(x,y,z);b.rotation.y=rotation;b.scale.setScalar(scale);g.add(b);
    const points=[[-.8,-.8,0],[-.27,-.18,0],[-.12,.36,0],[.18,.76,0],[.46,.56,0],[.72,.49,0],[.42,.31,0],[.25,-.32,0],[-.1,-.51,0],[-.47,-.35,0],[-.8,-.8,0]];
    tube(b,m.neon,points,.024);tube(b,m.cyan,[[-.47,-.35,.006],[-.3,.22,.006],[.2,-.2,.006],[-.1,-.51,.006]],.015);sphere(b,m.glow,.33,.52,.01,.024);
    tube(b,m.brass,[[-.96,-1,-.02],[-.96,1,-.02],[.96,1,-.02],[.96,-1,-.02],[-.96,-1,-.02]],.02);
  }
  function blossomRun(g,x,z,length,axis='z',y=3.25){
    const start=axis==='z'?[x,y,z-length/2]:[x-length/2,y,z],end=axis==='z'?[x,y,z+length/2]:[x+length/2,y,z];rod(g,m.wall,start,end,.055);
    const count=Math.round(length*8);
    for(let i=0;i<count;i++){const offset=(i/count-.5)*length;const px=x+(axis==='x'?offset:(random()-.5)*.36),pz=z+(axis==='z'?offset:(random()-.5)*.36),py=y+(random()-.5)*.2;
      const size=.105+random()*.05,flower=new THREE.Group();flower.position.set(px,py,pz);flower.rotation.set(.4*Math.sin(i),i*2.399,.3*Math.cos(i));g.add(flower);
      for(let p=0;p<5;p++){
        // Curved petals have actual thickness-free flower surfaces, rather than faceted stones.
        const geo=new THREE.PlaneGeometry(size*.93,size*1.15,2,2),pos=geo.getAttribute('position');
        for(let v=0;v<pos.count;v++){const xx=pos.getX(v),yy=pos.getY(v);pos.setXYZ(v,xx*(.75+.25*Math.cos(yy/size*3)),yy+size*.44,.15*size*(xx*xx/(size*size))+.18*yy*yy/size);}
        geo.computeVertexNormals();const petal=mesh(flower,geo,i%3?m.pink:m.rose);petal.rotation.set(-Math.PI/2,0,p*Math.PI*2/5);
      }
      if(i%6===0)rod(g,m.green,[px,py,pz],[px+.07,py-.43,pz+.1],.01,5);
    }
  }
  // Complete building shell, including exterior and reverse faces.
  box(groups.Floor,m.floor,0,-.14,0,12.2,.28,18.2);box(groups.Floor,m.gravel,0,-.2,12.1,14,.4,6.3);
  box(groups.Walls,m.plaster,-6.1,2.15,0,.25,4.3,18.4);box(groups.Walls,m.plaster,6.1,2.15,0,.25,4.3,18.4);box(groups.Walls,m.plaster,0,2.15,-9.1,12.2,4.3,.25);
  box(groups.Roof,m.iron,0,4.38,0,12.5,.24,18.5);
  for(const side of [-1,1]){
    box(groups.Walls,m.wall,side*5.92,1.15,0,.10,2.3,18);
    for(let z=-8.75;z<9;z+=.75)box(groups.Walls,m.brass,side*5.85,1.14,z,.018,2.25,.014);
    for(let z=-8;z<=8;z+=4){box(groups.Walls,m.iron,side*5.8,2.1,z,.16,4.2,.17);box(groups.Walls,m.wall,side*5.7,2.65,z,1e-2,.7,2.55);}
    box(groups.Walls,m.brass,side*5.84,.18,0,.02,.06,18);box(groups.Walls,m.brass,side*5.84,2.31,0,.025,.028,18);
    blossomRun(groups.Decor,side*5.62,0,17,'z',3.17);
    // Offset from blossoms; the bar lantern also clears every shelf and bottle.
    for(const z of [-7,-3,1,5,8])lantern(groups.Decor,side*(side===1&&z===-3?4.45:4.82),2.89,z);
    for(const z of [-2.8,2,6])bird(groups.Decor,side*5.77,2.0,z,-side*Math.PI/2,.56);
  }
  // Roof truss, cross braces, hanging speaker and lighting brackets.
  for(const z of [-7,-3,1,5,8]){
    rod(groups.Roof,m.iron,[-5.9,4.02,z],[5.9,4.02,z],.055);rod(groups.Roof,m.iron,[-5.9,3.73,z],[5.9,3.73,z],.035);
    for(let x=-5.8;x<5.7;x+=.8)rod(groups.Roof,m.iron,[x,3.73,z],[x+.8,4.02,z],.018);
    for(const x of [-3,0,3]){rod(groups.Roof,m.iron,[x,4.02,z],[x,3.65,z],.025);cyl(groups.Roof,m.iron,x,3.58,z,.085,.2,.07,[.35,0,0],10);cyl(groups.Roof,m.glow,x,3.477,z-.032,.063,.01,.063,[.35,0,0],10);}
  }
  for(const side of [-1,1]){box(groups.Decor,m.iron,side*4.8,3.35,-5.8,.52,.78,.46,[0,side*.25,-side*.13]);box(groups.Decor,m.black,side*4.8,3.35,-5.55,.43,.67,.02);}
  // Entrance has a real open doorway and glass side bays.
  for(const side of [-1,1]){
    box(groups.Facade,m.wall,side*3.8,.45,9.03,4.6,.9,.24);
    box(groups.Facade,m.window,side*3.8,1.94,9.06,4.5,2.02,.03);
    for(const x of [side*1.53,side*3.8,side*6.04])box(groups.Facade,m.iron,x,1.65,9.11,.085,3.3,.12);
    for(const yy of [.94,2.98])box(groups.Facade,m.brass,side*3.8,yy,9.14,4.5,.036,.04);
    // Open door leaves folded along the jamb, leaving the central passage clear.
    box(groups.Facade,m.iron,side*1.55,1.48,9.64,.07,2.96,1.15);box(groups.Facade,m.window,side*1.55,1.52,9.64,.02,2.69,1.02);
    rod(groups.Facade,m.brass,[side*1.49,1.08,9.3],[side*1.49,1.64,9.3],.023);
    plant(groups.Decor,side*2.05,0,10.55,1.3);plant(groups.Decor,side*5.6,0,10.35,1.65);
  }
  box(groups.Facade,m.wall,0,3.59,9.14,12.3,1.25,.38);
  box(groups.Facade,m.iron,0,3.59,9.34,8.45,1.19,.035);
  lettering(groups.Facade,m.sign,0,3.59,9.359,8.4,1.14);
  box(groups.Facade,m.iron,0,4.3,9.8,13,.15,1.6);box(groups.Facade,m.brass,0,4.18,10.53,13,.045,.04);
  blossomRun(groups.Decor,0,10.61,12,'x',3.97);
  for(let i=0;i<=24;i++){const x=-6+i*.5,y=3.9-.27*Math.sin(i/24*Math.PI);if(i<24)rod(groups.Facade,m.iron,[x,y,10.23],[x+.5,3.9-.27*Math.sin((i+1)/24*Math.PI),10.23],.007,5);sphere(groups.Facade,m.glow,x,y-.07,10.23,.034);}
  for(const[x,z,c]of[[-4.2,12,0xbd6076],[-1.8,12.9,0xa39847],[1.5,12,0x568d7c],[4.2,12.7,0xad6883]]){
    const umbrellaMat=mat(`Umbrella ${x}`,c,.8),o=mesh(groups.Decor,new THREE.ConeGeometry(.7,.18,12,1,true),umbrellaMat,x,4.2,z);o.material.side=THREE.DoubleSide;rod(groups.Decor,m.iron,[x,3.97,z],[x,4.38,z],.017);for(let k=0;k<12;k++){const a=k*Math.PI/6;rod(groups.Decor,m.brass,[x,4.29,z],[x+Math.cos(a)*.7,4.11,z+Math.sin(a)*.7],.006,5);}
  }
  const obstacles=[];
  function booth(x,z,side){
    const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=side<0?Math.PI/2:-Math.PI/2;groups.Seating.add(g);
    box(g,m.wood,0,.19,-.85,2.95,.36,.82);tuftedBack(g,0,.76,-1.11);rounded(g,m.leather,0,.44,-.73,2.88,.22,.77);
    for(const s of [-1,1]){box(g,m.wood,s*1.23,.18,.12,.55,.34,1.65);rounded(g,m.leather,s*1.24,.42,.08,.6,.22,1.69);rounded(g,m.leather,s*1.49,.77,.08,.2,.86,1.85);}
    // Quilted back panels, seams and individual metallic buttons.
    for(let i=0;i<8;i++){const bx=-1.25+i*.36;sphere(g,m.brass,bx,.76,-1.007,.012,[1,1,.48]);}
    for(const yy of [.42,1.10])for(let i=0;i<36;i++)rod(g,m.stitch,[-1.36+i*.076,yy,-1.006],[-1.33+i*.076,yy,-1.006],.002,4);
    rounded(g,m.wood,0,.715,.18,1.65,.09,1.02,.014);for(const tx of [-.65,.65])for(const tz of [-.17,.52])box(g,m.iron,tx,.35,tz,.048,.70,.048);
    tube(g,m.stitch,[[-1.39,.49,-.37],[-1.39,.53,-1.03],[1.39,.53,-1.03],[1.39,.49,-.37]],.006);
    tube(g,m.stitch,[[-1.43,.39,-.975],[-1.43,1.16,-.975],[1.43,1.16,-.975],[1.43,.39,-.975]],.006);
    tableLight(g,.5,.76,.28);bottle(g,-.47,.76,.26);glass(g,-.2,.76,-.1);glass(g,.16,.76,.35,true);cyl(g,m.cream,-.47,.777,-.14,.105,.018);
    ring(g,m.cream,-.47,.789,-.14,.092,.005);
    rounded(g,m.linen,-.7,.765,.23,.13,.009,.2,.002);box(g,m.linen,-.7,.773,.23,.025,.006,.2,[0,.08,0]);
    rod(g,m.chrome,[-.69,.782,.17],[-.69,.782,.3],.005,6);sphere(g,m.chrome,-.69,.785,.33,.014,[.7,.18,1.4]);
    const menu=new THREE.Group();menu.position.set(.22,.927,-.16);menu.rotation.y=-.12;g.add(menu);
    box(menu,m.brass,0,0,0,.178,.308,.018);
    lettering(menu,m.menu,0,0,.01,.17,.3);lettering(menu,m.menu,0,0,-.01,.17,.3,Math.PI);
    rounded(menu,m.brass,0,-.163,0,.23,.014,.095,.004);
    const bx=[x-1.45,x+1.45],bz=[z-1.55,z+1.55];obstacles.push({type:'box',minX:bx[0],maxX:bx[1],minZ:bz[0],maxZ:bz[1]});
  }
  for(const z of [-2.9,1.3,5.5])booth(-4.28,z,-1);
  for(const z of [1.4,5.5])booth(4.28,z,1);
  // Stage: raised solid platform, practical stairs, backing wall and LED screen.
  box(groups.Stage,m.wood,0,.23,-7.75,9.5,.46,2.55);box(groups.Stage,m.iron,0,.24,-6.46,9.6,.47,.05);box(groups.Stage,m.neon,0,.41,-6.42,9.5,.022,.025);
  box(groups.Stage,m.wood,-4.97,.115,-6.98,.55,.23,.85);
  box(groups.Stage,m.iron,0,2.5,-8.86,5.65,2.53,.12);lettering(groups.Stage,m.screen,0,2.5,-8.798,5.5,2.35);
  for(const side of [-1,1]){box(groups.Stage,m.black,side*4.35,.89,-7.35,.62,.82,.7);box(groups.Stage,m.iron,side*4.35,.89,-6.99,.51,.69,.025);for(const yy of [.69,1.02])mesh(groups.Stage,new THREE.TorusGeometry(.18,.018,6,18),m.iron,side*4.35,yy,-6.96);}
  // Acoustic drum set with individual rims, cymbals, stands and throne.
  cyl(groups.Stage,m.drum,-.5,.89,-7.72,.41,.47,.41,[Math.PI/2,0,0],32);cyl(groups.Stage,m.cream,-.5,.89,-7.46,.38,.015,.38,[Math.PI/2,0,0],32);
  mesh(groups.Stage,new THREE.TorusGeometry(.4,.018,6,24),m.chrome,-.5,.89,-7.465);
  for(const[x,y,z,r]of[[-.91,1.42,-7.88,.23],[-.28,1.43,-7.92,.25],[-1.27,1.02,-8.12,.30],[.23,1.04,-8,.28]]){
    cyl(groups.Stage,m.drum,x,y,z,r,.29,r,undefined,24);cyl(groups.Stage,m.cream,x,y+.154,z,r*.95,.015,undefined,undefined,24);
    for(const yy of [y+.161,y-.15])ring(groups.Stage,m.chrome,x,yy,z,r,.012);
    for(let i=0;i<8;i++){const a=i*Math.PI/4;rod(groups.Stage,m.chrome,[x+Math.cos(a)*(r+.007),y-.115,z+Math.sin(a)*(r+.007)],[x+Math.cos(a)*(r+.007),y+.135,z+Math.sin(a)*(r+.007)],.008,6);}
    rod(groups.Stage,m.chrome,[x,.47,z],[x,y-.15,z],.018);
  }
  for(const[x,z,y]of[[-1.65,-7.5,1.8],[.67,-7.79,1.83],[-.05,-8.4,1.9]]){rod(groups.Stage,m.chrome,[x,.46,z],[x,y,z],.016);for(let k=0;k<3;k++){const a=k*Math.PI*2/3;rod(groups.Stage,m.chrome,[x,.65,z],[x+Math.cos(a)*.3,.46,z+Math.sin(a)*.3],.014);}cyl(groups.Stage,m.brass,x,y,z,.36,.02,.10,undefined,22);}
  cyl(groups.Stage,m.leather,-.6,.91,-8.43,.22,.12);rod(groups.Stage,m.chrome,[-.6,.46,-8.43],[-.6,.85,-8.43],.035);
  // Keyboard with separately modeled keys and a crossed metal support.
  box(groups.Stage,m.black,2.72,1.37,-7.52,1.7,.16,.49,[.10,0,0]);
  for(let i=0;i<29;i++){box(groups.Stage,m.cream,1.93+i*.055,1.45,-7.38,.049,.037,.23);if(i%7!==2&&i%7!==6)box(groups.Stage,m.black,1.957+i*.055,1.475,-7.49,.031,.039,.13);}
  rod(groups.Stage,m.iron,[2.1,.47,-7.57],[3.3,1.28,-7.57],.035);rod(groups.Stage,m.iron,[3.3,.47,-7.57],[2.1,1.28,-7.57],.035);
  // Electric guitar: shaped body, neck, frets, strings, pickups and stand.
  const guitar=new THREE.Group();guitar.position.set(-2.9,.5,-7.25);guitar.rotation.z=-.12;groups.Stage.add(guitar);
  sphere(guitar,m.wood,0,.42,0,.27,[1,1.15,.23]);sphere(guitar,m.wood,.02,.67,0,.2,[1,1,.3]);box(guitar,m.wall,0,1.02,0,.08,.76,.05);box(guitar,m.wood,0,1.48,0,.12,.2,.055);box(guitar,m.chrome,0,.42,.073,.14,.09,.027);
  for(let j=0;j<10;j++)box(guitar,m.chrome,0,.78+j*.06,.031,.08,.006,.01);
  for(let j=0;j<6;j++)rod(guitar,m.chrome,[-.027+j*.011,.37,.075],[-.027+j*.011,1.5,.035],.0015,3);
  for(const dx of [-.18,.18])rod(guitar,m.iron,[0,.2,-.08],[dx,0,.12],.02);rod(guitar,m.iron,[0,0,-.18],[0,.62,-.18],.02);
  for(const[x,z]of[[0,-6.85],[-2.1,-6.94]]){
    rod(groups.Stage,m.chrome,[x,.46,z],[x,1.75,z],.018);rod(groups.Stage,m.chrome,[x,1.7,z],[x+.32,1.79,z-.12],.014);rod(groups.Stage,m.black,[x+.28,1.79,z-.1],[x+.46,1.79,z-.16],.031);
    for(let i=0;i<3;i++){const a=i*2.094;rod(groups.Stage,m.iron,[x,.57,z],[x+Math.cos(a)*.31,.46,z+Math.sin(a)*.31],.017);}
    tube(groups.Stage,m.black,[[x+.45,1.79,z-.16],[x+.05,.8,z],[x+.03,.49,z],[x+.7,.48,z-.15],[x+1,.48,z-.7]],.007);
  }
  for(const x of [-2,2])box(groups.Stage,m.black,x,.65,-6.67,.65,.3,.38,[-.3,0,0]);
  // Speaker grilles, electronics controls and pedals remain inside the stage footprint.
  for(const side of [-1,1])for(let i=0;i<16;i++)box(groups.Stage,m.iron,side*4.35,.56+i*.041,-6.955,.49,.007,.009);
  for(let i=0;i<5;i++){cyl(groups.Stage,m.chrome,3.03+i*.09,1.468,-7.65,.015,.023,.015,undefined,8);}
  box(groups.Stage,m.cyan,2.7,1.468,-7.66,.14,.01,.07);
  rounded(groups.Stage,m.iron,2.74,.496,-7.02,.1,.05,.23,.015);
  tube(groups.Stage,m.black,[[2.74,.49,-7.1],[2.94,.48,-7.2],[3.19,.48,-7.58],[3.38,1.33,-7.63]],.006);
  for(const x of [-.14,.14])sphere(guitar,m.brass,x,.39,.069,.024,[1,1,.45]);
  obstacles.push({type:'box',minX:-5.25,maxX:4.9,minZ:-8.98,maxZ:-6.3});
  // Bar, service counter and a layered bottle display. Its position is inferred.
  box(groups.Bar,m.wall,4.55,.58,-3.05,2.1,1.16,4.8);box(groups.Bar,m.wood,4.45,1.19,-3.05,2.35,.13,4.96);
  for(let z=-5.4;z<-.7;z+=.19)box(groups.Bar,m.brass,3.48,.56,z,.027,1.03,.019);
  rod(groups.Bar,m.brass,[3.20,.23,-5.2],[3.20,.23,-.9],.028);
  box(groups.Bar,m.iron,5.82,2.0,-3.07,.12,2.4,4.5);
  for(const yy of [1.38,2.05,2.74]){
    box(groups.Bar,m.wood,5.42,yy,-3.1,.86,.06,4.4);box(groups.Bar,m.glow,5.0,yy+.035,-3.1,.016,.014,4.34);
    for(const z of [-4.8,-3.1,-1.4])rod(groups.Bar,m.iron,[5.8,yy-.29,z],[5.04,yy-.044,z],.014,6);
    for(let i=0;i<16;i++)bottle(groups.Bar,5.43+(i%2)*.13,yy+.035,-5.07+i*.265,i);
  }
  for(const z of [-4.8,-3.5,-2.2]){glass(groups.Bar,3.8,1.26,z);bottle(groups.Bar,4.2,1.26,z,1);cyl(groups.Bar,m.leather,2.78,.78,z,.26,.12);rod(groups.Bar,m.iron,[2.78,0,z],[2.78,.73,z],.045);cyl(groups.Bar,m.iron,2.78,.035,z,.28,.07);}
  box(groups.Bar,m.black,4.2,1.47,-1.24,.44,.38,.11,[-.18,0,0]);box(groups.Bar,m.cyan,4.2,1.47,-1.17,.37,.26,.012,[-.18,0,0]);
  obstacles.push({type:'box',minX:2.45,maxX:5.98,minZ:-5.65,maxZ:-.5});
  // Plant pots anchor the side corners and retain tangible volume from all sides.
  for(const[x,z]of[[-5.45,-5.62],[5.44,-5.9],[-5.3,8.4],[5.25,8.4]])plant(groups.Decor,x,0,z,1.5);
  for(const[x,z]of[[-5.45,-5.62],[5.44,-5.9],[-5.3,8.4],[5.25,8.4],[-2.05,10.55],[2.05,10.55],[-5.6,10.35],[5.6,10.35]])obstacles.push({type:'circle',x,z,r:.3});
  for(const side of [-1,1]){
    box(groups.Facade,m.wall,side*3.8,1.68,9.17,4.6,.07,.08);
    box(groups.Facade,m.iron,side*3.8,2.93,9.19,4.6,.055,.08);
  }
  // Merge by group + material, preserving all roof/wall geometry in the export.
  root.updateMatrixWorld(true);
  // Preserve source-space QA before batching removes individual object identities.
  const lanternBounds=lanternBodies.map(g=>({name:g.name,bounds:new THREE.Box3().setFromObject(g)}));
  const lanternClearances=[];
  for(const{name,bounds}of lanternBounds){
    let minGap=Infinity,nearest='';
    root.traverse(o=>{
      if(!o.isMesh)return;
      for(let p=o.parent;p;p=p.parent)if(lanternBodies.includes(p))return;
      const b=new THREE.Box3().setFromObject(o);
      // Hanging cords intentionally touch the cap; exclude narrow vertical supports.
      const size=b.getSize(new THREE.Vector3());if(size.x<.04&&size.z<.04)return;
      const gap=Math.hypot(...['x','y','z'].map(a=>Math.max(0,b.min[a]-bounds.max[a],bounds.min[a]-b.max[a])));
      if(gap<minGap){minGap=gap;nearest=o.material.name;}
    });
    lanternClearances.push({name,min:bounds.min.toArray(),max:bounds.max.toArray(),clearance:Number(minGap.toFixed(4)),nearest});
  }
  for(const group of Object.values(groups)){
    const batches=new Map();group.traverse(o=>{if(!o.isMesh)return;const key=o.material.uuid;if(!batches.has(key))batches.set(key,{material:o.material,geometries:[]});let geo=o.geometry.clone();geo.applyMatrix4(o.matrixWorld);if(geo.index)geo=geo.toNonIndexed();geo.deleteAttribute('uv1');geo.clearGroups();batches.get(key).geometries.push(geo);});
    group.clear();
    for(const{material,geometries}of batches.values()){const merged=mergeVertices(mergeGeometries(geometries,false),.0001);const o=new THREE.Mesh(merged,material);o.name=`${group.name} · ${material.name}`;group.add(o);geometries.forEach(g=>g.dispose());}
  }
  const metadata={
    name:'喜鹊音乐酒馆 · PICA PICA BAR',version:4,units:'meters (estimated)',
    detailRevision:'20261002-2',
    geometryQA:{uvOrigin:'top-left',lanternClearances},
    views:{
      entrance:{pos:[0,1.65,13.8],look:[0,2.1,7.4],label:'入口 · 西街的夜'},
      seats:{pos:[-2.2,1.55,1.3],look:[-4.08,.96,1.42],label:'卡座 · 靠近现场'},
      stage:{pos:[0,1.65,-3.75],look:[0,1.7,-7.85],label:'舞台 · 今夜有现场'},
      bar:{pos:[1.9,1.65,-2.75],look:[5.2,1.55,-3],label:'吧台 · 一杯之间'},
      overview:{pos:[19,19,25],look:[0,0.8,1.4],label:'全景 · 入口、卡座与舞台'},
    },
    areas:[{minX:-5.86,maxX:5.86,minZ:-8.95,maxZ:8.97},{minX:-1.48,maxX:1.48,minZ:8.65,maxZ:10.4},{minX:-6.7,maxX:6.7,minZ:9.37,maxZ:15}],
    obstacles,
    hotspots:[
      {id:'stage',title:'Live Band 舞台',body:'键盘、鼓组、吉他与麦克风构成可近看的演出区。舞台氛围参考同店实拍；设备数量与布置为场景设计。',pos:[0,1.8,-7.05]},
      {id:'seats',title:'黑色皮革卡座',body:'拉扣皮革、小方木桌与彩色灯光依据同店照片。卡座总数、尺寸与通道间距属于推估。',pos:[-2.85,1.15,1.3]},
      {id:'neon',title:'喜鹊与红灯笼',body:'鸟形霓虹、红灯笼和粉色花饰是实拍中鲜明的视觉元素；霓虹由立体灯管构成。',pos:[-5.55,2.05,6]},
      {id:'bar',title:'吧台与酒柜',body:'可从正面及通道观察完整吧台、酒瓶和背柜。吧台在现场的具体位置尚未确认，本版位置为推估。',pos:[3.38,1.4,-2.5]},
      {id:'entry',title:'西街入口',body:'中英文招牌、灯串、花饰与门面层次参考原网页照片；室内外连接和建筑尺寸按参观体验规划。',pos:[0,3.48,9.6]},
    ],
    estimates:['室内约12×18米、高4.3米为推估','吧台与舞台相对位置及中央通道为推估','卡座数量、后方结构、家具和设备细节为设计补全'],
    sources:['../assets/bar.jpg','https://hk.trip.com/restaurant/china/yangshuo/detail/restaurant-123002087/','https://www.douyin.com/video/7637530081053695656'],
  };
  root.userData.reconstruction='Photo-informed concept; not a measured scan';
  return{root,metadata};
}
