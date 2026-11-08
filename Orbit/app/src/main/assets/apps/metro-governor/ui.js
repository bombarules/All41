/* Metro Governor: interface, tools, panels, maps and the game loop. The governor never appears;
   everything happens through menus and the city's response. */
(function(){
"use strict";
var G=window.G, R=G.R, A=G.A, N=G.N, K=G.K, T=G.T;
var UI = G.UI = {tool:"inspect", sub:null, park:null, paint:null, speed:1, open:null};
var $=function(id){return document.getElementById(id)};
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}

/* ---------- icons ---------- */
var IC = {
 inspect:'<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
 road:'<path d="M8 3L5 21M16 3l3 18M12 5v3M12 11v3M12 17v3"/>',
 zone:'<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>',
 util:'<path d="M13 2L5 14h6l-1 8 8-12h-6z"/>',
 svc:'<path d="M12 3v18M3 12h18"/><rect x="5" y="5" width="14" height="14" rx="3"/>',
 park:'<path d="M12 21v-6M12 15c-4 0-6-2.5-6-6a6 6 0 0 1 12 0c0 3.5-2 6-6 6z"/>',
 pool:'<path d="M3 16c2 0 2 1.5 4.5 1.5S10 16 12 16s2 1.5 4.5 1.5S19 16 21 16M3 20c2 0 2 1.5 4.5 1.5S10 20 12 20s2 1.5 4.5 1.5S19 20 21 20M8 13V5a2 2 0 0 1 4 0M16 13V5a2 2 0 0 0-4 0"/>',
 district:'<path d="M3 3h8v8H3zM13 13h8v8h-8z"/><path d="M17 3v8M13 7h8"/>',
 bulldoze:'<path d="M3 17h13l3-4h2M5 17v-4h6l2 4M6 21a2 2 0 1 0 0-.1M14 21a2 2 0 1 0 0-.1"/>'
};
function svg(p){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+p+'</svg>'}

var TOOLS=[
 {id:"inspect",label:"Inspect"},
 {id:"road",label:"Road"},
 {id:"zone",label:"Zone",sub:[["R","Homes","#b7e39a"],["C","Shops","#a6d9e8"],["I","Industry","#ecc98c"],["U","Unzone","#8a949a"]]},
 {id:"util",label:"Utilities",sub:[["power","Power plant"],["solar","Solar farm"],["water","Water tower"]]},
 {id:"svc",label:"Services",sub:[["clinic","Clinic"],["school","School"],["safety","Safety post"]]},
 {id:"park",label:"Parks"},
 {id:"pool",label:"Pools"},
 {id:"district",label:"Expand"},
 {id:"bulldoze",label:"Bulldoze"}
];
var HINTS={
 inspect:"Tap anything to inspect it. Drag to move, pinch to zoom, twist with two fingers to rotate.",
 road:"Drag to lay a road. Lots need a road beside them to grow.",
 zone:"Drag a rectangle to zone it. Zoned lots grow once they have a road, power and water.",
 util:"Tap a spot to place it. Lots inside the ring get power or water.",
 svc:"Tap a spot to place it. Residents nearby are happier and neighborhoods grow taller.",
 park:"Choose a place from the list, then tap where it goes.",
 pool:"Choose a pool, then tap a 2 by 2 spot. Pools need plant upkeep.",
 district:"Tap a locked district next to your land to open it.",
 bulldoze:"Drag over anything to clear it. Clearing jungle costs $5 a tile."
};

/* ---------- tool dock ---------- */
function buildTools(){
  $("tools").innerHTML = TOOLS.map(function(t){ return '<button class="tool" data-tool="'+t.id+'" aria-pressed="false">'+svg(IC[t.id])+'<span>'+t.label+'</span></button>' }).join("")+'<div id="rci" title="Demand for homes, shops and industry" aria-label="Demand"><i></i><i></i><i></i></div>';
  $("tools").addEventListener("click",function(e){ var b=e.target.closest("[data-tool]"); if(b) setTool(b.dataset.tool) });
}
function setTool(id, sub){
  UI.tool=id; UI.paint=null; R.preview(null);
  var t=TOOLS.filter(function(x){return x.id===id})[0];
  document.querySelectorAll("[data-tool]").forEach(function(b){ b.setAttribute("aria-pressed", b.dataset.tool===id) });
  if(sub!==undefined) UI.sub=sub; else if(t.sub) UI.sub=(UI.sub&&t.sub.some(function(s){return s[0]===UI.sub}))?UI.sub:t.sub[0][0]; else UI.sub=null;
  if(id==="park" && !UI.park){ openPanel("parks"); }
  if(id==="pool" && !UI.sub){ var free=G.POOLS.filter(function(p){return !G.S.builtPools[p]}); UI.sub=free[0]||null }
  renderSub(); hint(HINTS[id]); $("inspect").classList.add("hidden");
  if(id==="district") R.preview(lockedTiles(), "#45b8b0", .3); 
}
function renderSub(){
  var el=$("sub"), id=UI.tool, html="";
  var t=TOOLS.filter(function(x){return x.id===id})[0];
  if(t.sub){ html=t.sub.map(function(s){ var cost = id==="zone"? (s[0]==="U"?"":"$"+G.COST.zone+"/tile") : G.money(G.BLD[s[0]].cost);
      return '<button class="opt" data-sub="'+s[0]+'" aria-pressed="'+(UI.sub===s[0])+'">'+(s[2]?'<span class="sw" style="background:'+s[2]+'"></span>':'')+s[1]+' <small>'+cost+'</small></button>' }).join("") }
  else if(id==="park"){ var p=UI.park?G.parkByName(UI.park):null;
    html = (p?'<span class="opt" aria-pressed="true"><span class="sw" style="background:'+G.PARKCAT[p.c].color+'"></span>'+esc(p.n)+' <small>'+G.money(G.PARKCAT[p.c].cost)+'</small></span>':'')+'<button class="opt" id="pickPark">'+(p?'Choose another':'Choose a place')+'</button>' }
  else if(id==="pool"){ html=G.POOLS.map(function(n){ var b=G.S.builtPools[n]; return '<button class="opt" data-sub="'+esc(n)+'" aria-pressed="'+(UI.sub===n)+'"'+(b?' disabled style="opacity:.4"':'')+'><span class="sw" style="background:#38c6d6"></span>'+esc(n)+' <small>'+(b?"Built":G.money(G.BLD.pool.cost))+'</small></button>' }).join("") }
  else if(id==="road"){ html='<span class="opt">Road <small>$'+G.COST.road+'/tile</small></span>' }
  else if(id==="district"){ var tw=G.town(); html='<span class="opt">Next district <small>'+G.money(G.districtCost(tw))+'</small></span>' }
  el.innerHTML=html; el.classList.toggle("hidden",!html);
}
$("sub").addEventListener("click",function(e){
  if(e.target.closest("#pickPark")){ openPanel("parks"); return }
  var b=e.target.closest("[data-sub]"); if(!b||b.disabled) return; UI.sub=b.dataset.sub; renderSub();
});
function hint(t){ var h=$("hint"); if(!t){h.classList.add("hidden");return} h.textContent=t; h.classList.remove("hidden") }
G.parkByName=function(n){ return G.MG_PARKS_BY[n] };

/* ---------- painting ---------- */
UI.toolPaints = function(){ return UI.tool!=="inspect" };
function lpath(a,b){ var out=[], x=a.x, y=a.y; var dx=Math.sign(b.x-a.x), dy=Math.sign(b.y-a.y);
  var horizFirst = Math.abs(b.x-a.x)>=Math.abs(b.y-a.y);
  if(horizFirst){ while(x!==b.x){out.push(G.idx(x,y)); x+=dx} while(y!==b.y){out.push(G.idx(x,y)); y+=dy} }
  else { while(y!==b.y){out.push(G.idx(x,y)); y+=dy} while(x!==b.x){out.push(G.idx(x,y)); x+=dx} }
  out.push(G.idx(b.x,b.y)); return out }
function rect(a,b){ var out=[]; for(var y=Math.min(a.y,b.y);y<=Math.max(a.y,b.y);y++)for(var x=Math.min(a.x,b.x);x<=Math.max(a.x,b.x);x++) out.push(G.idx(x,y)); return out }
function plan(a,b){
  var t=G.town(), id=UI.tool, ok=[], cost=0, bad=[];
  if(id==="road"){ lpath(a,b).forEach(function(q){ var x=q%N,y=Math.floor(q/N); if(t.kind[q]===K.ROAD) return; if(G.canBuildTile(t,x,y)||(G.unlocked(t,x,y)&&t.kind[q]>=K.RZ&&t.kind[q]<=K.IZ)){ok.push(q);cost+=G.COST.road+(t.base[q]===T.JUNGLE?5:0)} else bad.push(q) }) }
  else if(id==="zone"){ var z={R:K.RZ,C:K.CZ,I:K.IZ}[UI.sub];
    rect(a,b).forEach(function(q){ var x=q%N,y=Math.floor(q/N), k=t.kind[q];
      if(UI.sub==="U"){ if(k>=K.RZ&&k<=K.IZ) ok.push(q); return }
      if(!G.unlocked(t,x,y)||t.base[q]===T.WATER||k===K.ROAD||k===K.BLD||k===z){ if(k!==z) bad.push(q); return }
      ok.push(q); cost+=G.COST.zone+(t.base[q]===T.JUNGLE?5:0) }) }
  else if(id==="bulldoze"){ rect(a,b).forEach(function(q){ var x=q%N,y=Math.floor(q/N); if(!G.unlocked(t,x,y)) return; if(t.kind[q]!==K.NONE||t.base[q]===T.JUNGLE){ok.push(q);cost+=G.COST.bulldoze} }) }
  else if(id==="district"){ var d=G.distOf(b.x,b.y); for(var q=0;q<N*N;q++) if(G.distOf(q%N,Math.floor(q/N))===d) ok.push(q); }
  else { var bt=buildType(); if(!bt) return {ok:[],bad:[],cost:0};
    var f=G.footprint(bt[0],bt[1]); for(var j=0;j<f[1];j++)for(var i=0;i<f[0];i++){ var xx=b.x+i,yy=b.y+j; if(!G.inb(xx,yy)) continue; (G.canBuildTile(t,xx,yy)?ok:bad).push(G.idx(xx,yy)) }
    if(bad.length||ok.length<f[0]*f[1]){ bad=bad.concat(ok); ok=[] } cost=G.buildingCost(bt[0],bt[1]); }
  return {ok:ok,bad:bad,cost:cost};
}
function buildType(){
  var id=UI.tool;
  if(id==="util"||id==="svc") return [UI.sub,null];
  if(id==="park"){ var p=UI.park&&G.parkByName(UI.park); return p?["park",p.c,p.n]:null }
  if(id==="pool") return UI.sub&&!G.S.builtPools[UI.sub]?["pool",null,UI.sub]:null;
  return null;
}
UI.paintStart=function(tl){ UI.paint={a:tl,b:tl}; showPlan() };
UI.paintMove=function(tl){ if(!UI.paint) return; if(UI.paint.b.x===tl.x&&UI.paint.b.y===tl.y) return; UI.paint.b=tl; showPlan() };
UI.paintCancel=function(){ UI.paint=null; R.preview(null); hint(HINTS[UI.tool]) };
UI.hover=function(tl){ if(!tl){R.cursor(null);return} if(UI.paint) return;
  var bt=buildType(); if(bt){ var f=G.footprint(bt[0],bt[1]); R.cursor(tl.x,tl.y,f[0],f[1]) } else R.cursor(tl.x,tl.y) };
function showPlan(){
  var p=plan(UI.paint.a,UI.paint.b);
  if(UI.tool==="district"){ R.preview(p.ok, canBuyDistrict(G.distOf(UI.paint.b.x,UI.paint.b.y))===true?"#f1e2c2":"#ff9277"); return }
  R.preview(p.ok.length?p.ok:p.bad, p.ok.length?(UI.tool==="bulldoze"?"#ff9277":"#f1e2c2"):"#ff9277");
  var n=p.ok.length, txt;
  if(UI.tool==="road") txt=n+" tiles, "+G.money(p.cost);
  else if(UI.tool==="zone") txt=UI.sub==="U"?("Unzone "+n+" tiles"):(n+" lots, "+G.money(p.cost));
  else if(UI.tool==="bulldoze") txt="Clear "+n+" tiles, "+G.money(p.cost);
  else txt = n? ("Place for "+G.money(p.cost)) : "That spot is blocked. Pick open, owned land.";
  hint(txt);
}
UI.paintEnd=function(tl){
  if(!UI.paint) return; if(tl) UI.paint.b=tl;
  var t=G.town(), p=plan(UI.paint.a,UI.paint.b), id=UI.tool;
  UI.paint=null; R.preview(null);
  if(id==="district"){ tryDistrict(G.distOf(tl?tl.x:0,tl?tl.y:0)); if(UI.tool==="district") R.preview(lockedTiles(),"#45b8b0",.3); return }
  if(!p.ok.length){ if(p.bad.length){ toast("That spot is blocked. Pick open land inside your districts."); A.click("bad") } hint(HINTS[id]); return }
  if(p.cost>0 && G.S.money-p.cost < -2000){ toast("The treasury can’t cover "+G.money(p.cost)+". Borrowing is capped at "+G.money(-2000)+"."); A.click("bad"); hint(HINTS[id]); return }
  if(id==="road"){ p.ok.forEach(function(q){ t.kind[q]=K.ROAD; t.lvl[q]=0; if(t.base[q]===T.JUNGLE)t.base[q]=T.GRASS }); G.S.money-=p.cost; touch(t,p.ok) }
  else if(id==="zone"){ var z={R:K.RZ,C:K.CZ,I:K.IZ,U:K.NONE}[UI.sub]; p.ok.forEach(function(q){ t.kind[q]=z; t.lvl[q]=0; if(t.base[q]===T.JUNGLE)t.base[q]=T.GRASS }); G.S.money-=p.cost; touch(t,p.ok) }
  else if(id==="bulldoze"){ var c=0; p.ok.forEach(function(q){ c+=G.removeAt(t,q%N,Math.floor(q/N)) }); G.S.money-=c; touch(t,p.ok) }
  A.click("build"); hint(HINTS[id]); updateHUD();
};
// place buildings by the tile under the finger when released
var _pe=UI.paintEnd;
UI.paintEnd=function(tl){
  if(UI.paint && ["util","svc","park","pool"].indexOf(UI.tool)>=0){
    var t=G.town(), b=tl||UI.paint.b, bt=buildType(); UI.paint=null; R.preview(null);
    if(!bt){ if(UI.tool==="park") openPanel("parks"); return }
    if(!G.canPlace(t,bt[0],bt[1],b.x,b.y)){ toast("That spot is blocked. It needs open, owned land for the whole footprint."); A.click("bad"); return }
    var cost=G.buildingCost(bt[0],bt[1]);
    if(G.S.money-cost < -2000){ toast("The treasury can’t cover "+G.money(cost)+"."); A.click("bad"); return }
    G.placeBuilding(t,bt[0],bt[1],b.x,b.y,bt[2]); A.click("build");
    var label = bt[2] || G.BLD[bt[0]].label;
    toast(label+" built in "+G.def(t).name+".");
    if(bt[0]==="pool"){ G.news("The "+bt[2]+" aquatic center opens in "+G.def(t).name+"."); A.swell(); UI.sub=G.POOLS.filter(function(p){return !G.S.builtPools[p]})[0]||null; renderSub() }
    if(bt[0]==="park"){ UI.park=null; renderSub(); if(G.PARKCAT[bt[1]].w>1) A.swell() }
    if(bt[0]==="power"||bt[0]==="school") A.swell();
    updateHUD(); checkGoals(); return;
  }
  _pe(tl);
};
function touch(t,list){ list.forEach(function(q){ G.markDirty(t,q%N-1,Math.floor(q/N)-1,q%N+1,Math.floor(q/N)+1) }); G.recalc(t); checkGoals() }

/* ---------- districts ---------- */
function lockedTiles(){ var t=G.town(), out=[]; for(var d=0;d<9;d++){ if(canBuyDistrict(d)!==true) continue; for(var q=0;q<N*N;q++) if(G.distOf(q%N,Math.floor(q/N))===d) out.push(q) } return out }
function adjacentOwned(t,d){ var dx=d%3, dy=Math.floor(d/3); return [[1,0],[-1,0],[0,1],[0,-1]].some(function(o){ var x=dx+o[0],y=dy+o[1]; return x>=0&&y>=0&&x<3&&y<3&&t.dist[y*3+x] }) }
function landIn(t,d){ var n=0; for(var q=0;q<N*N;q++) if(G.distOf(q%N,Math.floor(q/N))===d&&t.base[q]!==T.WATER) n++; return n }
function canBuyDistrict(d){
  var t=G.town(); if(t.dist[d]) return "You already govern this district.";
  if(!adjacentOwned(t,d)) return "Open districts next to land you already govern.";
  if(landIn(t,d)<20) return "This district is almost all sea.";
  var owned=t.dist.reduce(function(a,b){return a+b},0);
  if(owned===1 && G.def(t).capital && !allGoals(t)) return "Finish the agenda first: a stable, profitable town comes before a second district.";
  if(owned===1 && !G.def(t).capital && !allGoals(t)) return "Get this town stable and profitable before it expands.";
  if(owned>1 && t.stableMonths<1) return "Expansion needs a good month first: satisfaction 55 or higher and a positive budget.";
  if(G.S.money<G.districtCost(t)) return "Opening this district costs "+G.money(G.districtCost(t))+".";
  return true;
}
function tryDistrict(d){
  var ok=canBuyDistrict(d);
  if(ok!==true){ toast(ok); A.click("bad"); return }
  var t=G.town(), cost=G.districtCost(t);
  G.S.money-=cost; t.dist[d]=1; R.refreshDistricts(t); R.focus((d%3)*12+5,Math.floor(d/3)*12+5,true);
  A.swell(); toast("New district opened in "+G.def(t).name+". Lay roads and zone it.");
  G.news("Governor opens a new district in "+G.def(t).name+".");
  setTool("road"); updateHUD(); checkGoals();
}

/* ---------- inspect ---------- */
UI.tap=function(tl){
  var el=$("inspect"); if(!tl){ el.classList.add("hidden"); return }
  var t=G.town(), q=G.idx(tl.x,tl.y), k=t.kind[q], l=t.lvl[q], c=t.cov, html="";
  R.cursor(tl.x,tl.y);
  function bar(lbl,v){ v=Math.min(1,v); return '<div class="row"><span>'+lbl+'</span><b class="num">'+Math.round(v*100)+'%</b></div>' }
  if(!G.unlocked(t,tl.x,tl.y)){ html='<h3>Undeveloped land</h3><p class="mut">This district isn’t part of '+esc(G.def(t).name)+' yet. Use Expand to open it.</p>' }
  else if(k===K.BLD){ var b=t.blds[t.bid[q]], label=b.name||(b.type==="park"?G.PARKCAT[b.sub].label:G.BLD[b.type].label);
    html='<h3>'+esc(label)+'</h3>';
    if(b.type==="park"){ var p=G.parkByName(b.name); html+='<p>'+esc(G.PARKCAT[b.sub].label)+'. '+(p?esc(p.a)+'.':'')+'</p>'+(p&&p.addr?'<p style="color:var(--dim);font-size:13px">Modeled on the real park at '+esc(p.addr.replace(/, Denver, CO \d+$/,""))+'.</p>':'') }
    else if(b.type==="pool"){ html+='<p>Aquatic center. Plant condition <b class="num">'+Math.round(b.cond*100)+'%</b>. '+(b.closed?'<span class="neg">Closed</span>':'<span class="pos">Open</span>')+'</p><div class="btns"><button class="btn" data-act="service" data-id="'+t.bid[q]+'">Service the plant ($400)</button></div>' }
    else { var B=G.BLD[b.type]; html+='<p>Upkeep '+G.money(B.up*t.fund[B.fund||"parks"])+' a month. Reach '+B.r+' tiles.'+(B.cap?' Serves '+B.cap+' units; town load is '+Math.round(t.load)+'.':'')+'</p>' }
    html+='<div class="btns"><button class="btn ghost" data-act="demolish" data-x="'+tl.x+'" data-y="'+tl.y+'">Demolish</button></div>';
  }
  else if(k>=K.RZ&&k<=K.IZ){ var names={2:"Homes",3:"Shops",4:"Industry"}, lv=["Empty lot","Small","Mid-size","Large"];
    html='<h3>'+names[k]+'</h3><p>'+lv[l]+(l?(k===K.RZ?", "+G.POP[l]+" residents":", "+(k===K.CZ?G.JOBC[l]:G.JOBI[l])+" jobs"):"")+'.</p>';
    var miss=[]; if(!c.road[q])miss.push("a road beside it"); if(!c.power[q])miss.push("power"); if(!c.water[q])miss.push("water");
    if(miss.length) html+='<p class="neg">Needs '+miss.join(", ")+' to grow.</p>';
    if(k===K.RZ) html+=bar("Health",c.health[q])+bar("Education",c.edu[q])+bar("Safety",c.safety[q])+bar("Parks and pools",c.leisure[q])+'<div class="row"><span>Smoke</span><b class="num '+(c.smog[q]>.3?'neg':'')+'">'+Math.round(Math.min(1,c.smog[q])*100)+'%</b></div>';
  }
  else if(k===K.ROAD) html='<h3>Road</h3><p>Upkeep is part of the roads budget.</p>';
  else { var bn={0:"Sea",1:"Beach",2:"Open land",3:"Jungle"}[t.base[q]]; html='<h3>'+bn+'</h3><p>'+(t.base[q]===T.JUNGLE?"Building here clears the jungle. Keeping some jungle helps satisfaction.":t.base[q]===T.WATER?"Nothing can be built on the sea.":"Ready to build on.")+'</p>'+(c.power[q]?'<p class="pos">Power available.</p>':'')+(c.water[q]?'<p class="pos">Water available.</p>':'') }
  el.innerHTML='<button class="x" aria-label="Close" data-act="closeInspect">'+svg('<path d="M6 6l12 12M18 6L6 18"/>')+'</button>'+html;
  el.classList.remove("hidden");
};
$("inspect").addEventListener("click",function(e){ var b=e.target.closest("[data-act]"); if(!b) return; var t=G.town();
  if(b.dataset.act==="closeInspect"){ $("inspect").classList.add("hidden"); R.cursor(null) }
  if(b.dataset.act==="demolish"){ var c=G.removeAt(t,+b.dataset.x,+b.dataset.y); G.S.money-=c; $("inspect").classList.add("hidden"); updateHUD() }
  if(b.dataset.act==="service"){ servicePool(t,+b.dataset.id); UI.tap(null) }
});
function servicePool(t,id){
  var b=t.blds[id]; if(!b) return; G.S.money-=400; b.cond=1; b.closed=!!(G.S.events.storm&&G.def(t).coast);
  var part=G.PARTS[Math.floor(Math.random()*G.PARTS.length)];
  G.S.poolLog.unshift({m:G.S.month,pool:b.name,part:part}); if(G.S.poolLog.length>20)G.S.poolLog.length=20;
  G.recalc(t); R.refreshBuilding(t,id); toast("Serviced the "+b.name+" plant: replaced the "+part+"."); updateHUD();
}

/* ---------- agenda (first playable goals) ---------- */
function goalsFor(t){
  var has=function(ty){return t.blds.some(function(b){return b&&ty.indexOf(b.type)>=0})};
  var cap=G.def(t).capital, target=cap?300:150;
  return [
    {id:"pw",text:"Build a power plant or solar farm",done:has(["power","solar"])},
    {id:"wt",text:"Build a water tower",done:has(["water"])},
    {id:"r1",text:"Welcome the first 60 residents",done:t.pop>=60,prog:Math.min(t.pop,60)+"/60"},
    {id:"jb",text:"Zone shops and industry for 40 jobs",done:t.jobsC+t.jobsI>=40,prog:Math.min(t.jobsC+t.jobsI,40)+"/40"},
    {id:"r2",text:"Grow to "+target+" residents",done:t.pop>=target,prog:Math.min(t.pop,target)+"/"+target},
    {id:"st",text:"Three months stable: satisfaction 55+ and a positive budget",done:t.stableMonths>=3||!!t.goalsMet,prog:Math.min(3,t.stableMonths)+"/3"}
  ];
}
function allGoals(t){ if(t.goalsMet) return true; var ok=goalsFor(t).every(function(g){return g.done}); if(ok) t.goalsMet=true; return ok }
function checkGoals(){ renderAgenda() }
function renderAgenda(){
  var t=G.town(), el=$("agenda"); if(!t) return;
  var owned=t.dist.reduce(function(a,b){return a+b},0), html, count="";
  if(!allGoals(t)){
    var gs=goalsFor(t), done=gs.filter(function(g){return g.done}).length;
    count=done+"/"+gs.length;
    html='<h3 style="display:flex;justify-content:space-between;gap:10px"><span>'+esc(G.def(t).name)+' agenda</span><span class="num" style="color:var(--dim)">'+done+' of '+gs.length+'</span></h3>';
    html+='<ul>'+gs.map(function(g){ return '<li class="'+(g.done?'done':'')+'"><span>'+g.text+(g.prog&&!g.done?' <span class="prog">'+g.prog+'</span>':'')+'</span></li>' }).join("")+'</ul>';
  } else {
    html='<h3>'+esc(G.def(t).name)+' agenda</h3>';
    var items=[];
    items.push(owned===1?'<li class="done"><span>Stable and profitable</span></li>':'<li class="done"><span>'+owned+' of 9 districts governed</span></li>');
    var nxt=G.S.towns.filter(function(o){return !o.founded})[0];
    if(G.def(t).capital && nxt) items.push('<li class="'+(t.pop>=500?'done':'')+'"><span>Reach 500 residents to found '+esc(G.def(nxt).name)+' <span class="prog">'+Math.min(t.pop,500)+'/500</span></span></li>');
    items.push('<li class="'+(G.S.record>=6?'done':'')+'"><span>Governor’s record: '+G.S.record+' month'+(G.S.record===1?'':'s')+' of a happy, profitable region</span></li>');
    html+='<ul>'+items.join("")+'</ul>';
    if(owned<9){ html+='<button class="go" data-a="expand">Expand to a new district ('+G.money(G.districtCost(t))+')</button>'; count="!" }
  }
  $("agendaCount").textContent=count;
  if(!el.classList.contains("hidden")) el.innerHTML=html; else el._html=html;
  el._html=html;
}
function toggleAgenda(open){
  var el=$("agenda"), on=open!=null?open:el.classList.contains("hidden");
  el.classList.toggle("hidden",!on); $("agendaBtn").setAttribute("aria-expanded",on);
  if(on){ closePanel(); el.innerHTML=el._html||""; renderAgenda() }
}
$("agendaBtn").addEventListener("click",function(){ toggleAgenda() });
$("agenda").addEventListener("click",function(e){ var a=e.target.closest("[data-a]"); if(!a) return;
  if(a.dataset.a==="expand"){ toggleAgenda(false); setTool("district") } });

/* ---------- HUD ---------- */
function updateHUD(){
  var S=G.S, t=G.town();
  $("townName").textContent=G.def(t).name; $("date").textContent=G.monthName(S.month)+(S.events.storm?"  Storm":"")+(S.events.downturn?"  Slump":"")+(S.events.heat?"  Heatwave":"");
  var m=$("sMoney"); m.textContent=G.money(S.money); m.className="num "+(S.money<0?"neg":"");
  $("sSat").textContent=Math.round(t.sat); $("sPop").textContent=t.pop.toLocaleString();
  var bar=$("satBar").firstElementChild; bar.style.width=Math.round(t.sat)+"%"; bar.style.background=t.sat>=60?"var(--good)":t.sat>=40?"var(--warn)":"var(--bad)";
  var rci=document.querySelectorAll("#rci i"), cols=["#86d98f","#7fcfe0","#f3c66b"];
  t.demand.forEach(function(d,i){ if(rci[i]){ rci[i].style.height=Math.max(3,Math.abs(d)*28)+"px"; rci[i].style.background=d>=0?cols[i]:"#ff9277"; rci[i].style.opacity=d>=0?1:.7 } });
  $("repDot").classList.toggle("hidden",!S.unread);
  if(UI.open==="budget"&&!UI.dragging) renderPanel();
  renderAgenda();
}

/* ---------- toasts, ticker, month card ---------- */
var toastT;
function toast(msg){ var el=$("toast"); el.textContent=msg; el.classList.remove("hidden"); el.style.opacity=1; clearTimeout(toastT); toastT=setTimeout(function(){el.style.opacity=0; setTimeout(function(){el.classList.add("hidden")},300)},3200) }
UI.toast=toast;
var tickQ=[], tickBusy=false;
G.onNews=function(text,alarm){ tickQ.push(text); if(!tickBusy) nextTick(); if(alarm) A.swell() };
function nextTick(){ var el=$("ticker"); if(!tickQ.length){ el.classList.add("quiet"); tickBusy=false; return } tickBusy=true; $("tickText").textContent=tickQ.shift(); el.classList.remove("quiet"); setTimeout(nextTick,5200) }
var cardT;
function monthCard(total){
  var t=G.town(), L=t.last; if(!L) return;
  $("mcMonth").textContent=G.monthName(G.S.month-1)+" in "+G.def(t).name;
  var n=$("mcNet"); n.textContent=(L.net>=0?"+":"")+G.money(L.net); n.className="num "+(L.net>=0?"pos":"neg");
  var prev=t.hist.length>1?t.hist[t.hist.length-2].sat:t.sat, d=Math.round(t.sat-prev);
  $("mcSat").textContent=Math.round(t.sat)+(d? (d>0?" ▲"+d:" ▼"+Math.abs(d)):"");
  var c=$("monthCard"); c.classList.remove("out"); clearTimeout(cardT); cardT=setTimeout(function(){c.classList.add("out")},5500);
}
$("monthCard").addEventListener("click",function(){ openPanel("report") });

/* ---------- panels ---------- */
function openPanel(name){ $("agenda").classList.add("hidden"); $("agendaBtn").setAttribute("aria-expanded",false); UI.open=name; renderPanel(); $("panel").classList.remove("hidden"); $("inspect").classList.add("hidden") }
function closePanel(){ UI.open=null; $("panel").classList.add("hidden") }
$("pClose").addEventListener("click",closePanel);
document.querySelectorAll("[data-panel]").forEach(function(b){ b.addEventListener("click",function(){ var p=b.dataset.panel; if(UI.open===p) closePanel(); else openPanel(p) }) });
function pctRow(lbl,v){ return '<div class="row"><span>'+lbl+'</span><b class="num">'+Math.round(v*100)+'%</b></div>' }
function renderPanel(){
  var S=G.S, t=G.town(), name=UI.open, h="", title="";
  if(name==="budget"){
    title="Budget";
    var towns=S.towns.filter(function(o){return o.founded});
    var bt = S.towns[UI.budgetTown!=null&&S.towns[UI.budgetTown].founded?UI.budgetTown:S.cur];
    if(towns.length>1) h+='<div class="seg">'+towns.map(function(o){ return '<button data-bt="'+o.i+'" aria-pressed="'+(o===bt)+'">'+esc(G.def(o).name)+'</button>' }).join("")+'</div>';
    var L=bt.last||G.ledger(bt);
    h+='<h3>Taxes in '+esc(G.def(bt).name)+'</h3><p>Revenue comes from shops and industry. Higher taxes raise the cost of living and slow business growth.</p>';
    h+=slider("taxC","Commercial tax",bt.taxC,0,20,"%")+slider("taxI","Industrial tax",bt.taxI,0,20,"%");
    h+='<h3>Service funding</h3>'+(S.austerity?'<p class="neg">The treasury is in debt, so funding is capped at 70% until it recovers.</p>':'<p>Less funding saves money but weakens coverage. Underfunded pools wear out faster.</p>');
    G.FUNDS.forEach(function(f){ h+=slider("f_"+f[0],f[1],Math.round(bt.fund[f[0]]*100),0,S.austerity?70:150,"%") });
    h+='<h3>Last month</h3>'+ledgerRows(L);
    h+='<h3>Region</h3><div class="row"><span>Treasury</span><b class="num '+(S.money<0?'neg':'')+'">'+G.money(S.money)+'</b></div>';
    if(S.lastTotal) h+='<div class="row"><span>Net, all towns</span><b class="num '+(S.lastTotal.net>=0?'pos':'neg')+'">'+G.money(S.lastTotal.net)+'</b></div>';
    h+='<div class="row"><span>Governor’s record</span><b class="num">'+S.record+' months (best '+S.bestRecord+')</b></div>';
    h+=chart(bt);
  } else if(name==="report"){
    title="Monthly report"; var L2=t.last;
    if(!L2){ h='<p>The first report arrives at the end of the month.</p>' }
    else { var sp=t.satParts||{};
      h+='<h3>'+esc(G.def(t).name)+', '+G.monthName(S.month-1)+'</h3>'+ledgerRows(L2);
      h+='<h3>Why residents feel this way</h3><p>Satisfaction '+Math.round(t.sat)+'. Each part is how well that need is met.</p>';
      h+=pctRow("Power and water",sp.util||0)+pctRow("Clinics, schools, safety",sp.svc||0)+pctRow("Parks and pools",sp.lei||0)+pctRow("Jobs",sp.emp||0)+pctRow("Cost of living",sp.cost||0)+pctRow("Clean air and jungle",sp.env||0);
      h+='<h3>All towns</h3>'+S.towns.filter(function(o){return o.founded}).map(function(o){ return '<div class="row"><span>'+esc(G.def(o).name)+'</span><b class="num">'+o.pop+' res, sat '+Math.round(o.sat)+', <span class="'+((o.last&&o.last.net>=0)?'pos':'neg')+'">'+G.money(o.last?o.last.net:0)+'</span></b></div>' }).join("");
    }
  } else if(name==="reports"){
    title="Field reports"; S.unread=0;
    h+='<p>What residents are telling the governor’s office.</p>';
    var cd=S.volunteerCooldown;
    h+='<div class="btns"><button class="btn green" data-act="volunteer"'+(cd?' disabled':'')+'>'+(cd?'Next volunteer day in '+cd+' months':'Call a volunteer day in '+esc(G.def(t).name))+'</button></div>';
    var reps=S.reports.slice(0,14);
    h+= reps.length? reps.map(function(r){ var tw=S.towns.filter(function(o){return o.id===r.town})[0]; return '<div class="report"><div><div class="who">'+esc(r.who)+', '+esc(G.def(tw).name)+'</div><p>'+esc(r.text)+'</p><small style="color:var(--dim)">'+G.monthName(r.m)+'</small></div>'+(r.x!=null?'<button data-fly="'+r.town+','+r.x+','+r.y+'">Show me</button>':'')+'</div>' }).join("") : '<p>No reports yet. They arrive at the end of each month.</p>';
    var pools=[]; S.towns.forEach(function(o){ o.blds.forEach(function(b,id){ if(b&&b.type==="pool") pools.push([o,b,id]) }) });
    h+='<h3>Pool board</h3>'+(pools.length?pools.map(function(p){ var b=p[1]; return '<div class="row"><span>'+esc(b.name)+' <small style="color:var(--dim)">'+esc(G.def(p[0]).name)+'</small></span><b class="num '+(b.closed?'neg':'pos')+'">'+(b.closed?(G.S.events.storm&&G.def(p[0]).coast?'Weather hold':'Closed'):'Open')+', plant '+Math.round(b.cond*100)+'%</b></div><div class="btns" style="margin:4px 0 8px"><button class="btn ghost" data-svc="'+p[0].i+','+p[2]+'">Service the plant ($400)</button></div>' }).join(""):'<p>No pools yet. Build one from the Pools tool. There are seven to place across the island.</p>');
    if(S.poolLog.length) h+='<h3>Parts replaced</h3>'+S.poolLog.slice(0,6).map(function(l){ return '<div class="row"><span>'+esc(l.pool)+'</span><span style="color:var(--dim)">'+esc(l.part)+', '+G.monthName(l.m)+'</span></div>' }).join("");
    h+='<h3>Bomba Live</h3>'+S.news.slice(0,8).map(function(n){ return '<div class="row"><span class="'+(n.alarm?'neg':'')+'">'+esc(n.text)+'</span></div>' }).join("");
    $("repDot").classList.add("hidden");
  } else if(name==="parks"){
    title="Parks";
    var cat=UI.parkCat||"all", q=(UI.parkQ||"").toLowerCase();
    var built=Object.keys(S.builtParks).length;
    h+='<p>Every place on the Central Park parks list can be built once on the island. '+built+' of '+G.MG_PARKS.length+' built.</p>';
    h+='<input type="search" id="parkQ" placeholder="Search parks" value="'+esc(UI.parkQ||"")+'">';
    h+='<div class="seg">'+[["all","All"]].concat(Object.keys(G.PARKCAT).map(function(k){return [k,G.PARKCAT[k].label]})).map(function(c){ return '<button data-cat="'+c[0]+'" aria-pressed="'+(cat===c[0])+'">'+c[1]+'</button>' }).join("")+'</div>';
    h+='<div class="parkList">'+G.MG_PARKS.filter(function(p){ return (cat==="all"||p.c===cat)&&(!q||p.n.toLowerCase().indexOf(q)>=0||p.a.toLowerCase().indexOf(q)>=0) }).map(function(p){
      var bt2=S.builtParks[p.n], c=G.PARKCAT[p.c];
      return '<button class="parkItem" data-park="'+esc(p.n)+'"'+(bt2?' disabled':'')+' aria-pressed="'+(UI.park===p.n)+'"><span class="sw" style="background:'+c.color+'"></span><span><b>'+esc(p.n)+'</b><small>'+(bt2?'Built in '+esc(G.def(S.towns.filter(function(o){return o.id===bt2})[0]).name):c.label+', '+c.w+'×'+c.h+', '+G.money(c.cost)+'. '+esc(p.a))+'</small></span></button>' }).join("")+'</div>';
  } else if(name==="settings"){
    title="Office";
    h+='<h3>Island events</h3><p>Storms, market slumps and heatwaves. Turn them off for a calmer sandbox.</p><div class="seg"><button data-ev="1" aria-pressed="'+S.settings.events+'">On</button><button data-ev="0" aria-pressed="'+(!S.settings.events)+'">Off</button></div>';
    h+='<h3>Sound</h3>'+slider("vol_music","Orchestra",Math.round(S.settings.music*100),0,100,"%")+slider("vol_amb","City ambience",Math.round(S.settings.amb*100),0,100,"%");
    h+='<h3>Save code</h3><p>Copy this code to move your term to another phone, or paste one in to load it.</p><textarea id="saveCode" spellcheck="false"></textarea><div class="btns"><button class="btn ghost" data-act="export">Show my code</button><button class="btn ghost" data-act="import">Load pasted code</button></div>';
    if(!IN_APP) h+='<h3>Android app</h3><p>Install Metro Governor on an Android phone. Your browser term and the app keep separate saves; use a save code to move between them.</p><div class="btns"><a class="btn" href="'+APK_URL+'" rel="noopener" data-act="apk">Download MetroGovernor.apk</a></div>';
    h+='<h3>New term</h3><div class="btns"><button class="btn ghost" data-act="reset">Start over</button></div>';
    h+='<h3>Built from your repos</h3><p>Bubble: the 72 places and the Mapbox maps. ParkCommand: the seven pools, weather holds and the Barlow fonts. AquaticsTech: pool plant upkeep and parts log. VoluntTold: field reports and volunteer days. bomba-live: the Bomba Live news channel. Orbit, ParkCommand and Bubble: the Android build setup.</p>';
  }
  $("pTitle").textContent=title; $("pBody").innerHTML=h;
  if(name==="settings"&&UI._code) $("saveCode").value=UI._code;
}
function slider(id,lbl,v,min,max,unit){ return '<div class="slider"><label for="'+id+'"><span>'+lbl+'</span><b class="num" id="'+id+'_v">'+v+unit+'</b></label><input type="range" id="'+id+'" min="'+min+'" max="'+max+'" value="'+v+'"></div>' }
function ledgerRows(L){
  var r='<div class="row"><span>Commercial tax</span><b class="num pos">'+G.money(L.inC)+'</b></div><div class="row"><span>Industrial tax</span><b class="num pos">'+G.money(L.inI)+'</b></div>';
  G.FUNDS.forEach(function(f){ if(L.ex[f[0]]>0.5) r+='<div class="row"><span>'+f[1]+'</span><b class="num neg">−'+G.money(L.ex[f[0]]).replace("$","$")+'</b></div>' });
  r+='<div class="row"><span><b>Net</b></span><b class="num '+(L.net>=0?'pos':'neg')+'">'+(L.net>=0?'+':'')+G.money(L.net)+'</b></div>';
  return r;
}
function chart(t){
  var hs=t.hist.slice(-12); if(hs.length<2) return '';
  var max=Math.max.apply(null,hs.map(function(h){return Math.abs(h.net)}).concat([100])), w=300, hh=80, bw=w/12;
  var bars=hs.map(function(h,i){ var v=h.net/max*(hh/2-4), y=v>=0?hh/2-v:hh/2; return '<rect x="'+(i*bw+2)+'" y="'+y+'" width="'+(bw-4)+'" height="'+Math.max(1,Math.abs(v))+'" rx="2" fill="'+(h.net>=0?'#86d98f':'#ff9277')+'"/>' }).join("");
  var line=hs.map(function(h,i){ return (i?'L':'M')+(i*bw+bw/2)+' '+(hh-h.sat/100*hh) }).join(" ");
  return '<h3>Last '+hs.length+' months</h3><svg viewBox="0 0 '+w+' '+hh+'" style="width:100%;height:auto" role="img" aria-label="Monthly net and satisfaction"><line x1="0" x2="'+w+'" y1="'+hh/2+'" y2="'+hh/2+'" stroke="rgba(255,255,255,.15)"/>'+bars+'<path d="'+line+'" fill="none" stroke="#f1e2c2" stroke-width="2"/></svg><p style="font-size:12.5px">Bars show net budget. The line shows satisfaction.</p>';
}
$("pBody").addEventListener("input",function(e){
  var el=e.target, id=el.id, v=+el.value, S=G.S;
  var bt=S.towns[UI.budgetTown!=null&&S.towns[UI.budgetTown].founded?UI.budgetTown:S.cur];
  if(id==="parkQ"){ UI.parkQ=el.value; var pos=el.selectionStart; renderPanel(); var n=$("parkQ"); n.focus(); n.setSelectionRange(pos,pos); return }
  if(!/^(taxC|taxI|f_|vol_)/.test(id)) return;
  UI.dragging=true;
  if(id==="taxC") bt.taxC=v; else if(id==="taxI") bt.taxI=v;
  else if(id.indexOf("f_")===0){ bt.fund[id.slice(2)]=v/100; G.recalc(bt) }
  else if(id==="vol_music"){ S.settings.music=v/100; A.setVolumes(S.settings.music,S.settings.amb) }
  else if(id==="vol_amb"){ S.settings.amb=v/100; A.setVolumes(S.settings.music,S.settings.amb) }
  var lab=$(id+"_v"); if(lab) lab.textContent=v+"%";
});
$("pBody").addEventListener("change",function(){ UI.dragging=false; if(UI.open==="budget") renderPanel() });
$("pBody").addEventListener("click",function(e){
  var S=G.S, b;
  if((b=e.target.closest("[data-bt]"))){ UI.budgetTown=+b.dataset.bt; renderPanel(); return }
  if((b=e.target.closest("[data-cat]"))){ UI.parkCat=b.dataset.cat; renderPanel(); return }
  if((b=e.target.closest("[data-park]"))){ UI.park=b.dataset.park; closePanel(); setTool("park"); hint("Tap where "+UI.park+" goes."); return }
  if((b=e.target.closest("[data-fly]"))){ var p=b.dataset.fly.split(","), ti=S.towns.findIndex(function(o){return o.id===p[0]}); if(ti!==S.cur) switchTown(ti); R.focus(+p[1],+p[2],true); R.cursor(+p[1],+p[2]); closePanel(); return }
  if((b=e.target.closest("[data-svc]"))){ var q=b.dataset.svc.split(","), tw=S.towns[+q[0]]; servicePool(tw,+q[1]); renderPanel(); return }
  if((b=e.target.closest("[data-ev]"))){ S.settings.events=b.dataset.ev==="1"; renderPanel(); return }
  if(!(b=e.target.closest("[data-act]"))) return;
  var act=b.dataset.act;
  if(act==="apk"){ apkTapped(); return }
  if(act==="volunteer"){ var t=G.town(); t.volunteer=2; S.volunteerCooldown=6; G.news("Volunteers turn out across "+G.def(t).name+": park cleanups, school repairs, block parties."); A.swell(); renderPanel() }
  if(act==="export"){ UI._code=G.exportCode(); $("saveCode").value=UI._code; $("saveCode").select() }
  if(act==="import"){ var code=$("saveCode").value; try{ G.importCode(code); UI._code=null; afterLoad(); toast("Term loaded.") }catch(err){ toast("That code didn’t load. Copy the whole code and paste it again.") } }
  if(act==="reset"){ if(b.dataset.sure){ G.newGame(); G.save(); afterLoad(); closePanel(); toast("A new term begins in Central Park.") } else { b.dataset.sure=1; b.textContent="Tap again to erase this term" } }
});

/* ---------- switching towns ---------- */
function switchTown(i){ G.S.cur=i; G.dirtyAll=true; R.sync(G.town()); setTool("inspect"); updateHUD() }
UI.switchTown=switchTown;
function foundCost(){ var n=G.S.towns.filter(function(o){return o.founded}).length; return 6000+2500*(n-1) }
function canFound(t){
  var S=G.S, cap=S.towns[0];
  var next=S.towns.filter(function(o){return !o.founded})[0];
  if(t!==next) return "Found "+G.def(next).name+" first. Towns open in order as the road pushes inland.";
  if(cap.pop<500) return "The capital needs 500 residents before the region can grow. It has "+cap.pop+".";
  var prev=S.towns.filter(function(o){return o.founded}).slice(-1)[0];
  if(prev!==cap && !allGoals(prev)) return "Get "+G.def(prev).name+" stable and profitable first.";
  if(S.money<foundCost()) return "Founding costs "+G.money(foundCost())+".";
  return true;
}
function foundTown(t){
  var ok=canFound(t); if(ok!==true){ toast(ok); A.click("bad"); return }
  G.S.money-=foundCost(); t.founded=true; t.foundedMonth=G.S.month;
  var def=G.def(t), d=def.start, ox=(d%3)*12, oy=Math.floor(d/3)*12;
  t.dist[d]=1;
  // starter road grid
  var cy=oy+5, cx=ox+5;
  for(var x=ox+1;x<ox+11;x++){ var q=G.idx(x,cy); if(t.base[q]!==T.WATER){ t.kind[q]=K.ROAD; if(t.base[q]===T.JUNGLE)t.base[q]=T.GRASS } }
  for(var y=oy+1;y<oy+11;y++){ var q2=G.idx(cx,y); if(t.base[q2]!==T.WATER){ t.kind[q2]=K.ROAD; if(t.base[q2]===T.JUNGLE)t.base[q2]=T.GRASS } }
  G.recalc(t); G.news(def.name+" is founded. A new town begins in the jungle.");
  A.swell(); closeRegion(); switchTown(t.i); toast(def.name+" founded. "+def.trait);
}

/* ---------- region map (Mapbox GL, custom island style) ---------- */
var rmap=null, rmarkers=[], rSel=null;
var CENTER=[-79.8,8.9]; // somewhere in a warm sea; the island itself is invented
function islandRing(scale,seed){ var pts=[]; for(var i=0;i<=64;i++){ var a=i/64*Math.PI*2, r=scale*(1+.12*Math.sin(a*3+seed)+.07*Math.sin(a*7+seed*2)+.05*Math.cos(a*5));
  pts.push([CENTER[0]+Math.cos(a)*r*1.15, CENTER[1]+Math.sin(a)*r*.82]) } pts[64]=pts[0]; return pts }
function tpos(def){ return [CENTER[0]+def.pos[0], CENTER[1]+def.pos[1]] }
function regionGeo(){
  var cap=tpos(G.TOWNS[0]), lines=[];
  G.TOWNS.forEach(function(d,i){ if(i) lines.push({type:"Feature",properties:{built:G.S.towns[i].founded?1:0},geometry:{type:"LineString",coordinates:[cap,tpos(d)]}}) });
  return lines;
}
function openRegion(){
  $("region").classList.remove("hidden");
  if(!rmap && window.mapboxgl){
    try{
      mapboxgl.accessToken=window.MG_MAPBOX_TOKEN;
      rmap=new mapboxgl.Map({container:"regionMap",center:[CENTER[0]+.04,CENTER[1]+.03],zoom:9.1,pitch:35,bearing:-10,attributionControl:false,
        style:{version:8,sources:{
          isl:{type:"geojson",data:{type:"Feature",geometry:{type:"Polygon",coordinates:[islandRing(.62,1)]}}},
          jun:{type:"geojson",data:{type:"Feature",geometry:{type:"Polygon",coordinates:[islandRing(.5,1.3)]}}},
          reef:{type:"geojson",data:{type:"Feature",geometry:{type:"Polygon",coordinates:[islandRing(.7,.9)]}}},
          rd:{type:"geojson",data:{type:"FeatureCollection",features:regionGeo()}}},
          layers:[
            {id:"sea",type:"background",paint:{"background-color":"#2f9fb2"}},
            {id:"reef",type:"fill",source:"reef",paint:{"fill-color":"#5cc7cf","fill-opacity":.7}},
            {id:"sand",type:"fill",source:"isl",paint:{"fill-color":"#ecd6a0"}},
            {id:"jungle",type:"fill",source:"jun",paint:{"fill-color":"#4c9a48"}},
            {id:"roads",type:"line",source:"rd",paint:{"line-color":["case",["==",["get","built"],1],"#f6efe4","rgba(246,239,228,.35)"],"line-width":["case",["==",["get","built"],1],3,2],"line-dasharray":[2,1.4]}}
          ]}
      });
      rmap.on("error",function(){ /* offline is fine: the island is drawn locally */ });
      fitRegion();
    }catch(e){ rmap=null }
  }
  if(!rmap){ $("regionMap").classList.add("hidden"); $("regionCanvas").classList.remove("hidden"); drawRegionCanvas() }
  else { setTimeout(function(){ rmap.resize(); fitRegion() },50); if(rmap.getSource("rd")) rmap.getSource("rd").setData({type:"FeatureCollection",features:regionGeo()}) }
  placeRegionMarkers();
  regionInfo(G.S.cur);
}
function fitRegion(){ if(!rmap) return; var land=window.innerWidth>window.innerHeight&&window.innerWidth>=640, ring=islandRing(.72,.9), b=new mapboxgl.LngLatBounds();
  ring.forEach(function(p){b.extend(p)}); rmap.fitBounds(b,{padding:land?{top:20,bottom:20,left:340,right:20}:{top:20,bottom:Math.round(window.innerHeight*.3),left:16,right:16},duration:0,pitch:30,bearing:-8}) }
function placeRegionMarkers(){
  rmarkers.forEach(function(m){ m.remove&&m.remove() }); rmarkers=[];
  if(!rmap) return;
  G.S.towns.forEach(function(t,i){
    var el=document.createElement("button"), d=G.def(t);
    var col = !t.founded?"#8a949a": t.sat>=60?"#86d98f": t.sat>=40?"#f3c66b":"#ff9277";
    el.style.cssText="display:flex;flex-direction:column;align-items:center;gap:3px;background:none;border:0;color:#f6efe4;font:600 14px var(--fc);text-shadow:0 1px 3px rgba(0,0,0,.6);cursor:pointer";
    el.innerHTML='<span style="width:'+(d.capital?22:16)+'px;height:'+(d.capital?22:16)+'px;border-radius:50%;background:'+col+';border:3px solid #22343f;box-shadow:0 2px 6px rgba(0,0,0,.35)"></span>'+esc(d.name);
    el.setAttribute("aria-label",d.name);
    el.addEventListener("click",function(ev){ ev.stopPropagation(); regionInfo(i) });
    rmarkers.push(new mapboxgl.Marker({element:el,anchor:"top"}).setLngLat(tpos(d)).addTo(rmap));
  });
}
function drawRegionCanvas(){
  var c=$("regionCanvas"), w=c.clientWidth, h=c.clientHeight, dpr=window.devicePixelRatio||1; c.width=w*dpr; c.height=h*dpr;
  var x=c.getContext("2d"); x.scale(dpr,dpr); var s=Math.min(w,h)*.75;
  function P(ll){ return [w/2+(ll[0]-CENTER[0])*s, h/2-(ll[1]-CENTER[1])*s*1.1] }
  x.fillStyle="#2f9fb2"; x.fillRect(0,0,w,h);
  [[islandRing(.7,.9),"#5cc7cf"],[islandRing(.62,1),"#ecd6a0"],[islandRing(.5,1.3),"#4c9a48"]].forEach(function(r){ x.beginPath(); r[0].forEach(function(p,i){ var q=P(p); i?x.lineTo(q[0],q[1]):x.moveTo(q[0],q[1]) }); x.fillStyle=r[1]; x.fill() });
  x.setLineDash([6,4]); x.strokeStyle="#f6efe4"; x.lineWidth=2; regionGeo().forEach(function(f){ var a=P(f.geometry.coordinates[0]), b=P(f.geometry.coordinates[1]); x.globalAlpha=f.properties.built?1:.35; x.beginPath(); x.moveTo(a[0],a[1]); x.lineTo(b[0],b[1]); x.stroke() }); x.globalAlpha=1; x.setLineDash([]);
  UI._rpts=[];
  G.S.towns.forEach(function(t,i){ var d=G.def(t), p=P(tpos(d)), col=!t.founded?"#8a949a":t.sat>=60?"#86d98f":t.sat>=40?"#f3c66b":"#ff9277";
    x.beginPath(); x.arc(p[0],p[1],d.capital?11:8,0,7); x.fillStyle=col; x.fill(); x.lineWidth=3; x.strokeStyle="#22343f"; x.stroke();
    x.fillStyle="#f6efe4"; x.font="600 14px Barlow Condensed, sans-serif"; x.textAlign="center"; x.fillText(d.name,p[0],p[1]+24); UI._rpts.push([p[0],p[1],i]) });
}
$("regionCanvas").addEventListener("click",function(e){ var r=e.target.getBoundingClientRect(), mx=e.clientX-r.left, my=e.clientY-r.top;
  (UI._rpts||[]).forEach(function(p){ if(Math.hypot(p[0]-mx,p[1]-my)<26) regionInfo(p[2]) }) });
function regionInfo(i){
  var S=G.S, t=S.towns[i], d=G.def(t), el=$("regionInfo"), h='<h3>'+esc(d.name)+(d.capital?' (capital)':'')+'</h3><p style="color:var(--dim);margin:4px 0 8px">'+esc(d.trait)+'</p>';
  if(t.founded){
    var L=t.last; h+='<div class="row"><span>Residents</span><b class="num">'+t.pop+'</b></div><div class="row"><span>Satisfaction</span><b class="num">'+Math.round(t.sat)+'</b></div><div class="row"><span>Last month</span><b class="num '+(L&&L.net<0?'neg':'pos')+'">'+G.money(L?L.net:0)+'</b></div><div class="row"><span>Districts</span><b class="num">'+t.dist.reduce(function(a,b){return a+b},0)+' of 9</b></div>';
    h+='<div class="btns">'+(i===S.cur?'<button class="btn ghost" data-r="close">Back to '+esc(d.name)+'</button>':'<button class="btn" data-r="go" data-i="'+i+'">Govern '+esc(d.name)+'</button>')+'</div>';
  } else {
    var ok=canFound(t);
    h+= ok===true? '<p>Ready to found for '+G.money(foundCost())+'.</p><div class="btns"><button class="btn green" data-r="found" data-i="'+i+'">Found '+esc(d.name)+'</button></div>' : '<p>'+esc(ok)+'</p>';
  }
  el.innerHTML=h;
}
$("regionInfo").addEventListener("click",function(e){ var b=e.target.closest("[data-r]"); if(!b) return;
  if(b.dataset.r==="close") closeRegion(); else if(b.dataset.r==="go"){ switchTown(+b.dataset.i); closeRegion() } else if(b.dataset.r==="found") foundTown(G.S.towns[+b.dataset.i]) });
function closeRegion(){ $("region").classList.add("hidden") }
$("regionClose").addEventListener("click",closeRegion);
$("openRegion").addEventListener("click",openRegion);
$("office").addEventListener("click",openRegion);

/* ---------- parks atlas (real places from Bubble on Mapbox streets) ---------- */
var amap=null, amk=[], sat=false;
function openAtlas(){
  $("atlas").classList.remove("hidden");
  if(!window.mapboxgl){ atlasNote("The map library didn’t load."); return }
  if(!amap){
    try{
      mapboxgl.accessToken=window.MG_MAPBOX_TOKEN;
      amap=new mapboxgl.Map({container:"atlasMap",style:"mapbox://styles/mapbox/streets-v12",center:[-104.8895,39.7835],zoom:12.3,attributionControl:true});
      amap.on("error",function(e){ var m=String((e&&e.error&&(e.error.message||e.error.status))||""); if(/401|403|token|Unauthorized|Forbidden|fetch|Failed/i.test(m)) atlasNote("The street map needs an internet connection and a valid Mapbox token. Your park list still works offline from the Parks tool.") });
      G.MG_PARKS.forEach(function(p){ var el=document.createElement("button"), c=G.PARKCAT[p.c];
        el.style.cssText="width:16px;height:16px;border-radius:50%;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);cursor:pointer;background:"+c.color;
        el.setAttribute("aria-label",p.n); el.addEventListener("click",function(ev){ ev.stopPropagation(); atlasInfo(p) });
        amk.push(new mapboxgl.Marker({element:el}).setLngLat(p.ll).addTo(amap)) });
      var b=new mapboxgl.LngLatBounds(); G.MG_PARKS.forEach(function(p){b.extend(p.ll)}); amap.fitBounds(b,{padding:40,duration:0});
    }catch(e){ atlasNote("This phone couldn’t start the map.") }
  } else setTimeout(function(){amap.resize()},50);
  atlasInfo(null);
}
function atlasNote(t){ var n=document.querySelector("#atlas .mapnote"); if(!n){ n=document.createElement("div"); n.className="mapnote chip"; document.querySelector("#atlas .mapwrap").appendChild(n) } n.textContent=t }
function atlasInfo(p){
  var el=$("atlasInfo"), S=G.S, built=Object.keys(S.builtParks).length;
  if(!p){ el.innerHTML='<h3>'+built+' of '+G.MG_PARKS.length+' places built</h3><p style="color:var(--dim);margin:4px 0 8px">The real Central Park parks, pinned where they are. Tap a pin to bring that place to your island.</p><div class="btns"><button class="btn ghost" data-a2="sat">'+(sat?"Street view":"Satellite view")+'</button></div>'; return }
  var c=G.PARKCAT[p.c], bt=S.builtParks[p.n], tw=bt&&S.towns.filter(function(o){return o.id===bt})[0];
  el.innerHTML='<h3>'+esc(p.n)+'</h3><p style="color:var(--dim);margin:4px 0">'+esc(c.label)+'. '+esc(p.a)+'.</p><p style="font-size:13px;margin:0 0 8px">'+esc(p.addr||"")+'</p>'+
    (bt?'<p class="pos">Built in '+esc(G.def(tw).name)+'.</p>':'<div class="btns"><button class="btn green" data-a2="build" data-n="'+esc(p.n)+'">Build in '+esc(G.def(G.town()).name)+' ('+G.money(c.cost)+')</button><button class="btn ghost" data-a2="back">All places</button></div>');
}
$("atlasInfo").addEventListener("click",function(e){ var b=e.target.closest("[data-a2]"); if(!b) return;
  if(b.dataset.a2==="build"){ UI.park=b.dataset.n; $("atlas").classList.add("hidden"); setTool("park"); hint("Tap where "+UI.park+" goes.") }
  else if(b.dataset.a2==="back") atlasInfo(null);
  else if(b.dataset.a2==="sat"&&amap){ sat=!sat; amap.setStyle(sat?"mapbox://styles/mapbox/satellite-streets-v12":"mapbox://styles/mapbox/streets-v12"); atlasInfo(null) } });
$("openAtlas").addEventListener("click",openAtlas);
$("atlasClose").addEventListener("click",function(){ $("atlas").classList.add("hidden") });

/* ---------- camera buttons, speed ---------- */
$("rotL").addEventListener("click",function(){R.rotate(-1)}); $("rotR").addEventListener("click",function(){R.rotate(1)});
$("zoomIn").addEventListener("click",function(){R.zoom(1/1.25)}); $("zoomOut").addEventListener("click",function(){R.zoom(1.25)});
function setSpeed(s){ UI.speed=s; document.querySelectorAll("[data-speed]").forEach(function(b){ b.setAttribute("aria-pressed",+b.dataset.speed===s) }) }
document.querySelectorAll("[data-speed]").forEach(function(b){ b.addEventListener("click",function(){ setSpeed(+b.dataset.speed) }) });

/* ---------- loop ---------- */
var acc=0, day=0, last=performance.now(), running=false;
function loop(now){
  var dt=Math.min(.25,(now-last)/1000); last=now;
  if(running && UI.speed>0){
    acc+=dt*UI.speed;
    while(acc>=.8){ acc-=.8; G.dayTick(); day++;
      if(day>=G.DAYS){ day=0; var total=G.monthTick(); monthCard(total); saveNow(); onMonth() }
    }
    if(Math.random()<.05) updateHUDLight();
  }
  R.sync(G.town());
  R.frame(running && UI.speed>0, UI.speed||1);
  requestAnimationFrame(loop);
}
function updateHUDLight(){ var t=G.town(); $("sPop").textContent=t.pop.toLocaleString(); var rci=document.querySelectorAll("#rci i"),cols=["#86d98f","#7fcfe0","#f3c66b"];
  t.demand.forEach(function(d,i){ if(rci[i]){ rci[i].style.height=Math.max(3,Math.abs(d)*28)+"px"; rci[i].style.background=d>=0?cols[i]:"#ff9277" } }) }
function onMonth(){
  var S=G.S, t=G.town();
  R.stormTint(!!S.events.storm);
  var short = (S.money<0?.45:0) + ((S.lastTotal&&S.lastTotal.net<0)?.3:0) + (t.sat<40&&t.pop>0?.3:0) + (S.events.storm?.5:0) + (S.events.downturn?.2:0);
  A.setTension(short);
  if(G.crisis){ G.crisis=0; A.swell() }
  if(G.S.towns.some(function(o){return o.founded&&!o._goalAnnounced&&allGoals(o)})){ G.S.towns.forEach(function(o){ if(o.founded&&!o._goalAnnounced&&allGoals(o)){ o._goalAnnounced=true; G.news(G.def(o).name+" is stable and profitable. The governor can expand."); A.swell() } }) }
  updateHUD();
}
function afterLoad(){ G.dirtyAll=true; R.sync(G.town()); setTool("inspect"); updateHUD(); R.stormTint(!!G.S.events.storm) }

/* ---------- autosave: every visitor's term is kept in their own browser ---------- */
var saveT=null, savedT=null, saveBlocked=false;
function saveNow(){
  saveT=null; if(!running) return;
  G.save().then(function(ok){
    var el=$("saved");
    if(!ok){
      el.className="bad";
      el.textContent = G.saveError==="full" ? "Storage full, not saving" : "Saving is blocked in this browser";
      if(!saveBlocked){ saveBlocked=true;
        toast(G.saveError==="full" ? "This browser’s storage for bombarules.github.io is full, so your term isn’t saving. Use Office > Save code to keep it." : "This browser isn’t letting the game save. On iPhone, turn off Settings > Safari > Block All Cookies and don’t use a Private tab. Office > Save code keeps your term meanwhile.") }
      return;
    }
    if(saveBlocked){ saveBlocked=false; toast("Saving works again.") }
    el.className=""; el.textContent="Saved"; el.classList.add("on");
    clearTimeout(savedT); savedT=setTimeout(function(){ el.classList.remove("on") },1500);
  });
}
function scheduleSave(){ if(!running) return; clearTimeout(saveT); saveT=setTimeout(saveNow,1200) }
G.scheduleSave=scheduleSave;
document.addEventListener("pointerup",scheduleSave,true);
document.addEventListener("change",scheduleSave,true);
window.addEventListener("pagehide",function(){ if(running) G.save() });
window.addEventListener("beforeunload",function(){ if(running) G.save() });
setInterval(function(){ if(running&&UI.speed>0) saveNow() },20000);

/* ---------- Android app download (shown in browsers, hidden inside the app) ---------- */
var APK_URL="https://github.com/bombarules/MetroGovernor/releases/download/latest/MetroGovernor.apk";
var IN_APP=!!(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform());
function apkTapped(){ toast(/Android/i.test(navigator.userAgent)?"Downloading MetroGovernor.apk. Open it from your notifications to install.":"Downloading MetroGovernor.apk. Copy it to your Android phone, or open this page on the phone.") }
if(!IN_APP){ $("getApk").classList.remove("hidden"); $("getApk").addEventListener("click",apkTapped) }

/* ---------- boot ---------- */
G.MG_PARKS = window.MG_PARKS; G.MG_PARKS_BY={}; G.MG_PARKS.forEach(function(p){ G.MG_PARKS_BY[p.n]=p });
function boot(){ G.loadAny().then(function(had){ start(had) }) }
function start(had){
  if(!had) G.newGame();
  R.init($("scene")); buildTools(); setTool("inspect"); setSpeed(1);
  R.sync(G.town()); updateHUD();
  $("btnContinue").classList.toggle("hidden",!had);
  if(had) $("btnNew").textContent="New term";
  function begin(fresh){
    if(fresh){ G.newGame(); afterLoad() }
    $("title").classList.add("hidden"); document.body.classList.remove("titling"); A.start(); A.resume(); running=true; saveNow();
    if(fresh||G.S.month===0){ toast("Welcome, Governor. Start with power and water for the waiting lots."); }
  }
  $("btnContinue").addEventListener("click",function(){ begin(false) });
  $("btnNew").addEventListener("click",function(){ begin(true) });
  document.addEventListener("visibilitychange",function(){ if(document.hidden){ G.save(); A.suspend() } else if(running) A.resume() });
  requestAnimationFrame(loop);
  // gentle idle orbit behind the title
  var spin=setInterval(function(){ if(running){clearInterval(spin);return} R.rotate(.05) },400);
}
boot();
})();
