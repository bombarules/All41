/* Metro Governor: orchestral score and city ambience, synthesized with Web Audio.
   Calm strings during routine governance; low brass and tremolo strings swell when a crisis hits
   or a major project completes. Quiet moments: distant traffic and wind through the palms. */
(function(){
"use strict";
var A = window.G.A = {};
var ctx, master, music, amb, verb, strBus, brassBus, trafficG, windG, windF, tremG, tremLfo;
var started=false, tension=0, tensionTarget=0, chordIdx=0, nextChord=0, swellUntil=0;
var CALM=[[50,57,62,66,69],[47,54,59,62,66],[43,50,55,59,62],[45,52,57,61,64]];     // D, Bm7, Gmaj7, A
var TENSE=[[47,54,59,62],[43,50,55,58],[40,47,52,55],[42,49,54,57]];                // Bm, Gm, Em, F#m
function hz(m){return 440*Math.pow(2,(m-69)/12)}
function noiseBuf(sec,brown){ var b=ctx.createBuffer(1,ctx.sampleRate*sec,ctx.sampleRate), d=b.getChannelData(0), l=0;
  for(var i=0;i<d.length;i++){ var w=Math.random()*2-1; if(brown){ l=(l+.02*w)/1.02; d[i]=l*3.5 } else d[i]=w } return b }
function impulse(sec){ var len=ctx.sampleRate*sec, b=ctx.createBuffer(2,len,ctx.sampleRate);
  for(var c=0;c<2;c++){ var d=b.getChannelData(c); for(var i=0;i<len;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.6) } return b }

A.start = function(){
  if(started) return; started=true;
  try{ ctx=new (window.AudioContext||window.webkitAudioContext)() }catch(e){ return }
  master=ctx.createGain(); master.gain.value=.9; master.connect(ctx.destination);
  var comp=ctx.createDynamicsCompressor(); comp.connect(master);
  music=ctx.createGain(); music.connect(comp); amb=ctx.createGain(); amb.connect(comp);
  verb=ctx.createConvolver(); verb.buffer=impulse(3.4); var vg=ctx.createGain(); vg.gain.value=.55; verb.connect(vg); vg.connect(music);
  strBus=ctx.createGain(); strBus.gain.value=.5; strBus.connect(music); strBus.connect(verb);
  // tremolo for tense strings
  tremG=ctx.createGain(); tremG.gain.value=1; tremG.connect(strBus);
  tremLfo=ctx.createOscillator(); tremLfo.frequency.value=7.5; var td=ctx.createGain(); td.gain.value=0; tremLfo.connect(td); td.connect(tremG.gain); tremLfo.start(); A._td=td;
  brassBus=ctx.createGain(); brassBus.gain.value=0; brassBus.connect(music); brassBus.connect(verb);
  // ambience: distant traffic (brown noise) and wind in the palms (band-passed noise, slow gusts)
  var tr=ctx.createBufferSource(); tr.buffer=noiseBuf(4,true); tr.loop=true; var tf=ctx.createBiquadFilter(); tf.type="lowpass"; tf.frequency.value=380;
  trafficG=ctx.createGain(); trafficG.gain.value=0; tr.connect(tf); tf.connect(trafficG); trafficG.connect(amb); tr.start();
  var wn=ctx.createBufferSource(); wn.buffer=noiseBuf(4,false); wn.loop=true; windF=ctx.createBiquadFilter(); windF.type="bandpass"; windF.frequency.value=900; windF.Q.value=.7;
  windG=ctx.createGain(); windG.gain.value=.02; wn.connect(windF); windF.connect(windG); windG.connect(amb); wn.start();
  A.setVolumes(G.S?G.S.settings.music:.6, G.S?G.S.settings.amb:.5);
  nextChord=ctx.currentTime+.2;
  setInterval(tick,200);
};
A.setVolumes = function(m,a){ if(!ctx) return; music.gain.setTargetAtTime(m*.55,ctx.currentTime,.3); amb.gain.setTargetAtTime(a*.9,ctx.currentTime,.3) };
A.resume = function(){ if(ctx&&ctx.state==="suspended") ctx.resume() };
A.suspend = function(){ if(ctx&&ctx.state==="running") ctx.suspend() };

function stringVoice(m,t0,dur,gain){
  var g=ctx.createGain(), f=ctx.createBiquadFilter(); f.type="lowpass"; f.frequency.value=700+tension*900+(t0<swellUntil?900:0); f.Q.value=.5;
  g.gain.setValueAtTime(0,t0); g.gain.linearRampToValueAtTime(gain,t0+2.4); g.gain.setValueAtTime(gain,t0+dur-.4); g.gain.linearRampToValueAtTime(0,t0+dur+2.6);
  [-7,6].forEach(function(det){ var o=ctx.createOscillator(); o.type="sawtooth"; o.frequency.value=hz(m); o.detune.value=det;
    var vib=ctx.createOscillator(), vd=ctx.createGain(); vib.frequency.value=4.8+Math.random(); vd.gain.value=6; vib.connect(vd); vd.connect(o.detune);
    o.connect(f); o.start(t0); o.stop(t0+dur+3); vib.start(t0); vib.stop(t0+dur+3) });
  f.connect(g); g.connect(tremG);
}
function brass(m,t0,dur,gain){
  var g=ctx.createGain(), f=ctx.createBiquadFilter(); f.type="lowpass"; f.Q.value=2;
  f.frequency.setValueAtTime(220,t0); f.frequency.linearRampToValueAtTime(900+gain*900,t0+dur*.6); f.frequency.linearRampToValueAtTime(300,t0+dur);
  g.gain.setValueAtTime(0,t0); g.gain.linearRampToValueAtTime(gain,t0+dur*.5); g.gain.linearRampToValueAtTime(0,t0+dur+.8);
  [0,5].forEach(function(det){ var o=ctx.createOscillator(); o.type="sawtooth"; o.frequency.value=hz(m); o.detune.value=det; o.connect(f); o.start(t0); o.stop(t0+dur+1) });
  f.connect(g); g.connect(brassBus);
}
function flute(m,t0){
  var o=ctx.createOscillator(), g=ctx.createGain(); o.type="triangle"; o.frequency.value=hz(m);
  g.gain.setValueAtTime(0,t0); g.gain.linearRampToValueAtTime(.05,t0+.25); g.gain.exponentialRampToValueAtTime(.0005,t0+2.2);
  o.connect(g); g.connect(music); g.connect(verb); o.start(t0); o.stop(t0+2.4);
}
function tick(){
  if(!ctx||ctx.state!=="running") return;
  var now=ctx.currentTime;
  tension += (tensionTarget-tension)*.05;
  A._td.gain.setTargetAtTime(tension>.4?.35*tension:0, now, .5);
  brassBus.gain.setTargetAtTime(Math.max(tension*.5, now<swellUntil?.55:0), now, .8);
  if(now>=nextChord-.05){
    var set = tension>.45?TENSE:CALM, ch=set[chordIdx%set.length], dur=tension>.45?6:8;
    ch.forEach(function(m,i){ stringVoice(m+(i===0?-12:0), nextChord, dur, i===0?.07:.045) });
    if(tension>.3||nextChord<swellUntil) brass(ch[0]-12, nextChord, dur*.9, .1+tension*.12);
    if(tension<.45 && Math.random()<.55){ var pent=[74,76,78,81,83,86]; for(var k=0;k<2;k++) if(Math.random()<.7) flute(pent[Math.floor(Math.random()*pent.length)], nextChord+1.5+k*2.5+Math.random()) }
    chordIdx++; nextChord+=dur;
  }
  // gusts
  var gust=.018+.03*(Math.sin(now*.23)*.5+.5)*(Math.sin(now*.71+1)*.5+.5);
  windG.gain.setTargetAtTime(gust*(G.S&&G.S.events.storm?3:1), now, .6);
  windF.frequency.setTargetAtTime(700+Math.sin(now*.4)*250, now, .8);
  var pop = G.town()?G.town().pop:0;
  trafficG.gain.setTargetAtTime(Math.min(.12, pop/4000), now, 1);
}
A.setTension = function(v){ tensionTarget=G.clamp(v,0,1) };
A.swell = function(){ if(!ctx) return; swellUntil=ctx.currentTime+7; if(nextChord-ctx.currentTime>2) nextChord=ctx.currentTime+.4 };
A.click = function(kind){
  if(!ctx||ctx.state!=="running") return; var t=ctx.currentTime, o=ctx.createOscillator(), g=ctx.createGain();
  o.type=kind==="bad"?"square":"sine"; o.frequency.setValueAtTime(kind==="bad"?180:kind==="build"?520:700,t); o.frequency.exponentialRampToValueAtTime(kind==="bad"?120:kind==="build"?780:900,t+.08);
  g.gain.setValueAtTime(.06,t); g.gain.exponentialRampToValueAtTime(.0001,t+.14); o.connect(g); g.connect(master); o.start(t); o.stop(t+.16);
};
})();
