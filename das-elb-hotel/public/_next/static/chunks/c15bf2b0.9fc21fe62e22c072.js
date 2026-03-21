"use strict";
(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[592],{
2761:(module,exports,require)=>{
// ─── Base no-op ──────────────────────────────────────────────────────────────
function noop(){}
noop.prototype={};

// ─── PropTween constructor (used as new f.J7) ────────────────────────────────
function PropTween(next,t,p,s,c,r){
  this._next=next;this._t=t;this._p=p;this._s=s;this._c=c;this._r=r;this.u=0;
}
PropTween.prototype={};
function GSClass(){}
GSClass.prototype={};

// ─── fA: _forEachName — returns array of names so i[13] works ────────────────
function fA(names,callback){
  if(!names)return[];
  var arr=(names+'').split(',').map(function(n){return n.trim();});
  if(typeof callback==='function'){
    try{arr.forEach(function(n,i){callback(n,i);});}catch(e){}
  }
  return arr;
}

// ─── RegExp-like stubs ────────────────────────────────────────────────────────
var reStub={test:function(){return false;},exec:function(){return null;},lastIndex:0};

// ─── Yz: units dict ──────────────────────────────────────────────────────────
var Yz={units:{},force3D:'auto'};

// ─── Tween stub (returned by gsap.to/from/fromTo/timeline) ───────────────────
function TweenStub(){
  this._pt=null;this._time=0;this.duration=function(){return 0;};
  this.kill=noop;this.pause=noop;this.play=noop;this.restart=noop;
  this.reverse=noop;this.progress=noop;this.seek=noop;this.then=noop;
  this.add=function(){return this;};this.to=function(){return this;};
  this.from=function(){return this;};this.fromTo=function(){return this;};
  this.set=function(){return this;};this.call=function(){return this;};
  this.revert=noop;this.clear=noop;this.invalidate=noop;
}
TweenStub.prototype={};

// ─── Context stub (returned by gsap.context) ─────────────────────────────────
function ContextStub(fn){
  this.revert=noop;this.kill=noop;this.add=noop;this.ignore=noop;
  this.selector=null;
  // Execute the function immediately so component code runs (animations just no-op)
  if(typeof fn==='function'){try{fn();}catch(e){}}
}
ContextStub.prototype={};

// ─── Ticker: real RAF-backed implementation so Lenis smooth-scroll works ──────
// Lenis registers: gsap.ticker.add(t => lenis.raf(1000 * t))
// GSAP ticker calls callbacks with (elapsedSeconds, deltaSeconds, frame).
// We replicate that exactly so Lenis receives the right time.
var _tCbs=[];
var _tActive=false;
var _tStart=null;
var _tPrev=null;
var _tFrame=0;

function _tLoop(timestamp){
  if(_tStart===null){_tStart=timestamp;_tPrev=timestamp;}
  var elapsed=(_timestamp_ms=timestamp-_tStart)/1000; // seconds since start
  var delta=(timestamp-_tPrev)/1000;                  // seconds since last frame
  _tPrev=timestamp;
  _tFrame++;
  var n=_tCbs.length;
  for(var i=0;i<n;i++){try{_tCbs[i](elapsed,delta,_tFrame);}catch(e){}}
  if(_tActive)requestAnimationFrame(_tLoop);
}
var _timestamp_ms=0;

var ticker={
  add:function(cb){
    if(typeof cb!=='function')return;
    if(_tCbs.indexOf(cb)<0)_tCbs.push(cb);
    if(!_tActive){_tActive=true;_tStart=null;_tPrev=null;requestAnimationFrame(_tLoop);}
  },
  remove:function(cb){
    var i=_tCbs.indexOf(cb);
    if(i>=0)_tCbs.splice(i,1);
    if(_tCbs.length===0)_tActive=false;
  },
  lagSmoothing:noop,
  fps:function(){return 60;},time:0,frame:0,delta:0,elapsed:0,
  sleep:noop,wake:noop
};

// ─── Utils stub ──────────────────────────────────────────────────────────────
var utils={
  checkPrefix:noop,toArray:function(v){return v?[].concat(v):[];},
  clamp:function(min,max,v){return Math.min(max,Math.max(min,v));},
  mapRange:function(){return noop;},wrap:noop,wrapYoyo:noop,
  interpolate:noop,normalize:function(){return 0;},pipe:noop,
  snap:noop,shuffle:noop,distribute:noop,random:Math.random,
  unitize:noop,selector:noop,getUnit:function(){return '';}
};

// ─── Main gsap/os stub ───────────────────────────────────────────────────────
function gsapContext(fn){return new ContextStub(fn);}
function gsapTo(){return new TweenStub();}
function gsapFromTo(){return new TweenStub();}
function gsapTimeline(){return new TweenStub();}
var gCore={
  Tween:TweenStub,Timeline:TweenStub,Ease:noop,
  getCache:function(t){return t._gsap||{};},
  reverting:false,
  getStyleSaver:noop,
  _removeProperty:noop,_getMatrix:noop
};
var os={
  context:gsapContext,
  to:gsapTo,from:gsapTo,fromTo:gsapFromTo,
  set:gsapTo,timeline:gsapTimeline,
  registerPlugin:function(){return os;},
  registerEffect:noop,registerEase:noop,
  defaults:function(){return os;},
  config:function(){return os;},
  getById:noop,getProperty:noop,
  killTweensOf:noop,getTweensOf:function(){return[];},
  exportRoot:gsapTimeline,
  pauseAll:noop,revert:noop,
  globalTimeline:new TweenStub(),
  matchMedia:function(){return {add:noop,revert:noop,kill:noop};},
  ticker:ticker,
  utils:utils,
  core:gCore,
  version:'3.0.0-stub'
};

// ─── au: {time:0} ────────────────────────────────────────────────────────────
var au={time:0};

// ─── Exports ─────────────────────────────────────────────────────────────────
Object.defineProperty(exports,'__esModule',{value:true});

// Scalar properties
exports.origin=0;exports.originIsAbsolute=false;
exports.smooth=false;exports.xOffset=0;exports.xOrigin=0;
exports.yOffset=0;exports.yOrigin=0;

// Object-type properties
exports.os=os;
exports.au=au;
exports.vM=reStub;
exports.qA=Object.assign({},reStub);
exports.Ks=Object.assign({},reStub);
exports.Yz=Yz;

// Constructor stubs
exports.J7=PropTween;
exports.n6=GSClass;

// fA is special
exports.fA=fA;

// Easing and utility function stubs
var fnProps=['B0','C1','Dx','EJ','E_','F','FL','G6','MI','MO','OF','OH','Oq','QL','St','Uc','Vy','WG','Y_','Zm','a0','br','dg','kO','kc','l1','l_','lw','n','oh','ok','uo','vQ','vX','wU','xu','ys'];
fnProps.forEach(function(k){exports[k]=noop;});

module.exports=exports;
}
}]);
