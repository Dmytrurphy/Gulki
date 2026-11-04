const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const base = path.resolve(__dirname, '..');
let count=0;
function test(name,run){run();count++;console.log('PASS '+name);}
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(base,'src/core.js'),'utf8'),ctx);
const C=ctx.GulkiCore;
const source={id:'0',name:'fixture'};
const make=(r,i=0)=>C.normalize(r,source,i);
const magnet='magnet:?xt=urn:btih:'+'a'.repeat(40);
const a=make({Title:'Example Film (2024) 1080p',MagnetUri:magnet,Seeders:8,studio:'Studio'});
test('Jackett normalization and quality',()=>{assert.equal(a.name,'Example Film');assert.equal(a.year,'2024');assert.equal(a.quality,'1080p');assert.equal(a.seeds,8);});
test('dedup and group quality variants',()=>{const b=make({title:'Example Film (2024) 720p',magnet:'magnet:?xt=urn:btih:'+'b'.repeat(40),studio:'Studio'},1);b.link=magnet;b.key='second';assert.equal(C.group([a,a,b])[0].releases.length,2);});
test('remakes and unknown years stay separate',()=>{const b={...a,year:'2023'};assert.equal(C.group([a,b]).length,2);assert.equal(C.group([{...a,year:'',fallback:'1'},{...a,year:'',fallback:'2'}]).length,2);});
test('year and studio filters',()=>{assert.equal(C.group([a],{year:'2020'}).length,0);assert.equal(C.group([a],{studio:'Studio',year:'2024'}).length,1);});
test('reject unsafe links and endpoint credentials',()=>{assert.equal(make({Title:'Bad',Link:'javascript:alert(1)'}),null);assert.throws(()=>C.validate([{type:'jackett',url:'https://user:pass@example.org'}]));});
test('URL encodes queries and keys',()=>{const s=C.validate([{type:'jackett',url:'https://example.org',apiKey:'a&b'}])[0];const u=C.requestUrl(s,'hello & мир');assert.ok(u.includes('apikey=a%26b'));assert.ok(u.includes('Query=hello%20%26%20'));});
test('partial source failure retains results',()=>{const ss=C.validate([{type:'jackett',url:'https://one.test',name:'one'},{type:'json',url:'https://two.test/?q={query}',name:'two'}]);C.search(ss,'x',(u,cb)=>u.includes('one.test')?cb(null,{Results:[{Title:'Film 2024',MagnetUri:magnet}]}):cb('HTTP 500'),(rows,errors)=>{assert.equal(rows.length,1);assert.equal(errors.length,1);});});
test('malformed schema and no sources handled',()=>{C.search([], '',()=>assert.fail(),(rows,errors)=>assert.equal(errors.length,1));C.search([{enabled:true,type:'json',url:'https://x/?q={query}',name:'x'}],'',(_,cb)=>cb(null,{}),(rows,errors)=>assert.equal(errors.length,1));});
let current, entered, playback, writes=[],menuAdded=0;
const chain={length:1,first(){return this;},on(event,fn){entered=fn;return this;},append(){menuAdded++;return this;}};
function jq(s){if(typeof s==='string'&&s.startsWith('.menu__item'))return {length:0};return chain;}
const stored={gulki_sources:[{type:'jackett',url:'https://fixture.test',name:'fixture'}],parser_torrent_type:'jacred',jackett_url:'UNCHANGED'};
const L={Storage:{get:(k,d)=>stored[k]??d,set:(k,v)=>{writes.push(k);stored[k]=v;}},Controller:{toggle(){}},Select:{show:x=>current=x},Input:{edit:(o,cb)=>cb('Film')},Noty:{show(){}},Torrent:{start:(...args)=>playback=args}};
class XHR {open(m,u){this.url=u;}send(){this.status=200;this.responseText=JSON.stringify({Results:[{Title:'Film (2024) 1080p',MagnetUri:magnet}]});this.onload();}abort(){if(this.onabort)this.onabort();}}
const ui={Lampa:L,jQuery:jq,appready:true,XMLHttpRequest:XHR};ui.window=ui;vm.createContext(ui);
vm.runInContext(fs.readFileSync(path.join(base,'plugin.js'),'utf8'),ui);
function choose(text){const item=current.items.find(x=>x.title.includes(text));assert.ok(item,text);current.onSelect(item);}
test('menu -> search -> catalog -> quality -> Lampa playback',()=>{assert.equal(menuAdded,1);entered();choose('Поиск');choose('Film');choose('1080p');choose('Film');assert.equal(playback[0].MagnetUri,magnet);assert.equal(playback[1].title,'Film');});
test('existing parser configuration untouched',()=>{assert.equal(stored.parser_torrent_type,'jacred');assert.equal(stored.jackett_url,'UNCHANGED');assert.deepEqual(writes,[]);});
test('double plugin load installs only once',()=>{vm.runInContext(fs.readFileSync(path.join(base,'plugin.js'),'utf8'),ui);assert.equal(menuAdded,1);});
console.log(count+' tests passed');
