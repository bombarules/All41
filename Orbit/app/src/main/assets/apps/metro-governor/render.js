/* Metro Governor: stylized 3D renderer and rotating overhead camera. */
(function(){
"use strict";
var G=window.G, N=G.N, K=G.K, T=G.T;
var R = G.R = {};
var renderer, scene, camera, sun, hemi, clock;
var world;            // per-town root
var ground, groundGeo, outer, water, border, preview, previewMesh, cursorMesh;
var trees={}, objs={}, bobjs={};
var cars=[], carMeshes=[], roadTiles=[], chimneys=[], puffs=[], growing=[];
var cam = {tx:N/2, tz:N/2, dist:30, az:Math.PI*0.25, el:0.95, taz:Math.PI*0.25, tdist:30};

var SKY=new THREE.Color("#a8d7e3");
var COL = {
  seabed:"#2f8f9e", sand:"#ecd6a0", grass:"#7cc35a", jungle:"#4c9a48", road:"#5d646b",
  rz:"#b7e39a", cz:"#a6d9e8", iz:"#ecc98c", rlot:"#cbe7aa", clot:"#dcd6ca", ilot:"#bdb5a6",
  park:"#6cc45a", deck:"#e9e1cf", pave:"#d7d0c1", locked:"#3e5d52"
};
var tmpC=new THREE.Color(), tmpC2=new THREE.Color();

/* ---------- shared geometry and materials ---------- */
var geo={}, mats={};
function mat(c,o){ var key=c+(o?JSON.stringify(o):""); if(mats[key]) return mats[key];
  var m=new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:.78,metalness:0,flatShading:true},o||{})); mats[key]=m; return m }
function initGeo(){
  geo.box=new THREE.BoxGeometry(1,1,1); geo.box.translate(0,.5,0);
  geo.roof=new THREE.ConeGeometry(Math.SQRT1_2,1,4,1); geo.roof.rotateY(Math.PI/4); geo.roof.translate(0,.5,0);
  geo.cyl=new THREE.CylinderGeometry(.5,.5,1,10); geo.cyl.translate(0,.5,0);
  geo.prism=new THREE.CylinderGeometry(.5,.5,1,3,1); geo.prism.rotateZ(Math.PI/2); geo.prism.rotateX(Math.PI/2); geo.prism.translate(0,.25,0);
  geo.canopy=new THREE.IcosahedronGeometry(.42,0);
  geo.trunk=new THREE.CylinderGeometry(.05,.08,.42,5); geo.trunk.translate(0,.21,0);
  geo.palmTrunk=new THREE.CylinderGeometry(.035,.06,1,5); geo.palmTrunk.translate(0,.5,0);
  geo.palmCrown=new THREE.ConeGeometry(.55,.2,7); geo.palmCrown.rotateX(Math.PI);
  geo.disk=new THREE.CylinderGeometry(.5,.5,.02,20);
  geo.cone=new THREE.ConeGeometry(.5,1,8); geo.cone.translate(0,.5,0);
  geo.puff=new THREE.IcosahedronGeometry(.12,0);
  var pts=[]; for(var i=0;i<=8;i++){var y=i/8, r=.45-.17*Math.sin(Math.PI*y*0.85); pts.push(new THREE.Vector2(r,y*1.25))} geo.tower=new THREE.LatheGeometry(pts,14);
  // soft contact shadow under objects (reads as ambient occlusion)
  var c=document.createElement("canvas"); c.width=c.height=64; var x=c.getContext("2d");
  var g=x.createRadialGradient(32,32,4,32,32,32); g.addColorStop(0,"rgba(20,40,60,.55)"); g.addColorStop(1,"rgba(20,40,60,0)"); x.fillStyle=g; x.fillRect(0,0,64,64);
  mats.ao=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false});
  geo.ao=new THREE.PlaneGeometry(1,1); geo.ao.rotateX(-Math.PI/2);
}
function box(g,w,h,d,c,x,y,z,o){ var m=new THREE.Mesh(geo.box,mat(c,o)); m.scale.set(w,h,d); m.position.set(x||0,y||0,z||0); m.castShadow=true; m.receiveShadow=true; g.add(m); return m }
function roofOn(g,w,h,d,c,y,x,z){ var m=new THREE.Mesh(geo.roof,mat(c)); m.scale.set(w,h,d); m.position.set(x||0,y,z||0); m.castShadow=true; g.add(m); return m }
function cyl(g,r,h,c,x,y,z,o){ var m=new THREE.Mesh(geo.cyl,mat(c,o)); m.scale.set(r*2,h,r*2); m.position.set(x||0,y||0,z||0); m.castShadow=true; g.add(m); return m }
function ao(g,w,d){ var m=new THREE.Mesh(geo.ao,mats.ao); m.scale.set(w,1,d); m.position.y=.012; m.renderOrder=1; g.add(m) }
function tree(g,x,z,s,c){ var t=new THREE.Mesh(geo.trunk,mat("#7a5a3c")); t.position.set(x,0,z); t.scale.setScalar(s); g.add(t);
  var k=new THREE.Mesh(geo.canopy,mat(c||"#3f9a46")); k.position.set(x,.5*s,z); k.scale.setScalar(s); k.castShadow=true; g.add(k) }

/* ---------- init ---------- */
R.init = function(canvas){
  renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true,powerPreference:"high-performance"});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));
  renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.05;
  scene=new THREE.Scene(); scene.background=SKY; scene.fog=new THREE.Fog(SKY,70,170);
  camera=new THREE.PerspectiveCamera(38,1,.5,400);
  hemi=new THREE.HemisphereLight("#fff4dd","#4f6f86",1.25); scene.add(hemi);       // blue-gray from below: cool shadows
  sun=new THREE.DirectionalLight("#fff0d4",2.3); sun.position.set(N/2-22,38,N/2+14); sun.target.position.set(N/2,0,N/2);
  sun.castShadow=true; sun.shadow.mapSize.set(2048,2048);
  var sc=sun.shadow.camera; sc.left=-30;sc.right=30;sc.top=30;sc.bottom=-30;sc.near=5;sc.far=110; sun.shadow.bias=-0.0006; sun.shadow.normalBias=.03; sun.shadow.radius=4;
  scene.add(sun); scene.add(sun.target);
  scene.add(new THREE.AmbientLight("#9fb8d0",.25));
  initGeo();
  // water
  water=new THREE.Mesh(new THREE.PlaneGeometry(N*10,N*10,1,1), new THREE.MeshStandardMaterial({color:"#46b6c4",roughness:.18,metalness:.05,transparent:true,opacity:.86}));
  water.rotation.x=-Math.PI/2; water.position.set(N/2,-.12,N/2); water.receiveShadow=true; scene.add(water);
  // preview tiles
  previewMesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(.94,.94).rotateX(-Math.PI/2), new THREE.MeshBasicMaterial({color:"#ffffff",transparent:true,opacity:.55,depthWrite:false}), N*N);
  previewMesh.count=0; previewMesh.renderOrder=3; scene.add(previewMesh);
  cursorMesh=new THREE.Mesh(new THREE.RingGeometry(.42,.5,4,1,Math.PI/4).rotateX(-Math.PI/2), new THREE.MeshBasicMaterial({color:"#f1e2c2",transparent:true,opacity:.9,depthWrite:false}));
  cursorMesh.visible=false; cursorMesh.renderOrder=4; scene.add(cursorMesh);
  clock=new THREE.Clock();
  window.addEventListener("resize",R.resize); R.resize();
  R.input(canvas);
};
R.resize = function(){ var w=window.innerWidth,h=window.innerHeight; renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix() };

/* ---------- build a town ---------- */
R.buildTown = function(t){
  if(world){ scene.remove(world); world.traverse(function(o){ if(o.geometry&&o.geometry!==geo.box&&!isShared(o.geometry)) o.geometry.dispose() }) }
  world=new THREE.Group(); scene.add(world);
  objs={}; bobjs={}; chimneys=[]; growing=[];
  carMeshes.forEach(function(m){scene.remove(m)}); carMeshes=[]; cars=[];
  buildGround(t); buildOuter(t); buildTrees(t); buildBorder(t);
  for(var q=0;q<N*N;q++) tileObj(t,q,false);
  t.blds.forEach(function(b,id){ if(b) bldObj(t,b,id,false) });
  rebuildRoads(t);
  var def=G.def(t);
  // aim the camera at the starting district on first visit
  if(!t._cam){ var d=t.dist.indexOf(1); t._cam={tx:(d%3)*12+6, tz:Math.floor(d/3)*12+6} }
  cam.tx=t._cam.tx; cam.tz=t._cam.tz;
  var asp=window.innerHeight/window.innerWidth; cam.tdist=cam.dist=asp>1.2?Math.min(48,26*asp):30;
};
function isShared(g){ for(var k in geo) if(geo[k]===g) return true; return false }

function tileColor(t,q,out){
  var x=q%N,y=Math.floor(q/N), b=t.base[q], k=t.kind[q], l=t.lvl[q], c;
  if(b===T.WATER) c=COL.seabed;
  else if(k===K.ROAD) c=COL.road;
  else if(k===K.RZ) c= l?COL.rlot:COL.rz;
  else if(k===K.CZ) c= l?COL.clot:COL.cz;
  else if(k===K.IZ) c= l?COL.ilot:COL.iz;
  else if(k===K.BLD){ var bb=t.blds[t.bid[q]]; c = !bb?COL.pave : bb.type==="park"||bb.type==="solar"?COL.park : bb.type==="pool"?COL.deck : COL.pave }
  else if(b===T.SAND) c=COL.sand;
  else if(b===T.JUNGLE) c=COL.jungle;
  else c=COL.grass;
  out.set(c);
  var v=.96+G.hash(x,y,3)*.08; out.multiplyScalar(v);
  if(b!==T.WATER && !G.unlocked(t,x,y)){ tmpC2.set(COL.locked); out.lerp(tmpC2,.42) }
  return out;
}
function vHeight(t,vx,vy){
  // a vertex touches up to four tiles; slope down where the sea starts
  var w=0,n=0;
  for(var dy=-1;dy<=0;dy++)for(var dx=-1;dx<=0;dx++){var x=vx+dx,y=vy+dy; if(!G.inb(x,y)) continue; n++; if(t.base[G.idx(x,y)]===T.WATER) w++}
  if(n===0) return 0;
  if(w===n) return -.7; if(w>0) return -.16; return 0;
}
function buildGround(t){
  var pos=new Float32Array(N*N*4*3), col=new Float32Array(N*N*4*3), ind=[];
  for(var y=0;y<N;y++)for(var x=0;x<N;x++){
    var q=G.idx(x,y), o=q*4;
    var vs=[[x,y],[x+1,y],[x,y+1],[x+1,y+1]];
    for(var i=0;i<4;i++){ pos[(o+i)*3]=vs[i][0]; pos[(o+i)*3+1]=vHeight(t,vs[i][0],vs[i][1]); pos[(o+i)*3+2]=vs[i][1] }
    ind.push(o,o+2,o+1, o+1,o+2,o+3);
  }
  groundGeo=new THREE.BufferGeometry();
  groundGeo.setAttribute("position",new THREE.BufferAttribute(pos,3));
  groundGeo.setAttribute("color",new THREE.BufferAttribute(col,3));
  groundGeo.setIndex(ind); groundGeo.computeVertexNormals();
  ground=new THREE.Mesh(groundGeo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.95,flatShading:true}));
  ground.receiveShadow=true; world.add(ground);
  for(var q=0;q<N*N;q++) paintTile(t,q);
  groundGeo.attributes.color.needsUpdate=true;
}
function paintTile(t,q){
  tileColor(t,q,tmpC); var col=groundGeo.attributes.color.array, o=q*4;
  for(var i=0;i<4;i++){ col[(o+i)*3]=tmpC.r; col[(o+i)*3+1]=tmpC.g; col[(o+i)*3+2]=tmpC.b }
}
function buildOuter(t){
  var def=G.def(t), S=N*5, seg=45, half=S/2;
  var g=new THREE.PlaneGeometry(S,S,seg,seg); g.rotateX(-Math.PI/2); g.translate(N/2,0,N/2);
  var p=g.attributes.position, cols=new Float32Array(p.count*3);
  function sea(x,z){ var c=def.coast;
    return (c.indexOf("s")>=0&&z>N-2.5)||(c.indexOf("n")>=0&&z<2.5)||(c.indexOf("w")>=0&&x<2.5)||(c.indexOf("e")>=0&&x>N-2.5) }
  for(var i=0;i<p.count;i++){
    var x=p.getX(i), z=p.getZ(i), inside=x>0.01&&x<N-.01&&z>0.01&&z<N-.01, h;
    if(inside) h=-.9; else if(sea(x,z)) h=-.8; else h=(x>=-0.01&&x<=N+.01&&z>=-.01&&z<=N+.01)?0:.05+G.hash(Math.round(x),Math.round(z),8)*.25;
    p.setY(i,h); tmpC.set(h<-.5?COL.seabed:COL.jungle).multiplyScalar(.82+G.hash(i,1,2)*.1);
    cols[i*3]=tmpC.r; cols[i*3+1]=tmpC.g; cols[i*3+2]=tmpC.b;
  }
  g.setAttribute("color",new THREE.BufferAttribute(cols,3)); g.computeVertexNormals();
  outer=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true})); outer.receiveShadow=true; world.add(outer);
  // outer jungle and coast palms
  var count=520, can=new THREE.InstancedMesh(geo.canopy,mat("#ffffff"),count), tr=new THREE.InstancedMesh(geo.trunk,mat("#76563a"),count), m=new THREE.Matrix4(), n=0, r=G.rng(t.seed+5);
  for(var a=0;a<4000&&n<count;a++){
    var x=-26+r()*(N+52), z=-26+r()*(N+52);
    if(x>-0.5&&x<N+.5&&z>-.5&&z<N+.5) continue; if(sea(x,z)) continue;
    var s=.9+r()*1.1; m.compose(new THREE.Vector3(x,.05+.5*s,z),new THREE.Quaternion(),new THREE.Vector3(s,s*(.85+r()*.4),s)); can.setMatrixAt(n,m);
    tmpC.set(["#3d9a45","#2f8a3f","#4aa64a","#5bb250"][Math.floor(r()*4)]); can.setColorAt(n,tmpC);
    m.compose(new THREE.Vector3(x,.05,z),new THREE.Quaternion(),new THREE.Vector3(s,s,s)); tr.setMatrixAt(n,m); n++;
  }
  can.count=tr.count=n; can.castShadow=true; world.add(can); world.add(tr);
}
function buildTrees(t){
  ["can","tr","pt","pc"].forEach(function(k){ if(trees[k]) world.remove(trees[k]) });
  var max=N*N*2;
  trees.can=new THREE.InstancedMesh(geo.canopy,mat("#ffffff"),max); trees.tr=new THREE.InstancedMesh(geo.trunk,mat("#76563a"),max);
  trees.pt=new THREE.InstancedMesh(geo.palmTrunk,mat("#9a7652"),N*N); trees.pc=new THREE.InstancedMesh(geo.palmCrown,mat("#ffffff"),N*N);
  var m=new THREE.Matrix4(), q4=new THREE.Quaternion(), e=new THREE.Euler(), n=0, p=0;
  for(var q=0;q<N*N;q++){
    if(t.kind[q]!==K.NONE) continue;
    var x=q%N, y=Math.floor(q/N), b=t.base[q];
    if(b===T.JUNGLE){
      var cnt=1+(G.hash(x,y,1)>.45?1:0);
      for(var i=0;i<cnt;i++){
        var jx=x+.25+G.hash(x,y,10+i)*.5, jz=y+.25+G.hash(x,y,20+i)*.5, s=.75+G.hash(x,y,30+i)*.6;
        m.compose(new THREE.Vector3(jx,.5*s,jz),q4.identity(),new THREE.Vector3(s,s*(.8+G.hash(x,y,40+i)*.5),s)); trees.can.setMatrixAt(n,m);
        tmpC.set(["#3d9a45","#2f8a3f","#4aa64a","#57b04d","#358f3c"][Math.floor(G.hash(x,y,50+i)*5)]); trees.can.setColorAt(n,tmpC);
        m.compose(new THREE.Vector3(jx,0,jz),q4.identity(),new THREE.Vector3(s,s,s)); trees.tr.setMatrixAt(n,m); n++;
      }
    } else if(b===T.SAND && G.hash(x,y,7)<.22){
      var px=x+.5+(G.hash(x,y,8)-.5)*.4, pz=y+.5+(G.hash(x,y,9)-.5)*.4, h=.9+G.hash(x,y,11)*.5, lean=(G.hash(x,y,12)-.5)*.35;
      e.set(lean,G.hash(x,y,13)*6,0); q4.setFromEuler(e);
      m.compose(new THREE.Vector3(px,0,pz),q4,new THREE.Vector3(1,h,1)); trees.pt.setMatrixAt(p,m);
      var top=new THREE.Vector3(0,h,0).applyQuaternion(q4);
      e.set(lean*.5,G.hash(x,y,14)*6,0); m.compose(new THREE.Vector3(px+top.x,top.y,pz+top.z),new THREE.Quaternion().setFromEuler(e),new THREE.Vector3(1,1,1)); trees.pc.setMatrixAt(p,m);
      tmpC.set(["#3fae4a","#55b84a","#2f9a45"][Math.floor(G.hash(x,y,15)*3)]); trees.pc.setColorAt(p,tmpC); p++;
    }
  }
  trees.can.count=trees.tr.count=n; trees.pt.count=trees.pc.count=p;
  [trees.can,trees.pc,trees.pt].forEach(function(o){o.castShadow=true});
  if(trees.can.instanceColor) trees.can.instanceColor.needsUpdate=true;
  if(trees.pc.instanceColor) trees.pc.instanceColor.needsUpdate=true;
  world.add(trees.can); world.add(trees.tr); world.add(trees.pt); world.add(trees.pc);
}
function buildBorder(t){
  if(border) world.remove(border);
  var pts=[];
  for(var y=0;y<N;y++)for(var x=0;x<N;x++){
    if(!G.unlocked(t,x,y)) continue;
    if(!G.inb(x,y-1)||!G.unlocked(t,x,y-1)) pts.push(x,.03,y, x+1,.03,y);
    if(!G.inb(x,y+1)||!G.unlocked(t,x,y+1)) pts.push(x,.03,y+1, x+1,.03,y+1);
    if(!G.inb(x-1,y)||!G.unlocked(t,x-1,y)) pts.push(x,.03,y, x,.03,y+1);
    if(!G.inb(x+1,y)||!G.unlocked(t,x+1,y)) pts.push(x+1,.03,y, x+1,.03,y+1);
  }
  var g=new THREE.BufferGeometry(); g.setAttribute("position",new THREE.Float32BufferAttribute(pts,3));
  border=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:"#f1e2c2",transparent:true,opacity:.7})); world.add(border);
}
R.refreshDistricts = function(t){ for(var q=0;q<N*N;q++) paintTile(t,q); groundGeo.attributes.color.needsUpdate=true; buildBorder(t) };

/* ---------- zone buildings ---------- */
var WALLS=["#f4e3c3","#f7d4b2","#e8efd6","#f5e6a4","#d8ebee","#f2cfc4"], ROOFS=["#c8643b","#b5532f","#d9794a","#c25a36"];
function tileObj(t,q,anim){
  var x=q%N,y=Math.floor(q/N), k=t.kind[q], l=t.lvl[q];
  if(objs[q]){ world.remove(objs[q]); objs[q]=null; chimneys=chimneys.filter(function(c){return c.q!==q}) }
  if(k<K.RZ||k>K.IZ||!l) return;
  var g=new THREE.Group(); g.position.set(x+.5,0,y+.5);
  var h=function(i){return G.hash(x,y,i)};
  var rot=Math.floor(h(1)*4)*Math.PI/2; g.rotation.y=rot;
  var wall=WALLS[Math.floor(h(2)*WALLS.length)], roof=ROOFS[Math.floor(h(3)*ROOFS.length)];
  if(k===K.RZ){
    if(l===1){ box(g,.5,.34,.46,wall,-.08,0,.05); roofOn(g,.6,.26,.56,roof,.34,-.08,.05); tree(g,.3,-.28,.55,"#4aa64a"); ao(g,.95,.95) }
    else if(l===2){ box(g,.42,.32,.4,wall,-.2,0,-.18); roofOn(g,.5,.24,.48,roof,.32,-.2,-.18);
      var w2=WALLS[Math.floor(h(4)*WALLS.length)]; box(g,.42,.6,.42,w2,.2,0,.18); roofOn(g,.52,.26,.52,roof,.6,.2,.18); ao(g,1,1) }
    else { box(g,.78,1.35,.74,wall); for(var i=1;i<4;i++) box(g,.82,.05,.78,"#fbf6ec",0,i*.33,0); box(g,.84,.08,.8,roof,0,1.35,0); box(g,.18,.18,.18,"#9aa7ae",.18,1.43,-.15); ao(g,1.15,1.15) }
  } else if(k===K.CZ){
    var cc=["#f6f1e7","#bfe3e0","#f4d58d","#f0c7b6"][Math.floor(h(5)*4)];
    if(l===1){ box(g,.78,.42,.66,cc,0,0,.06); box(g,.82,.05,.2,["#d0683f","#45b8b0","#e0a341"][Math.floor(h(6)*3)],0,.34,-.33); box(g,.8,.05,.7,"#8f9aa0",0,.42,.06); ao(g,1,1) }
    else if(l===2){ box(g,.8,.88,.74,cc); box(g,.82,.12,.76,"#45b8b0",0,.3,0); box(g,.4,.18,.04,"#fff7e6",0,.62,-.39); box(g,.84,.06,.78,"#8f9aa0",0,.88,0); ao(g,1.1,1.1) }
    else { box(g,.9,.35,.9,"#e9e2d4"); box(g,.66,2.3,.66,"#8fb6c8",0,.35,0,{roughness:.35,metalness:.25}); for(var j=1;j<6;j++) box(g,.69,.04,.69,"#f4efe4",0,.35+j*.4,0); box(g,.7,.1,.7,"#f4efe4",0,2.65,0); ao(g,1.3,1.3) }
  } else {
    var ic=["#cbc3b2","#bfb7a6","#d4c7ae"][Math.floor(h(7)*3)];
    if(l===1){ box(g,.88,.36,.76,ic); var p=new THREE.Mesh(geo.prism,mat("#8b969c")); p.scale.set(.88,.5,.76); p.position.y=.36; p.castShadow=true; g.add(p); ao(g,1.05,1.05) }
    else if(l===2){ box(g,.9,.46,.8,ic); box(g,.92,.05,.82,"#7f8a90",0,.46,0); cyl(g,.07,.85,"#b0533a",.28,.46,.22); chimneys.push({q:q,local:new THREE.Vector3(.28,1.35,.22),g:g}); ao(g,1.1,1.1) }
    else { box(g,.96,.6,.9,ic); box(g,.98,.05,.92,"#7f8a90",0,.6,0); cyl(g,.08,1.1,"#b0533a",.3,.6,.25); cyl(g,.08,1.1,"#b0533a",.1,.6,.25); cyl(g,.18,.4,"#d9d4c8",-.28,.6,-.2);
      chimneys.push({q:q,local:new THREE.Vector3(.3,1.75,.25),g:g},{q:q,local:new THREE.Vector3(.1,1.75,.25),g:g}); ao(g,1.2,1.2) }
  }
  world.add(g); objs[q]=g;
  if(anim){ g.scale.set(1,.01,1); growing.push({o:g,t:0}) }
}

/* ---------- service buildings, parks, pools ---------- */
function bldObj(t,b,id,anim){
  if(bobjs[id]){ world.remove(bobjs[id]); bobjs[id]=null; chimneys=chimneys.filter(function(c){return c.bid!==id}) }
  if(!b) return;
  var g=new THREE.Group(); g.position.set(b.x+b.w/2,0,b.y+b.h/2);
  var ty=b.type;
  if(ty==="power"){ box(g,1.9,.18,1.9,"#cfc8b8"); var tw=new THREE.Mesh(geo.tower,mat("#ece6da")); tw.position.set(-.38,.18,-.35); tw.castShadow=true; g.add(tw);
    box(g,.85,.55,.6,"#a9b4bb",.42,.18,.4); box(g,.87,.06,.62,"#c8643b",.42,.73,.4); cyl(g,.07,1.2,"#b0533a",.72,.18,-.55);
    chimneys.push({bid:id,local:new THREE.Vector3(-.38,1.5,-.35),g:g,steam:true}); ao(g,2.4,2.4) }
  else if(ty==="solar"){ for(var i=0;i<3;i++)for(var j=0;j<3;j++){ var px=-.6+i*.6, pz=-.6+j*.6; box(g,.04,.18,.04,"#8a949a",px,0,pz); var pn=box(g,.5,.03,.4,"#2f4f78",px,.2,pz,{roughness:.3,metalness:.45}); pn.rotation.x=-.5 } ao(g,2,2) }
  else if(ty==="water"){ for(var a=0;a<4;a++){ var ang=a*Math.PI/2+Math.PI/4; cyl(g,.03,.9,"#8a949a",Math.cos(ang)*.22,0,Math.sin(ang)*.22) }
    cyl(g,.32,.45,"#45b8b0",0,.85,0); var cn=new THREE.Mesh(geo.cone,mat("#e9e3d6")); cn.scale.set(.7,.25,.7); cn.position.y=1.3; cn.castShadow=true; g.add(cn); ao(g,.9,.9) }
  else if(ty==="clinic"){ box(g,.8,.52,.78,"#f6f2ea"); box(g,.82,.05,.8,"#c8643b",0,.52,0); box(g,.36,.04,.1,"#e05a4a",0,.58,0); box(g,.1,.04,.36,"#e05a4a",0,.58,0); box(g,.3,.28,.05,"#8fb6c8",0,0,-.41); ao(g,1.05,1.05) }
  else if(ty==="school"){ box(g,1.6,.5,.6,"#e8b04b",0,0,-.45); roofOn(g,1.7,.3,.7,"#c8643b",.5,0,-.45); box(g,.6,.5,1.0,"#e8b04b",-.5,0,.3); roofOn(g,.7,.3,1.1,"#c8643b",.5,-.5,.3);
    box(g,.8,.02,.7,"#d86b4a",.35,0,.4); cyl(g,.02,1,"#e6e6e6",.75,0,.75); box(g,.25,.15,.02,"#45b8b0",.88,.85,.75); ao(g,2,2) }
  else if(ty==="safety"){ box(g,.8,.5,.74,"#8aa1b1"); box(g,.82,.08,.76,"#d0683f",0,.34,0); box(g,.24,.95,.24,"#8aa1b1",.25,0,.22); box(g,.28,.06,.28,"#d0683f",.25,.95,.22); ao(g,1.05,1.05) }
  else if(ty==="pool"){ box(g,1.9,.06,1.9,"#ece4d2"); var wc=b.closed?"#8a9fa5":"#38c6d6";
    box(g,1.2,.04,.8,wc,0,.05,-.2,{roughness:.15,emissive:b.closed?"#000000":"#0b5560",emissiveIntensity:.35}); box(g,1.28,.03,.06,"#ffffff",0,.07,-.62);
    box(g,.55,.42,.45,"#f6f2ea",-.55,.06,.6); box(g,.58,.06,.48,"#c8643b",-.55,.48,.6);
    [[.35,.55,"#d0683f"],[.7,.5,"#45b8b0"],[.75,.1,"#e0a341"]].forEach(function(u){ cyl(g,.015,.35,"#eeeeee",u[0],.06,u[1]); var c=new THREE.Mesh(geo.cone,mat(u[2])); c.scale.set(.3,.1,.3); c.position.set(u[0],.38,u[1]); c.castShadow=true; g.add(c) });
    ao(g,2.3,2.3) }
  else if(ty==="park"){
    var s=b.sub;
    if(s==="large"){ var pd=new THREE.Mesh(geo.disk,mat("#45b8b0",{roughness:.2})); pd.scale.set(.9,1,.7); pd.position.set(-.35,.02,.3); g.add(pd);
      box(g,1.9,.015,.12,"#efe2c4",0,.005,-.1); box(g,.12,.015,1.9,"#efe2c4",.25,.005,0);
      [[-.6,-.6],[.7,-.6],[.7,.6],[-.75,-.1],[.1,.65],[.62,.05]].forEach(function(p,i){ tree(g,p[0],p[1],.8+G.hash(i,b.x,2)*.4,["#3d9a45","#4aa64a","#57b04d"][i%3]) }); }
    else if(s==="sports"){ box(g,1.8,.02,1.5,"#5cbf4c"); box(g,1.6,.025,.03,"#ffffff",0,0,0); box(g,.03,.025,1.3,"#ffffff",0,0,0); box(g,1.6,.025,.03,"#ffffff",0,0,-.65); box(g,1.6,.025,.03,"#ffffff",0,0,.65);
      box(g,.5,.2,.18,"#d0683f",.55,0,.85); }
    else if(s==="water"){ cyl(g,.38,.12,"#e1d9c8"); var wd=new THREE.Mesh(geo.disk,mat("#45d0dd",{roughness:.15,emissive:"#0b5560",emissiveIntensity:.3})); wd.scale.set(.66,1,.66); wd.position.y=.12; g.add(wd); cyl(g,.06,.35,"#e1d9c8",0,.12,0); cyl(g,.12,.03,"#e1d9c8",0,.47,0) }
    else if(s==="amph"){ for(var r=0;r<3;r++){ var st=new THREE.Mesh(new THREE.CylinderGeometry(.9-r*.22,.9-r*.22,.1,16,1,false,0,Math.PI),mat("#e6dccb")); st.position.set(0,.05+r*.1,.2); st.castShadow=true; g.add(st) }
      box(g,.9,.08,.4,"#c8643b",0,0,-.55); box(g,.9,.5,.04,"#b98ad6",0,0,-.75) }
    else if(s==="picnic"){ box(g,.5,.16,.22,"#a7845a"); cyl(g,.015,.42,"#eeeeee",0,.16,0); var um=new THREE.Mesh(geo.cone,mat("#d0683f")); um.scale.set(.55,.14,.55); um.position.y=.5; um.castShadow=true; g.add(um); tree(g,.3,.3,.5) }
    else if(s==="dog"){ for(var f=0;f<12;f++){ var an=f/12*Math.PI*2; box(g,.04,.18,.04,"#a7845a",Math.cos(an)*.42,0,Math.sin(an)*.42) } tree(g,-.1,.05,.6); box(g,.12,.1,.12,"#d0683f",.2,0,-.2) }
    else { tree(g,-.25,-.2,.65); box(g,.34,.08,.1,"#a7845a",.15,.08,.22); box(g,.03,.1,.08,"#7a5a3c",.02,0,.22); box(g,.03,.1,.08,"#7a5a3c",.28,0,.22);
      if(G.hash(b.x,b.y,4)>.5){ for(var c4=0;c4<4;c4++) box(g,.03,.4,.03,"#f1e7d2",c4%2?.38:.08,0,c4<2?-.38:-.08); box(g,.36,.03,.36,"#c8643b",.23,.4,-.23) } }
  }
  world.add(g); bobjs[id]=g;
  if(anim){ g.scale.set(1,.01,1); growing.push({o:g,t:0}) }
}
R.refreshBuilding = function(t,id){ bldObj(t,t.blds[id],id,false) };

/* ---------- roads and cars ---------- */
var roadMarks;
function rebuildRoads(t){
  if(roadMarks) world.remove(roadMarks);
  roadTiles=[]; var dash=[];
  for(var q=0;q<N*N;q++){ if(t.kind[q]!==K.ROAD) continue; roadTiles.push(q);
    var x=q%N,y=Math.floor(q/N), E=x<N-1&&t.kind[q+1]===K.ROAD, W=x>0&&t.kind[q-1]===K.ROAD, S=y<N-1&&t.kind[q+N]===K.ROAD, Nn=y>0&&t.kind[q-N]===K.ROAD;
    if((E||W)&&!(S||Nn)) dash.push([x+.5,y+.5,0]); else if((S||Nn)&&!(E||W)) dash.push([x+.5,y+.5,1]);
  }
  roadMarks=new THREE.InstancedMesh(new THREE.PlaneGeometry(.34,.05).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:"#efe6cf"}),Math.max(1,dash.length));
  var m=new THREE.Matrix4(),qq=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0);
  dash.forEach(function(d,i){ qq.setFromAxisAngle(up,d[2]?Math.PI/2:0); m.compose(new THREE.Vector3(d[0],.015,d[1]),qq,new THREE.Vector3(1,1,1)); roadMarks.setMatrixAt(i,m) });
  roadMarks.count=dash.length; world.add(roadMarks);
  // cars
  var want=Math.min(46,Math.floor(roadTiles.length/4), Math.floor(t.pop/12)+(roadTiles.length?2:0));
  while(cars.length>want){ cars.pop(); scene.remove(carMeshes.pop()) }
  cars.forEach(function(c){ if(t.kind[c.a]!==K.ROAD||t.kind[c.b]!==K.ROAD){ c.a=c.b=roadTiles[Math.floor(Math.random()*roadTiles.length)]; c.p=1 } });
  while(cars.length<want&&roadTiles.length){
    var a=roadTiles[Math.floor(Math.random()*roadTiles.length)];
    cars.push({a:a,b:a,p:1,sp:.7+Math.random()*.6,prev:-1});
    var cm=new THREE.Group(); box(cm,.16,.1,.28,["#f4efe4","#d0683f","#45b8b0","#e0a341","#6a7f8f"][Math.floor(Math.random()*5)]); box(cm,.13,.07,.14,"#2d4552",0,.1,.02);
    scene.add(cm); carMeshes.push(cm);
  }
}
function stepCars(dt,t){
  if(!roadTiles.length) return;
  cars.forEach(function(c,i){
    c.p+=dt*c.sp*1.4;
    if(c.p>=1){ c.p=0; c.prev=c.a; c.a=c.b; var x=c.a%N,y=Math.floor(c.a/N), opts=[];
      [[1,0],[-1,0],[0,1],[0,-1]].forEach(function(d){ var nx=x+d[0],ny=y+d[1]; if(G.inb(nx,ny)&&t.kind[G.idx(nx,ny)]===K.ROAD) opts.push(G.idx(nx,ny)) });
      var fw=opts.filter(function(o){return o!==c.prev}); c.b=(fw.length?fw:opts.length?opts:[c.a])[Math.floor(Math.random()*(fw.length||opts.length||1))]; }
    var ax=c.a%N+.5, az=Math.floor(c.a/N)+.5, bx=c.b%N+.5, bz=Math.floor(c.b/N)+.5;
    var dx=bx-ax, dz=bz-az, m=carMeshes[i];
    var side = .17; // keep right
    m.position.set(ax+dx*c.p + (dz?(dz>0?-side:side):0), .02, az+dz*c.p + (dx?(dx>0?side:-side):0));
    if(dx||dz) m.rotation.y=Math.atan2(dx,dz);
  });
}

/* ---------- smoke ---------- */
var puffT=0, pv=new THREE.Vector3();
function stepSmoke(dt,running){
  if(running){ puffT+=dt; if(puffT>.18&&chimneys.length&&puffs.length<70){ puffT=0; var c=chimneys[Math.floor(Math.random()*chimneys.length)];
    pv.copy(c.local); c.g.localToWorld(pv);
    var m=new THREE.Mesh(geo.puff,new THREE.MeshStandardMaterial({color:c.steam?"#ffffff":"#d9d6d0",transparent:true,opacity:.75,flatShading:true,roughness:1}));
    m.position.copy(pv); scene.add(m); puffs.push({m:m,life:0}) } }
  for(var i=puffs.length-1;i>=0;i--){ var p=puffs[i]; p.life+=dt*(running?1:.2); p.m.position.y+=dt*.45*(running?1:.2); p.m.position.x+=dt*.12; p.m.scale.setScalar(1+p.life*1.4); p.m.material.opacity=.75*(1-p.life/2.6);
    if(p.life>2.6){ scene.remove(p.m); p.m.material.dispose(); puffs.splice(i,1) } }
}

/* ---------- apply changes from the simulation ---------- */
R.sync = function(t){
  if(G.dirtyAll){ G.dirtyAll=false; G.dirty=[]; R.buildTown(t); return }
  if(!G.dirty.length) return;
  var treesChanged=false, roadsChanged=false, seen={};
  G.dirty.forEach(function(r){
    for(var y=Math.max(0,r[1]);y<=Math.min(N-1,r[3]);y++)for(var x=Math.max(0,r[0]);x<=Math.min(N-1,r[2]);x++){
      var q=G.idx(x,y); if(seen[q]) continue; seen[q]=1;
      paintTile(t,q);
      var key=t.kind[q]+":"+t.lvl[q]+":"+t.bid[q]+":"+t.base[q];
      if(objs["k"+q]!==key){ var prev=objs["k"+q]; objs["k"+q]=key; tileObj(t,q,prev!==undefined&&t.lvl[q]>0); treesChanged=true; roadsChanged=true }
    }
  });
  // buildings: add missing, remove stale
  t.blds.forEach(function(b,id){ if(b&&!bobjs[id]) bldObj(t,b,id,true); if(!b&&bobjs[id]){ world.remove(bobjs[id]); bobjs[id]=null } });
  groundGeo.attributes.color.needsUpdate=true;
  if(treesChanged) buildTrees(t);
  if(roadsChanged) rebuildRoads(t);
  G.dirty=[];
};
R.refreshCars = function(t){ rebuildRoads(t) };

/* ---------- preview overlay ---------- */
var pm=new THREE.Matrix4();
R.preview = function(tiles, color, op){
  previewMesh.count=0; if(!tiles||!tiles.length) return;
  previewMesh.material.color.set(color||"#ffffff"); previewMesh.material.opacity=op||.55;
  tiles.forEach(function(q,i){ if(i>=N*N) return; pm.makeTranslation(q%N+.5,.05,Math.floor(q/N)+.5); previewMesh.setMatrixAt(i,pm) });
  previewMesh.count=Math.min(tiles.length,N*N); previewMesh.instanceMatrix.needsUpdate=true;
};
R.cursor = function(x,y,w,h){ if(x==null){cursorMesh.visible=false;return} cursorMesh.visible=true; cursorMesh.position.set(x+(w||1)/2,.06,y+(h||1)/2); cursorMesh.scale.set((w||1)*1.42,1,(h||1)*1.42) };

/* ---------- camera ---------- */
R.focus = function(x,y,close){ cam.tx=x+.5; cam.tz=y+.5; if(close) cam.tdist=Math.min(cam.tdist,18) };
R.rotate = function(dir){ cam.taz += dir*Math.PI/2 };
R.zoom = function(f){ cam.tdist=G.clamp(cam.tdist*f,9,62) };
function updateCamera(dt){
  var k=1-Math.pow(.0015,dt);
  cam.az+=(cam.taz-cam.az)*k; cam.dist+=(cam.tdist-cam.dist)*k;
  cam.el = .82+ (cam.dist-9)/53*.32;
  cam.tx=G.clamp(cam.tx,-4,N+4); cam.tz=G.clamp(cam.tz,-4,N+4);
  var cx=cam.tx+Math.sin(cam.az)*Math.cos(cam.el)*cam.dist, cz=cam.tz+Math.cos(cam.az)*Math.cos(cam.el)*cam.dist, cy=Math.sin(cam.el)*cam.dist;
  camera.position.set(cx,cy,cz); camera.lookAt(cam.tx,0,cam.tz);
  scene.fog.near=cam.dist*2.4; scene.fog.far=cam.dist*5.5+70;
  var tw=G.town(); if(tw) tw._cam={tx:cam.tx,tz:cam.tz};
}
var ray=new THREE.Raycaster(), plane=new THREE.Plane(new THREE.Vector3(0,1,0),0), v2=new THREE.Vector2(), hit=new THREE.Vector3();
R.groundAt = function(sx,sy){
  v2.set(sx/window.innerWidth*2-1, -(sy/window.innerHeight)*2+1); ray.setFromCamera(v2,camera);
  return ray.ray.intersectPlane(plane,hit)?{x:hit.x,z:hit.z}:null;
};
R.tileAt = function(sx,sy){ var p=R.groundAt(sx,sy); if(!p) return null; var x=Math.floor(p.x),y=Math.floor(p.z); return G.inb(x,y)?{x:x,y:y}:null };

/* ---------- input: one finger paints or pans, two fingers pan, pinch and twist ---------- */
R.input = function(el){
  var ptrs={}, mode=null, start=null, last=null, gest=null, downT=0;
  function list(){ return Object.keys(ptrs).map(function(k){return ptrs[k]}) }
  function centroid(a){ var x=0,y=0; a.forEach(function(p){x+=p.x;y+=p.y}); return {x:x/a.length,y:y/a.length} }
  el.addEventListener("pointerdown",function(e){
    el.setPointerCapture(e.pointerId); ptrs[e.pointerId]={x:e.clientX,y:e.clientY,b:e.button};
    var a=list();
    if(a.length===1){ downT=performance.now(); start={x:e.clientX,y:e.clientY}; last=start;
      var wantsPan = e.button===2||e.button===1||!G.UI.toolPaints();
      mode = wantsPan?"pan":"paint";
      if(mode==="paint"){ var tl=R.tileAt(e.clientX,e.clientY); if(tl) G.UI.paintStart(tl) }
    } else if(a.length===2){
      if(mode==="paint") G.UI.paintCancel();
      mode="gesture"; var c=centroid(a); gest={c:c, d:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y), ang:Math.atan2(a[1].y-a[0].y,a[1].x-a[0].x)};
    }
  });
  el.addEventListener("pointermove",function(e){
    if(!ptrs[e.pointerId]){ if(e.pointerType==="mouse"){ var tl=R.tileAt(e.clientX,e.clientY); G.UI.hover(tl) } return }
    ptrs[e.pointerId].x=e.clientX; ptrs[e.pointerId].y=e.clientY;
    var a=list();
    if(mode==="pan"&&a.length===1){ var p0=R.groundAt(last.x,last.y), p1=R.groundAt(e.clientX,e.clientY); if(p0&&p1){ cam.tx-=p1.x-p0.x; cam.tz-=p1.z-p0.z; updateCamera(0) } last={x:e.clientX,y:e.clientY} }
    else if(mode==="paint"){ var tl2=R.tileAt(e.clientX,e.clientY); if(tl2) G.UI.paintMove(tl2) }
    else if(mode==="gesture"&&a.length===2){
      var c=centroid(a), d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y), ang=Math.atan2(a[1].y-a[0].y,a[1].x-a[0].x);
      var g0=R.groundAt(gest.c.x,gest.c.y), g1=R.groundAt(c.x,c.y); if(g0&&g1){ cam.tx-=g1.x-g0.x; cam.tz-=g1.z-g0.z }
      if(d>10&&gest.d>10){ cam.tdist=G.clamp(cam.tdist*gest.d/d,9,62); cam.dist=cam.tdist }
      var da=ang-gest.ang; if(da>Math.PI)da-=2*Math.PI; if(da<-Math.PI)da+=2*Math.PI; cam.taz-=da; cam.az=cam.taz;
      gest={c:c,d:d,ang:ang}; updateCamera(0);
    }
  });
  function up(e){
    if(!ptrs[e.pointerId]) return;
    var was=mode, moved=start?Math.hypot(e.clientX-start.x,e.clientY-start.y):99;
    delete ptrs[e.pointerId];
    if(was==="paint"&&list().length===0){ var tl=R.tileAt(e.clientX,e.clientY); G.UI.paintEnd(tl) }
    if(was==="pan"&&list().length===0&&moved<8&&performance.now()-downT<400&&e.button===0){ var tl3=R.tileAt(e.clientX,e.clientY); G.UI.tap(tl3) }
    if(list().length===0) mode=null; else if(list().length===1&&was==="gesture"){ mode="pan"; var r=list()[0]; last={x:r.x,y:r.y}; start=null }
  }
  el.addEventListener("pointerup",up); el.addEventListener("pointercancel",function(e){ if(mode==="paint")G.UI.paintCancel(); delete ptrs[e.pointerId]; mode=null });
  el.addEventListener("contextmenu",function(e){e.preventDefault()});
  el.addEventListener("wheel",function(e){ e.preventDefault(); R.zoom(e.deltaY>0?1.12:1/1.12) },{passive:false});
  window.addEventListener("keydown",function(e){ if(e.target.tagName==="INPUT"||e.target.tagName==="TEXTAREA") return;
    var s=2; if(e.key==="q"||e.key==="Q") R.rotate(-1); else if(e.key==="e"||e.key==="E") R.rotate(1);
    else if("wasd".indexOf(e.key)>=0){ var f=e.key==="w"?[0,-1]:e.key==="s"?[0,1]:e.key==="a"?[-1,0]:[1,0]; var c=Math.cos(cam.az),sn=Math.sin(cam.az);
      cam.tx+= (f[0]*c + f[1]*sn)*s; cam.tz+= (-f[0]*sn + f[1]*c)*s } });
};

/* ---------- frame ---------- */
var wt=0;
R.frame = function(running, speed){
  var dt=Math.min(.05,clock.getDelta()); wt+=dt;
  updateCamera(dt);
  for(var i=growing.length-1;i>=0;i--){ var g=growing[i]; g.t+=dt*2.2; var s=Math.min(1,g.t); g.o.scale.y=.01+ (1-Math.pow(1-s,3))*.99 + Math.sin(s*Math.PI)*.08; if(s>=1){ g.o.scale.y=1; growing.splice(i,1) } }
  var t=G.town(); if(t) stepCars(running?dt*speed:0,t);
  stepSmoke(dt,running);
  water.position.y=-.12+Math.sin(wt*.8)*.015;
  water.material.color.setHSL(.52,.5,.52+Math.sin(wt*.5)*.012);
  renderer.render(scene,camera);
};
R.stormTint = function(on){ document.getElementById('rain').classList.toggle('on',!!on); var c=on?new THREE.Color("#7f99a4"):SKY; scene.background=c; scene.fog.color=c; sun.intensity=on?1.1:2.3; hemi.intensity=on?.9:1.25 };
})();
