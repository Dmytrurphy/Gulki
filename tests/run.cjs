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
test('TPB needs no key and pins its public endpoint',()=>{
 const s=C.validate([C.tpbSource()])[0];assert.equal(s.apiKey,'');assert.equal(C.validate([{type:'tpb',url:'https://other.test'}])[0].url,'https://apibay.org');
 assert.equal(C.requestUrl(s,'Big & Bunny'),'https://apibay.org/q.php?q=Big%20%26%20Bunny&cat=201,202,207,209,210,211');
 assert.equal(C.requestUrl(s,''),'https://apibay.org/precompiled/data_top100_200.json');
});
const tpbFixture={id:'123',name:'Fixture Movie (2024) 1080p',info_hash:'C'.repeat(40),category:'207',seeders:'12',size:'1073741824',imdb:'tt1234567'};
test('TPB maps hash, seeds, size and IMDb',()=>{
 const r=C.tpbRelease(tpbFixture);assert.ok(r.magnet.startsWith('magnet:?xt=urn:btih:'+'c'.repeat(40)));assert.equal(r.movieId,'imdb:tt1234567');
 const n=make(r);assert.equal(n.seeds,12);assert.equal(n.size,1073741824);assert.equal(n.quality,'1080p');
});
test('TPB ignores no-results sentinel, invalid hashes and other categories',()=>{
 assert.equal(C.tpbRelease({...tpbFixture,id:'0'}),null);assert.equal(C.tpbRelease({...tpbFixture,info_hash:'invalid'}),null);
 assert.equal(C.tpbRelease({...tpbFixture,category:'301'}),null);assert.equal(C.tpbRelease({...tpbFixture,category:'501'}),null);
});
test('TPB passes source to transport and accepts result arrays',()=>{
 C.search(C.validate([C.tpbSource()]),'Fixture',(u,cb,s)=>{assert.equal(s.type,'tpb');cb(null,[tpbFixture,null,{id:'0'}]);},(rows,errors)=>{assert.equal(rows.length,1);assert.equal(errors.length,0);});
});
function nativeUI(options={}){
 let current,entry,payload,cb,err,cleared=0,clock,settingsWrites=[],listeners={},cardButton,playback,controller;
 const values={gulki_sources:options.sources || [],parser_torrent_type:'jacred'};
 const chain={length:1,first(){return this;},on(e,f){entry=f;return this;},append(){return this;}};
 function $(s){
  if(s.includes('gulki-full-button')){cardButton={length:1,on(e,f){this.enter=f;return this;}};return cardButton;}
  return s.startsWith('.menu__item')?{length:0}:chain;
 }
 function Request(){this.timeout=()=>{};this.native=(url,success,fail)=>{payload=url;cb=success;err=fail;};this.clear=()=>cleared++;}
 const L={Storage:{get:(k,d)=>values[k]??d,set:(k,v)=>{values[k]=v;settingsWrites.push(k);}},Select:{show:o=>current=o},Controller:{toggle:c=>controller=c},Noty:{show(){}},Input:{edit:(o,f)=>f('Fixture')},Platform:{is:p=>p==='android'},Reguest:Request,Torrent:{start:(...args)=>playback=args},Listener:{follow:(name,fn)=>listeners[name]=fn}};
 const ctx={Lampa:L,jQuery:$,appready:true,setTimeout:f=>{clock=f;return 1;},clearTimeout:()=>{},XMLHttpRequest:()=>assert.fail('Native transport required')};ctx.window=ctx;
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(base,'plugin.js'),'utf8'),ctx);entry();
 return {card(movie,legacy){
  let added=0;
  const body={find(sel){if(sel==='.gulki-full-button')return {length:added};return {length:1,first(){return this;},append(){added++;}};}};
  const event={type:'complite',data:{movie},body};
  if(legacy){delete event.body;event.object={activity:{render:()=>body}};}
  listeners.full(event);listeners.full(event);
  return {get count(){return added;},enter(){assert.ok(cardButton);cardButton.enter();}};
 },get playback(){return playback;},get controller(){return controller;},choose(t){const i=current.items.find(i=>i.title.includes(t));assert.ok(i,t);current.onSelect(i);},success(data){cb(data);},fail(){err();},timeout(){clock();},get current(){return current;},get values(){return values;},get cleared(){return cleared;},get payload(){return payload;},get writes(){return settingsWrites;}};
}
test('TPB one-click search uses Android native transport without credentials',()=>{
 const u=nativeUI();u.choose('The Pirate Bay');assert.ok(u.payload.startsWith('https://apibay.org/q.php?'));u.success(JSON.stringify([tpbFixture]));
 assert.ok(u.current.items.some(i=>i.title==='Fixture Movie'));assert.equal(u.values.gulki_sources[0].apiKey,'');assert.equal(u.values.parser_torrent_type,'jacred');assert.deepEqual(u.writes,['gulki_sources']);
});
test('TPB cancel aborts native request and ignores late completion',()=>{
 const u=nativeUI();u.choose('The Pirate Bay');u.choose('Отменить');assert.equal(u.cleared,1);u.success([tpbFixture]);assert.equal(u.current.title,'Гульки');
});
test('TPB timeout and malformed JSON end loading',()=>{
 const u=nativeUI();u.choose('The Pirate Bay');u.timeout();assert.equal(u.cleared,1);assert.ok(u.current.title.includes('каталог'));
 const v=nativeUI();v.choose('The Pirate Bay');v.success('<html>blocked</html>');assert.ok(v.current.title.includes('каталог'));
});
test('TPB reconnect reuses existing source',()=>{
 const u=nativeUI();u.choose('The Pirate Bay');u.fail();u.current.onBack();u.choose('The Pirate Bay');assert.equal(u.values.gulki_sources.length,1);u.fail();
});

test('card query prefers original title and movie release year',()=>{
 assert.equal(C.movieQuery({title:'Локальное',original_title:'Original Movie',release_date:'2024-04-01'},true),'Original Movie 2024');
 assert.equal(C.movieQuery({title:'Local',release_date:'unknown'},true),'Local');
 assert.equal(C.movieQuery({title:'Local',release_date:'2024-04-01'},false),'Local');
 assert.equal(C.movieQuery({},true),'');
});
const cardMovie={id:99,title:'Локальное название',original_title:'Original Movie',release_date:'2024-04-01',poster_path:'/fixture.jpg'};
test('full card adds one source button and searches only selected TPB source',()=>{
 const u=nativeUI({sources:[{type:'json',name:'Own source',url:'https://own.test/?q={query}',enabled:true}]});
 const card=u.card(cardMovie);assert.equal(card.count,1);card.enter();assert.ok(u.current.items.some(i=>i.title==='Own source'));
 u.choose('The Pirate Bay');assert.ok(u.payload.includes('q=Original%20Movie%202024'));assert.deepEqual(u.writes,[]);
 u.success([tpbFixture]);assert.ok(u.current.title.includes('Локальное название'));u.choose('Fixture Movie');u.choose('1080p');u.choose('Fixture Movie');assert.equal(u.playback[1],cardMovie);
});
test('card result offers retry without year and localized title',()=>{
 const u=nativeUI();u.card(cardMovie).enter();u.choose('The Pirate Bay');u.success([{id:'0'}]);
 u.choose('Искать без года');assert.ok(u.payload.includes('q=Original%20Movie&'));u.success([]);
 u.choose('Искать по названию');assert.ok(u.payload.includes(encodeURIComponent(cardMovie.title)));u.success([]);
});
test('card back returns to source picker then movie controller',()=>{
 const u=nativeUI();u.card(cardMovie).enter();u.choose('The Pirate Bay');u.choose('Отменить');assert.ok(u.current.title.includes('где искать'));u.current.onBack();assert.equal(u.controller,'full_start');
 u.success([tpbFixture]);assert.ok(u.current.title.includes('где искать'));
});
test('legacy card render is supported and disabled custom sources hidden',()=>{
 const u=nativeUI({sources:[{type:'json',name:'Disabled',url:'https://own.test/?q={query}',enabled:false}]});
 const c=u.card(cardMovie,true);assert.equal(c.count,1);c.enter();assert.equal(u.current.items.length,1);
});
test('cards without movie title receive no button',()=>{const u=nativeUI();assert.equal(u.card({name:'TV fixture'}).count,0);});

console.log(count+' tests passed');
