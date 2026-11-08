/* Metro Governor: simulation core.
   One regional treasury, a coastal capital and inland sub-towns. Each town is a grid of tiles
   split into 3 x 3 districts that are bought one at a time (district expansion). */
(function(){
"use strict";
var G = window.G = {};
var N = G.N = 36, D = G.D = 12;           // grid size, district size
G.DAYS = 30;

/* tile base terrain */
var WATER=0, SAND=1, GRASS=2, JUNGLE=3;
G.T = {WATER:WATER,SAND:SAND,GRASS:GRASS,JUNGLE:JUNGLE};
/* what is built on a tile */
var NONE=0, ROAD=1, RZ=2, CZ=3, IZ=4, BLD=5;
G.K = {NONE:NONE,ROAD:ROAD,RZ:RZ,CZ:CZ,IZ:IZ,BLD:BLD};

G.POP  = [0,10,30,70];
G.JOBC = [0,6,18,40];
G.JOBI = [0,10,26,50];

/* Towns: names are places from the Bubble repo's Central Park list. The capital sits on the coast,
   the sub-towns push inland into the jungle. coast = sides that meet the sea (s,w,e,n). */
G.TOWNS = [
 {id:"cp", name:"Central Park", capital:true, coast:"se", jungle:.35, pos:[0.02,-0.20], start:7,
  trait:"Coastal capital. Trade through the port lifts industry.", ib:1.15, cb:1.1},
 {id:"cg", name:"Conservatory Green", coast:"w", jungle:.55, pos:[-0.30,-0.10], start:3,
  trait:"Beach town. Shops do well, and parks count for more here.", cb:1.25, leisure:1.2},
 {id:"bl", name:"Beeler", coast:"", jungle:.6, pos:[-0.12,0.05], start:4, river:true,
  trait:"River town. Water towers reach farther along the river.", water:1.25},
 {id:"op", name:"Observation Point", coast:"n", jungle:.55, pos:[0.10,0.30], start:1,
  trait:"Headland lookout. Visitors bring commercial demand.", cb:1.15},
 {id:"sp", name:"Spectator", coast:"", jungle:.65, pos:[0.22,0.04], start:4,
  trait:"Sports-mad plateau. Sports fields and pools count double.", leisure:1.3},
 {id:"fg", name:"Founders’ Green", coast:"", jungle:.7, pos:[-0.08,0.22], start:4,
  trait:"Old mill town. Industry pays well, but smoke upsets people more.", ib:1.25, smog:1.4},
 {id:"wb", name:"Willow Basin", coast:"", jungle:.8, pos:[0.32,0.20], start:4, river:true,
  trait:"Deep jungle basin. Residents care twice as much about clean air.", smog:2},
 {id:"pm", name:"Prairie Meadows", coast:"e", jungle:.45, pos:[0.40,-0.10], start:3,
  trait:"Open meadows on the east shore. Land is cheap to expand.", cheap:true}
];

/* Pools from the ParkCommand / AquaticsTech repos: buildable aquatic centers, one of each. */
G.POOLS = ["Splash Landing","Aviator","F-15","Jet Stream","Puddle Jumper","Maverick","Runway 35"];
G.PARTS = ["circulation pump seal","sand filter media","chlorine feeder","heater igniter","flow meter","pH probe","strainer basket","backwash valve"];

/* Park categories from Bubble, as buildable parks. */
G.PARKCAT = {
 large:{label:"Large park",  w:2,h:2,cost:1600,up:40,r:8, lv:1.0, color:"#4caf5f"},
 sports:{label:"Sports field",w:2,h:2,cost:1200,up:30,r:7, lv:.85, color:"#e0a341"},
 water:{label:"Water feature",w:1,h:1,cost:900, up:25,r:6, lv:.7, color:"#45b8b0"},
 amph:{label:"Amphitheater", w:2,h:2,cost:1400,up:30,r:8, lv:.85, color:"#b98ad6"},
 picnic:{label:"Picnic",      w:1,h:1,cost:600, up:12,r:5, lv:.55, color:"#e07a5f"},
 dog:{label:"Dog park",       w:1,h:1,cost:500, up:10,r:5, lv:.5,  color:"#a7845a"},
 small:{label:"Small park",   w:1,h:1,cost:350, up:8, r:4, lv:.45, color:"#8fcf6a"}
};

/* Service and utility buildings */
G.BLD = {
 power:{label:"Power plant", w:2,h:2,cost:3000,up:120,r:12,cap:900,fund:"util",smog:4},
 solar:{label:"Solar farm",  w:2,h:2,cost:2000,up:45, r:8, cap:380,fund:"util"},
 water:{label:"Water tower", w:1,h:1,cost:1200,up:50, r:8, cap:800,fund:"util"},
 clinic:{label:"Clinic",     w:1,h:1,cost:1500,up:90, r:9, fund:"health"},
 school:{label:"School",     w:2,h:2,cost:2200,up:120,r:10,fund:"edu"},
 safety:{label:"Safety post",w:1,h:1,cost:1300,up:80, r:9, fund:"safety"},
 pool:{label:"Aquatic center",w:2,h:2,cost:2800,up:110,r:11,fund:"parks"},
 park:{label:"Park"} // dimensions come from PARKCAT
};
G.COST = {road:15, zone:20, bulldoze:5, building:40};
G.FUNDS = [["health","Health"],["edu","Education"],["safety","Safety"],["parks","Parks and pools"],["util","Utilities"],["roads","Roads"]];

/* ---------- random ---------- */
function rng(seed){var s=seed>>>0||1;return function(){s^=s<<13;s^=s>>>17;s^=s<<5;return ((s>>>0)%100000)/100000}}
G.rng = rng;
function hash(x,y,k){var h=(x*374761393+y*668265263+(k||0)*982451653)>>>0;h=(h^(h>>>13))*1274126177>>>0;return ((h^(h>>>16))>>>0)/4294967296}
G.hash = hash;
function idx(x,y){return y*N+x}
G.idx = idx;
function inb(x,y){return x>=0&&y>=0&&x<N&&y<N}
G.inb = inb;
function clamp(v,a,b){return v<a?a:v>b?b:v}
G.clamp = clamp;
function distOf(x,y){return Math.floor(y/D)*3+Math.floor(x/D)}
G.distOf = distOf;

/* ---------- terrain ---------- */
function noise(x,y,seed){
  // value noise, two octaves
  function vn(x,y,s){var xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi;
    var a=hash(xi,yi,s),b=hash(xi+1,yi,s),c=hash(xi,yi+1,s),d=hash(xi+1,yi+1,s);
    var u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v}
  return vn(x/7,y/7,seed)*.65+vn(x/3,y/3,seed+9)*.35;
}
function makeTerrain(def, seed){
  var base = new Uint8Array(N*N);
  for(var y=0;y<N;y++)for(var x=0;x<N;x++){
    var t=GRASS, wob=noise(x,y,seed)*3;
    var dS=(N-1-y), dN=y, dW=x, dE=(N-1-x), sea=99;
    if(def.coast.indexOf("s")>=0) sea=Math.min(sea,dS-wob);
    if(def.coast.indexOf("n")>=0) sea=Math.min(sea,dN-wob);
    if(def.coast.indexOf("w")>=0) sea=Math.min(sea,dW-wob);
    if(def.coast.indexOf("e")>=0) sea=Math.min(sea,dE-wob*1.2+ (def.id==="cp"? (y/N)*4-2 : 0));
    if(sea<2.2) t=WATER; else if(sea<3.6) t=SAND;
    else if(noise(x+50,y+50,seed+3) < def.jungle*.9) t=JUNGLE;
    base[idx(x,y)]=t;
  }
  if(def.river){
    var rx=Math.floor(N*.35+hash(1,2,seed)*N*.3);
    for(var y2=0;y2<N;y2++){
      rx+= (hash(y2,3,seed)<.33?-1:hash(y2,4,seed)<.5?1:0); rx=clamp(rx,4,N-5);
      base[idx(rx,y2)]=WATER; if(hash(y2,5,seed)<.5) base[idx(rx+1,y2)]=WATER;
      for(var k=-2;k<=3;k++){var q=idx(clamp(rx+k,0,N-1),y2);if(base[q]===JUNGLE&&Math.abs(k)>1&&hash(k,y2,seed)<.6)base[q]=GRASS}
    }
  }
  return base;
}

function newTown(def, i){
  var seed = 1000+i*7919;
  var t = {
    id:def.id, i:i, founded:false, seed:seed,
    base:makeTerrain(def,seed), kind:new Uint8Array(N*N), lvl:new Uint8Array(N*N), bid:new Int16Array(N*N).fill(-1),
    blds:[], dist:[0,0,0,0,0,0,0,0,0],
    taxC:9, taxI:9, fund:{health:1,edu:1,safety:1,parks:1,util:1,roads:1},
    sat:50, satParts:null, pop:0, jobsC:0, jobsI:0, demand:[.6,.2,.3],
    hist:[], last:null, migrant:0, volunteer:0, stableMonths:0, foundedMonth:0
  };
  return t;
}

/* lay a starter road grid and a few residential zones in the starting district (GameSoul: first playable) */
function seedStart(t, def){
  var d=def.start, ox=(d%3)*D, oy=Math.floor(d/3)*D;
  t.dist[d]=1;
  // find a land row near the district middle
  var cy = oy+5, cx = ox+5;
  function landish(x,y){var b=t.base[idx(x,y)];return b!==WATER}
  for(var x=ox+1;x<ox+D-1;x++){ if(landish(x,cy)) setRoad(t,x,cy) }
  for(var y=oy+1;y<oy+D-1;y++){ if(landish(cx,y)) setRoad(t,cx,y) }
  for(var x2=ox+1;x2<ox+D-1;x2++){ var q=idx(x2,cy+4); if(inb(x2,cy+4)&&landish(x2,cy+4)) setRoad(t,x2,cy+4) }
  // starter residential zones beside the main road
  for(var x3=ox+2;x3<ox+D-2;x3++){
    if(x3===cx) continue;
    [cy-1,cy+1].forEach(function(yy){ var q=idx(x3,yy); if(t.kind[q]===NONE&&landish(x3,yy)){ t.kind[q]=RZ; clearTree(t,q);} });
  }
}
function setRoad(t,x,y){var q=idx(x,y);t.kind[q]=ROAD;t.lvl[q]=0;clearTree(t,q)}
function clearTree(t,q){ if(t.base[q]===JUNGLE) t.base[q]=GRASS }

G.newGame = function(){
  var S = G.S = {
    v:1, money:20000, month:0, towns:[], cur:0, goalsDone:{}, phase:"start",
    builtParks:{}, builtPools:{}, poolLog:[], reports:[], news:[], events:{storm:0,downturn:0,heat:0},
    settings:{events:true, music:.6, amb:.5}, record:0, bestRecord:0, unread:0, austerity:false,
    volunteerCooldown:0
  };
  G.TOWNS.forEach(function(def,i){ S.towns.push(newTown(def,i)) });
  var cap=S.towns[0]; cap.founded=true; seedStart(cap,G.TOWNS[0]);
  G.recalc(cap); G.dirtyAll=true;
  G.news("Governor takes office in Central Park. The capital waits for power and water.");
};

G.def = function(t){return G.TOWNS[t.i]};
G.town = function(){return G.S.towns[G.S.cur]};
G.monthName = function(m){var M=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];return M[m%12]+" "+(2027+Math.floor(m/12))};
G.money = function(v){var s=Math.round(Math.abs(v)).toLocaleString("en-US");return (v<0?"−$":"$")+s};

/* ---------- placement rules ---------- */
G.unlocked = function(t,x,y){ return !!t.dist[distOf(x,y)] };
G.canBuildTile = function(t,x,y){
  if(!inb(x,y)||!G.unlocked(t,x,y)) return false;
  var q=idx(x,y); return t.base[q]!==WATER && t.kind[q]===NONE;
};
G.footprint = function(type, sub){
  if(type==="park"){var c=G.PARKCAT[sub];return [c.w,c.h]}
  var b=G.BLD[type]; return [b.w,b.h];
};
G.buildingCost = function(type, sub){
  if(type==="park") return G.PARKCAT[sub].cost;
  return G.BLD[type].cost;
};
G.canPlace = function(t,type,sub,x,y){
  var f=G.footprint(type,sub);
  for(var j=0;j<f[1];j++)for(var i=0;i<f[0];i++){ if(!G.canBuildTile(t,x+i,y+j)) return false }
  return true;
};
G.placeBuilding = function(t,type,sub,x,y,name){
  var f=G.footprint(type,sub), cost=G.buildingCost(type,sub);
  var b={type:type, sub:sub||null, x:x, y:y, w:f[0], h:f[1], name:name||null, cond:1, born:G.S.month, closed:false};
  var id=t.blds.length; t.blds.push(b);
  for(var j=0;j<f[1];j++)for(var i=0;i<f[0];i++){var q=idx(x+i,y+j);t.kind[q]=BLD;t.bid[q]=id;t.lvl[q]=0;clearTree(t,q)}
  G.S.money-=cost; G.recalc(t); G.markDirty(t,x-1,y-1,x+f[0],y+f[1]);
  if(type==="park"&&name) G.S.builtParks[name]=t.id;
  if(type==="pool"&&name) G.S.builtPools[name]=t.id;
  return b;
};
G.removeAt = function(t,x,y){
  var q=idx(x,y), k=t.kind[q];
  if(k===NONE){ if(t.base[q]===JUNGLE){ t.base[q]=GRASS; G.markDirty(t,x,y,x,y); return G.COST.bulldoze } return 0 }
  if(k===BLD){
    var id=t.bid[q], b=t.blds[id]; if(!b) return 0;
    for(var j=0;j<b.h;j++)for(var i=0;i<b.w;i++){var p=idx(b.x+i,b.y+j);t.kind[p]=NONE;t.bid[p]=-1}
    if(b.type==="park"&&b.name) delete G.S.builtParks[b.name];
    if(b.type==="pool"&&b.name) delete G.S.builtPools[b.name];
    t.blds[id]=null; G.recalc(t); G.markDirty(t,b.x-1,b.y-1,b.x+b.w,b.y+b.h);
    return G.COST.building;
  }
  t.kind[q]=NONE; t.lvl[q]=0; G.recalc(t); G.markDirty(t,x-1,y-1,x+1,y+1);
  return G.COST.bulldoze;
};
G.districtCost = function(t){
  var n=t.dist.reduce(function(a,b){return a+b},0);
  return Math.round((G.def(t).cheap?1700:2500)*n);
};

/* ---------- coverage ---------- */
function stamp(arr, cx, cy, r, amt, mode){
  var r2=r*r;
  for(var y=Math.max(0,Math.floor(cy-r));y<=Math.min(N-1,Math.ceil(cy+r));y++)
  for(var x=Math.max(0,Math.floor(cx-r));x<=Math.min(N-1,Math.ceil(cx+r));x++){
    var dx=x+.5-cx, dy=y+.5-cy, d2=dx*dx+dy*dy; if(d2>r2) continue;
    var f = mode==="flat"?amt:amt*(1-Math.sqrt(d2)/r*.6);
    var q=idx(x,y); arr[q]=Math.min(mode==="flat"?1:1.6, arr[q]+f);
  }
}
G.recalc = function(t){
  var def=G.def(t), A=N*N;
  var cov = t.cov = {power:new Float32Array(A),water:new Float32Array(A),health:new Float32Array(A),edu:new Float32Array(A),
    safety:new Float32Array(A),leisure:new Float32Array(A),smog:new Float32Array(A),road:new Uint8Array(A)};
  var capP=0, capW=0;
  t.blds.forEach(function(b){
    if(!b) return;
    var cx=b.x+b.w/2, cy=b.y+b.h/2, B=G.BLD[b.type];
    var eff = Math.min(1.2, t.fund[B.fund||"parks"]||1) * (b.cond<.35?.4:1);
    if(b.type==="power"){ stamp(cov.power,cx,cy,B.r,1,"flat"); capP+=B.cap*Math.min(1,t.fund.util); stamp(cov.smog,cx,cy,5,.5) }
    else if(b.type==="solar"){ stamp(cov.power,cx,cy,B.r,1,"flat"); capP+=B.cap*Math.min(1,t.fund.util) }
    else if(b.type==="water"){ stamp(cov.water,cx,cy,B.r*(def.water||1),1,"flat"); capW+=B.cap*Math.min(1,t.fund.util) }
    else if(b.type==="clinic") stamp(cov.health,cx,cy,B.r,eff);
    else if(b.type==="school") stamp(cov.edu,cx,cy,B.r,eff);
    else if(b.type==="safety") stamp(cov.safety,cx,cy,B.r,eff);
    else if(b.type==="pool"){ if(!b.closed) stamp(cov.leisure,cx,cy,B.r,eff*(def.leisure||1)*(G.S&&G.S.events.heat?1.5:1)) }
    else if(b.type==="park"){ var c=G.PARKCAT[b.sub]; var m=(def.leisure||1)*((b.sub==="sports"&&def.id==="sp")?1.5:1);
      stamp(cov.leisure,cx,cy,c.r,c.lv*eff*m); }
  });
  // industry smoke
  for(var q=0;q<A;q++){ if(t.kind[q]===IZ&&t.lvl[q]>0){ stamp(cov.smog,(q%N)+.5,Math.floor(q/N)+.5,3+t.lvl[q],.12*t.lvl[q]) } }
  // road access: tile next to a road (4-neighbour)
  for(var y=0;y<N;y++)for(var x=0;x<N;x++){
    var qq=idx(x,y);
    if((x>0&&t.kind[qq-1]===ROAD)||(x<N-1&&t.kind[qq+1]===ROAD)||(y>0&&t.kind[qq-N]===ROAD)||(y<N-1&&t.kind[qq+N]===ROAD)) cov.road[qq]=1;
  }
  t.capP=capP; t.capW=capW;
  G.tally(t);
};
G.tally = function(t){
  var pop=0,jc=0,ji=0,load=0;
  for(var q=0;q<N*N;q++){var k=t.kind[q],l=t.lvl[q]; if(!l) continue;
    if(k===RZ){pop+=G.POP[l];load+=G.POP[l]} else if(k===CZ){jc+=G.JOBC[l];load+=G.JOBC[l]*1.3} else if(k===IZ){ji+=G.JOBI[l];load+=G.JOBI[l]*2}}
  t.pop=pop; t.jobsC=jc; t.jobsI=ji; t.load=load;
  t.shortP = load>0 ? clamp(t.capP/load,0,1) : 1;
  t.shortW = load>0 ? clamp(t.capW/load,0,1) : 1;
};

/* ---------- demand ---------- */
G.regionJobs = function(){
  var surplus=0, S=G.S;
  S.towns.forEach(function(t){ if(t.founded) surplus+=Math.max(0,(t.jobsC+t.jobsI)-t.pop*.55) });
  return surplus;
};
G.demand = function(t, surplus){
  var def=G.def(t), workers=t.pop*.55, jobs=t.jobsC+t.jobsI;
  var others = Math.max(0, surplus - Math.max(0,jobs-workers));
  var satF = clamp((t.sat-35)/30, -1, 1.2);
  var r = (jobs + others*.5 - workers + 40 + t.migrant) * (satF<0?1:.5+satF*.6) + (satF<0?satF*40:0);
  var c = (t.pop*.3 + 14 - t.jobsC) * (def.cb||1) - (t.taxC-9)*(3+t.pop*.02);
  var down = G.S.events.downturn>0 ? .4 : 1;
  var iBase = (30 + t.pop*.26)*(def.ib||1)*down;
  var i = iBase - t.jobsI - (t.taxI-9)*(3+t.pop*.02);
  var sc = 25 + t.pop*.08;
  t.demand = [clamp(r/sc,-1,1), clamp(c/sc,-1,1), clamp(i/sc,-1,1)];
  return t.demand;
};

/* ---------- daily growth ---------- */
G.dayTick = function(){
  var S=G.S, surplus=G.regionJobs(), changed=false;
  S.towns.forEach(function(t){
    if(!t.founded) return;
    G.demand(t,surplus);
    var zl=[]; for(var q=0;q<N*N;q++){var k=t.kind[q];if(k>=RZ&&k<=IZ)zl.push(q)}
    if(!zl.length) return;
    var tries = 1 + Math.ceil(zl.length*.05);
    for(var n=0;n<tries;n++){
      var q2 = zl[Math.floor(Math.random()*zl.length)], k2=t.kind[q2];
      if(k2<RZ||k2>IZ) continue;
      var dem = t.demand[k2-RZ], l=t.lvl[q2];
      var ok = t.cov.road[q2] && t.cov.power[q2]>0 && t.cov.water[q2]>0;
      var short = Math.min(t.shortP,t.shortW);
      if(ok && dem>0 && l<3 && short>.98){
        var need = l===0?0 : l===1? 45 : 62;
        var svc = (t.cov.health[q2]+t.cov.edu[q2]+t.cov.safety[q2])/3 + t.cov.leisure[q2]*.3;
        if(k2===RZ && l>=1 && svc < (l===1?.15:.45)) continue;
        if(k2===RZ && t.cov.smog[q2]>.5 && l>=1) continue;
        if(t.sat>=need && Math.random()<dem*(l===0?.55:.18)){ t.lvl[q2]=l+1; changed=true; G.markDirty(t,q2%N,Math.floor(q2/N),q2%N,Math.floor(q2/N)) }
      } else if(l>0 && (!ok || dem<-.4 || short<.8) && Math.random()<.08){
        t.lvl[q2]=l-1; changed=true; G.markDirty(t,q2%N,Math.floor(q2/N),q2%N,Math.floor(q2/N));
      }
    }
    // unrest: people leave when satisfaction collapses
    if(t.sat<35 && t.pop>0 && Math.random()<.35){
      for(var a=0;a<12;a++){ var q3=Math.floor(Math.random()*N*N); if(t.kind[q3]===RZ&&t.lvl[q3]>0){ t.lvl[q3]--; t.leaving=(t.leaving||0)+10; changed=true; G.markDirty(t,q3%N,Math.floor(q3/N),q3%N,Math.floor(q3/N)); break } }
    }
    if(changed) G.tally(t);
  });
  return changed;
};

/* ---------- satisfaction ---------- */
G.satisfaction = function(t, surplus){
  var def=G.def(t), tot=0, util=0, svc=0, lei=0, env=0;
  for(var q=0;q<N*N;q++){
    var k=t.kind[q], l=t.lvl[q]; if(k<RZ||k>IZ||!l) continue;
    var w = k===RZ ? G.POP[l] : (k===CZ?G.JOBC[l]:G.JOBI[l])*.25;
    tot+=w;
    util += w*((t.cov.power[q]>0?.5:0)+(t.cov.water[q]>0?.5:0));
    if(k===RZ){ svc += w*Math.min(1,(t.cov.health[q]+t.cov.edu[q]+t.cov.safety[q])/3*1.25);
      lei += w*Math.min(1,t.cov.leisure[q]);
      env += w*clamp(1-t.cov.smog[q]*(def.smog||1),0,1); }
    else { svc+=w*.6; lei+=w*.6; env+=w }
  }
  if(tot===0) return {util:1,svc:.5,lei:.5,emp:1,cost:.6,env:1,score:50};
  util = util/tot * Math.min(t.shortP,t.shortW);
  svc/=tot; lei/=tot; env/=tot;
  var workers=t.pop*.55, jobs=t.jobsC+t.jobsI;
  var others=Math.max(0, surplus-Math.max(0,jobs-workers));
  var emp = workers>0 ? clamp((jobs+others*.5)/workers,0,1) : 1;
  var avgTax=(t.taxC+t.taxI)/2;
  var cost = clamp(1-(avgTax-5)/14,0,1);
  // jungle kept inside owned land
  var own=0,jung=0; for(var q2=0;q2<N*N;q2++){ if(t.dist[distOf(q2%N,Math.floor(q2/N))]&&t.base[q2]!==WATER){own++; if(t.base[q2]===JUNGLE&&t.kind[q2]===NONE)jung++} }
  var green = own? Math.min(1,jung/own/.18) : 1;
  env = env*.85 + green*.15;
  var score = 100*(.18*util + .2*svc + .12*lei + .2*emp + .16*cost + .14*env);
  if(t.volunteer>0) score+=4;
  if(G.S.events.storm>0 && G.def(t).coast) score-=6;
  if(G.S.austerity) score-=5;
  return {util:util,svc:svc,lei:lei,emp:emp,cost:cost,env:env,score:clamp(score,0,100)};
};

/* ---------- monthly budget ---------- */
G.ledger = function(t){
  var inC = t.jobsC*t.taxC*.6*(G.def(t).cb>1?1.05:1)*(G.S.events.downturn>0?.8:1);
  var inI = t.jobsI*t.taxI*.52*(G.def(t).ib||1);
  var ex = {health:0,edu:0,safety:0,parks:0,util:0,roads:0};
  t.blds.forEach(function(b){ if(!b) return;
    var up = b.type==="park" ? G.PARKCAT[b.sub].up : G.BLD[b.type].up;
    var f = G.BLD[b.type].fund || "parks";
    ex[f]+=up*t.fund[f];
  });
  var roads=0; for(var q=0;q<N*N;q++) if(t.kind[q]===ROAD) roads++;
  ex.roads = roads*.6*t.fund.roads;
  var exp=0; for(var k in ex) exp+=ex[k];
  return {inC:inC, inI:inI, ex:ex, income:inC+inI, expense:exp, net:inC+inI-exp, roads:roads};
};

G.monthTick = function(){
  var S=G.S, surplus=G.regionJobs(), total={income:0,expense:0,net:0}, msgs=[];
  S.month++;
  // events wind down
  ["storm","downturn","heat"].forEach(function(k){ if(S.events[k]>0) S.events[k]-- });
  if(S.volunteerCooldown>0) S.volunteerCooldown--;
  S.towns.forEach(function(t){
    if(!t.founded) return;
    // pools wear (AquaticsTech plant maintenance); weather hold during storms (ParkCommand)
    t.blds.forEach(function(b){ if(!b||b.type!=="pool") return;
      b.cond = clamp(b.cond - .03/Math.max(.4,t.fund.parks), 0, 1);
      var wasClosed=b.closed;
      b.closed = b.cond<.35 || (S.events.storm>0 && !!G.def(t).coast);
      if(b.closed && !wasClosed) G.report(t,"pool",(S.events.storm>0?"Weather hold: the "+b.name+" pool is cleared until the storm passes.":"The "+b.name+" pool closed. Its plant needs service."),b.x,b.y);
    });
    G.recalc(t);
    var L=G.ledger(t); t.last=L;
    total.income+=L.income; total.expense+=L.expense; total.net+=L.net;
    var sp=G.satisfaction(t,surplus); t.satParts=sp;
    var prev=t.sat;
    t.sat = t.pop>0 ? t.sat + (sp.score-t.sat)*.35 : sp.score*.5+25;
    t.hist.push({m:S.month, net:Math.round(L.net), sat:Math.round(t.sat), pop:t.pop});
    if(t.hist.length>24) t.hist.shift();
    if(t.volunteer>0) t.volunteer--;
    // migration
    if(t.leaving){
      var best=null; S.towns.forEach(function(o){ if(o!==t&&o.founded&&(!best||o.sat>best.sat)) best=o });
      if(best && best.sat>t.sat+5){ best.migrant += t.leaving*.6; G.news((t.leaving)+" residents left "+G.def(t).name+" for "+G.def(best).name+".") }
      else G.news(t.leaving+" residents left "+G.def(t).name+" for the mainland.");
      t.leaving=0;
    }
    t.migrant *= .5;
    if(t.sat>=55 && L.net>=0) t.stableMonths++; else t.stableMonths=0;
    G.fieldReports(t, sp, prev);
  });
  S.money += total.net;
  // debt
  if(S.money<0){ var interest=Math.abs(S.money)*.015; S.money-=interest; total.interest=interest; total.net-=interest }
  var wasAusterity=S.austerity;
  S.austerity = S.money < -5000;
  if(S.austerity && !wasAusterity) G.news("Treasury in debt. Services are cut to 70% until the books recover.");
  if(!S.austerity && wasAusterity) G.news("Debt cleared. Service funding is restored.");
  if(S.austerity) S.towns.forEach(function(t){ for(var k in t.fund) t.fund[k]=Math.min(t.fund[k],.7) });
  // regional record: the win condition is sustaining satisfaction and profit over time
  var founded=S.towns.filter(function(t){return t.founded&&t.pop>0});
  var rsat = founded.length? founded.reduce(function(a,t){return a+t.sat*t.pop},0)/Math.max(1,founded.reduce(function(a,t){return a+t.pop},0)) : 50;
  S.regionSat = rsat;
  if(rsat>=60 && total.net>=0 && founded.length){ S.record++; if(S.record>S.bestRecord){S.bestRecord=S.record; [6,12,24,60,120].forEach(function(m){ if(S.record===m) G.news("Governor’s record: "+m+" months of a happy, profitable region.") })} }
  else S.record=0;
  S.lastTotal=total;
  if(S.settings.events) G.rollEvents();
  return total;
};

/* ---------- island events (storms, downturns, heat) ---------- */
G.rollEvents = function(){
  var S=G.S, m=S.month%12, r=Math.random();
  if(S.month<5) return;
  var stormChance = (m>=5&&m<=9)? .1 : .03;
  if(!S.events.storm && r<stormChance){
    S.events.storm=1;
    var hit=0;
    S.towns.forEach(function(t){ if(!t.founded||!G.def(t).coast) return;
      for(var n=0;n<6;n++){ var q=Math.floor(Math.random()*N*N); if(t.kind[q]>=RZ&&t.kind[q]<=IZ&&t.lvl[q]>0){ t.lvl[q]--; hit++; G.markDirty(t,q%N,Math.floor(q/N),q%N,Math.floor(q/N)) } }
      G.tally(t);
    });
    var repair = 300+hit*80; S.money-=repair;
    G.news("Tropical storm makes landfall. Coastal towns take damage. Repairs cost "+G.money(repair)+".", true);
    G.crisis=1;
    return;
  }
  if(!S.events.downturn && Math.random()<.03){ S.events.downturn=4+Math.floor(Math.random()*3); G.news("Mainland markets slump. Industry demand falls for a few months.", true); G.crisis=1; return }
  if(!S.events.heat && (m>=4&&m<=8) && Math.random()<.08){ S.events.heat=1; G.news("Heatwave across the island. Pools and parks matter more this month.") }
};

/* ---------- field reports (VoluntTold-style citizen voices) ---------- */
var NAMES=["Ana R.","Marco T.","Lucía P.","Dev K.","Rosa M.","Kai L.","Inés G.","Tomás B.","Priya S.","Joel W.","Mara F.","Luis O.","Nadia H.","Teo C.","Sofía D.","Omar N.","Elena V.","Rafa J."];
G.report = function(t,kind,text,x,y){
  var S=G.S; S.reports.unshift({m:S.month,town:t.id,kind:kind,text:text,x:x,y:y,who:NAMES[Math.floor(Math.random()*NAMES.length)]});
  if(S.reports.length>40) S.reports.length=40; S.unread++;
};
function findTile(t,test){ for(var n=0;n<300;n++){var q=Math.floor(Math.random()*N*N); if(test(q)) return q} return -1 }
G.fieldReports = function(t, sp, prev){
  if(t.pop===0){
    if(t.kind.indexOf(RZ)>=0){
      var noP = !t.blds.some(function(b){return b&&(b.type==="power"||b.type==="solar")});
      var noW = !t.blds.some(function(b){return b&&b.type==="water"});
      if(noP||noW) G.report(t,"util","Families are waiting to move in, but the lots have no "+(noP&&noW?"power or water":noP?"power":"water")+" yet.");
    }
    return;
  }
  var issues=[
    [1-sp.util, function(){var q=findTile(t,function(q){return t.kind[q]===RZ&&(t.cov.power[q]===0||t.cov.water[q]===0)});
      return [q, (t.shortP<1||t.shortW<1)?"Brownouts every evening. The plant can’t keep up.":"Our block still has no "+(q>=0&&t.cov.power[q]===0?"power":"water")+"."]}],
    [1-sp.emp, function(){return [-1,"Half my street is looking for work. We need shops and industry."]}],
    [1-sp.cost, function(){return [-1,"Prices keep climbing. Taxes on businesses land on our groceries."]}],
    [1-sp.env, function(){var q=findTile(t,function(q){return t.kind[q]===RZ&&t.cov.smog[q]>.3});return [q,"Smoke from the factories drifts over our homes every afternoon."]}],
    [1-sp.svc, function(){var q=findTile(t,function(q){return t.kind[q]===RZ&&t.lvl[q]>0&&t.cov.health[q]+t.cov.edu[q]<.2});return [q,"The nearest clinic and school are too far from us."]}],
    [1-sp.lei, function(){var q=findTile(t,function(q){return t.kind[q]===RZ&&t.lvl[q]>0&&t.cov.leisure[q]<.1});return [q,"There’s nowhere for the kids to play. A park would change everything."]}]
  ];
  issues.sort(function(a,b){return b[0]-a[0]});
  if(issues[0][0]>.35){ var r=issues[0][1](); var q=r[0]; G.report(t,"issue",r[1], q>=0?q%N:undefined, q>=0?Math.floor(q/N):undefined) }
  else if(t.sat-prev>3 || (t.sat>70&&Math.random()<.3)) G.report(t,"good",["The new neighborhood feels like home already.","Clean streets, steady work. Good month.","We had the whole block out at the park on Sunday."][Math.floor(Math.random()*3)]);
};

G.news = function(text, alarm){ G.S.news.unshift({m:G.S.month,text:text,alarm:!!alarm}); if(G.S.news.length>30)G.S.news.length=30; if(G.onNews) G.onNews(text,alarm) };

/* ---------- dirty tracking for the renderer ---------- */
G.dirty = []; G.dirtyAll=false;
G.markDirty = function(t,x0,y0,x1,y1){ if(G.S&&t===G.town()) G.dirty.push([x0,y0,x1,y1]) };

/* ---------- save / load (RLE for the tile arrays) ---------- */
function rle(arr){var out=[],i=0;while(i<arr.length){var v=arr[i],n=1;while(i+n<arr.length&&arr[i+n]===v)n++;out.push(n>1?v+"*"+n:String(v));i+=n}return out.join(",")}
function unrle(s,Ctor,len){var a=new Ctor(len),i=0;s.split(",").forEach(function(p){var m=p.split("*"),v=+m[0],n=m[1]?+m[1]:1;for(var k=0;k<n;k++)a[i++]=v});return a}
G.serialize = function(){
  var S=G.S, o=JSON.parse(JSON.stringify(S,function(k,v){ if(k==="cov"||k==="base"||k==="kind"||k==="lvl"||k==="bid"||k==="last"||k==="satParts") return undefined; return v }));
  o.towns.forEach(function(ot,i){var t=S.towns[i]; ot.base=rle(t.base); ot.kind=rle(t.kind); ot.lvl=rle(t.lvl); ot.bid=rle(t.bid)});
  return JSON.stringify(o);
};
G.deserialize = function(str){
  var o=JSON.parse(str);
  o.towns.forEach(function(t){ t.base=unrle(t.base,Uint8Array,N*N); t.kind=unrle(t.kind,Uint8Array,N*N); t.lvl=unrle(t.lvl,Uint8Array,N*N); t.bid=unrle(t.bid,Int16Array,N*N) });
  G.S=o; o.towns.forEach(function(t){ G.recalc(t) }); G.dirtyAll=true;
};
/* Saving: localStorage first (fast), IndexedDB as a fallback. Every app on bombarules.github.io
   shares one small localStorage space, so it can fill up; IndexedDB has much more room. */
var KEY="metrogov1";
function idbOpen(){ return new Promise(function(res,rej){ try{ var r=indexedDB.open("metrogov",1);
  r.onupgradeneeded=function(){ r.result.createObjectStore("saves") }; r.onsuccess=function(){ res(r.result) }; r.onerror=function(){ rej(r.error) } }catch(e){ rej(e) } }) }
function idbSet(v){ return idbOpen().then(function(db){ return new Promise(function(res,rej){ var tx=db.transaction("saves","readwrite"); tx.objectStore("saves").put(v,KEY); tx.oncomplete=function(){res(true)}; tx.onerror=function(){rej(tx.error)} }) }) }
function idbGet(){ return idbOpen().then(function(db){ return new Promise(function(res){ var r=db.transaction("saves").objectStore("saves").get(KEY); r.onsuccess=function(){res(r.result||null)}; r.onerror=function(){res(null)} }) }).catch(function(){ return null }) }
function stamp(s){ try{ return JSON.parse(s).savedAt||0 }catch(e){ return -1 } }
G.saveError = null;
G.save = function(){
  var data; try{ G.S.savedAt=Date.now(); data=G.serialize() }catch(e){ G.saveError="error"; return Promise.resolve(false) }
  try{ localStorage.setItem(KEY,data); G.saveMode="local"; G.saveError=null; G.lastSave=Date.now(); return Promise.resolve(true) }
  catch(e){
    var quota = e && (e.name==="QuotaExceededError"||e.code===22||e.code===1014);
    return idbSet(data).then(function(){ G.saveMode="idb"; G.saveError=null; G.lastSave=Date.now();
        try{ localStorage.removeItem(KEY) }catch(e2){} return true })
      .catch(function(){ G.saveError = quota?"full":"blocked"; return false });
  }
};
G.loadAny = function(){
  var local=null; try{ local=localStorage.getItem(KEY) }catch(e){}
  return idbGet().then(function(idb){
    var pick = (stamp(idb)>stamp(local)) ? idb : local;
    if(!pick) return false;
    try{ G.deserialize(pick); return true }catch(e){ return false }
  });
};
G.exportCode = function(){ return btoa(unescape(encodeURIComponent(G.serialize()))) };
G.importCode = function(code){ G.deserialize(decodeURIComponent(escape(atob(code.trim())))); G.save() };
})();
