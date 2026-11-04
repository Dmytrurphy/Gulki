/* Gulki 0.3.0 — MIT. Public movie search; no bundled credentials. */
(function (root) {
'use strict';
function movieQuery(movie, withYear) {
 movie=movie || {};
 var title=String(movie.original_title || movie.title || '').trim();
 var year=(String(movie.release_date || '').match(/^(19\d{2}|20\d{2})/) || [])[1];
 return title + (withYear && title && year ? ' ' + year : '');
}
function clean(s) { return String(s || '').replace(/[<>]/g, '').slice(0, 500); }
function norm(s) { return clean(s).toLowerCase().replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim(); }
function http(s) { return /^https?:\/\/[^\s/@]+(?::\d+)?(?:\/[^\s]*)?$/i.test(s); }
function link(s) { return /^magnet:\?xt=urn:btih:[a-z0-9]+/i.test(s) || http(s); }
function normalize(r, source, index) {
 if (!r || typeof r !== 'object') return null;
 var title = clean(r.title || r.Title), m = title.match(/\b(19\d{2}|20\d{2})\b/);
 var year = String(r.year || (m && m[1]) || '');
 var quality = String(r.quality || (title.match(/\b(2160p|1080p|720p|480p|4k)\b/i) || [])[1] || 'Не указано').toLowerCase();
 var name = clean(r.movieTitle || (m ? title.slice(0, m.index) : title)).replace(/[. _([\-]+$/, '').trim();
 var url = r.magnet || r.MagnetUri || r.link || r.Link || '';
 if (!title || !link(url)) return null;
 var hash = (url.match(/urn:btih:([a-z0-9]+)/i) || [])[1];
 return {title:title, name:name || title, year:year, quality:quality,
 studio:clean(r.studio) || 'Не указана', movieId:r.movieId ? String(r.movieId) : '',
 source:clean(source.name), link:url, seeds:Math.max(0, Number(r.seeders || r.Seeders) || 0),
 size:Math.max(0, Number(r.size || r.Size) || 0),
 key:hash ? hash.toLowerCase() : url, fallback:source.id + ':' + index};
}
function group(rows, filters) {
 var map = Object.create(null), groups = []; filters = filters || {};
 rows.forEach(function(r) {
  if (filters.year && r.year !== filters.year || filters.studio && r.studio !== filters.studio) return;
  // Unknown years never merge heuristically; explicit movie IDs take precedence.
  var key = r.movieId ? 'id:' + r.movieId : r.year ? norm(r.name) + '|' + r.year + '|' + norm(r.studio) : r.fallback;
  if (!map[key]) { map[key] = {name:r.name, year:r.year, studio:r.studio, releases:[]}; groups.push(map[key]); }
  var g = map[key];
  if (!g.releases.some(function(x){return x.key === r.key;})) g.releases.push(r);
 });
 groups.forEach(function(g){g.releases.sort(function(a,b){return b.seeds-a.seeds;});});
 return groups.sort(function(a,b){return a.name.localeCompare(b.name);});
}
var TPB_URL = 'https://apibay.org';
var TPB_CATEGORIES = ['201','202','207','209','210','211'];
function tpbSource() { return {name:'The Pirate Bay',type:'tpb',url:TPB_URL,enabled:true}; }
function tpbRelease(r) {
 if (!r || String(r.id) === '0' || TPB_CATEGORIES.indexOf(String(r.category)) < 0 || !/^[a-f0-9]{40}$/i.test(r.info_hash || '')) return null;
 return {title:r.name,magnet:'magnet:?xt=urn:btih:' + r.info_hash.toLowerCase() + '&dn=' + encodeURIComponent(String(r.name || '')),
  seeders:r.seeders,size:r.size,movieId:/^tt\d+$/.test(r.imdb || '') ? 'imdb:' + r.imdb : ''};
}
function validate(sources) {
 if (!Array.isArray(sources) || sources.length > 12) throw Error('Нужен массив, максимум 12 источников');
 sources.forEach(function(s, i){
  if (!s || !/^(jackett|json|tpb)$/.test(s.type) || (s.type !== 'tpb' && !http(s.url))) throw Error('Источник ' + (i+1) + ': проверьте тип и HTTP(S) URL');
  if (s.type === 'json' && s.url.indexOf('{query}') === -1) throw Error('JSON URL должен содержать {query}');
  if (s.indexer && !/^[a-z0-9_-]+$/i.test(s.indexer)) throw Error('Некорректный indexer');
 });
 return sources.map(function(s,i){return {id:String(i),name:clean(s.name)||'Источник '+(i+1),type:s.type,url:s.type==='tpb'?TPB_URL:s.url.replace(/\/$/,''),indexer:s.indexer||'all',apiKey:String(s.apiKey||''),enabled:s.enabled!==false};});
}
function requestUrl(s, q) {
 if (s.type === 'tpb') return q.trim() ? TPB_URL + '/q.php?q=' + encodeURIComponent(q) + '&cat=' + TPB_CATEGORIES.join(',') : TPB_URL + '/precompiled/data_top100_200.json';
 if (s.type === 'json') return s.url.replace(/\{query\}/g, encodeURIComponent(q));
 return s.url + '/api/v2.0/indexers/' + encodeURIComponent(s.indexer) + '/results?apikey=' + encodeURIComponent(s.apiKey) + '&Query=' + encodeURIComponent(q);
}
function search(sources, query, request, done) {
 var active = sources.filter(function(s){return s.enabled;}), pending = active.length, rows=[], errors=[];
 if (!pending) { done([], ['Нет включённых источников']); return; }
 active.forEach(function(s){request(requestUrl(s,query),function(err,data){
  if(err) errors.push(s.name + ': ' + err);
  else {
   var list = data && (s.type === 'tpb' ? data : s.type === 'jackett' ? data.Results : data.items);
   if (!Array.isArray(list)) errors.push(s.name + ': неверный формат ответа');
   else list.slice(0,3000).forEach(function(r,i){var item=normalize(s.type === 'tpb' ? tpbRelease(r) : r,s,i);if(item)rows.push(item);});
  }
  if (!--pending) done(rows,errors);
 },s);});
}
root.GulkiCore = {normalize:normalize,group:group,validate:validate,requestUrl:requestUrl,search:search,clean:clean,tpbSource:tpbSource,tpbRelease:tpbRelease,movieQuery:movieQuery};
})(typeof window !== 'undefined' ? window : globalThis);

(function(root){
'use strict';
if (!root.Lampa || !root.jQuery || root.gulkiInstalled) return;
var L=root.Lampa, $=root.jQuery, C=root.GulkiCore, rows=[], filters={}, generation=0, requests=[], searchContext=null;
root.gulkiInstalled=true;
function notify(s){L.Noty.show(C.clean(s));}
function back(){L.Controller.toggle('menu');}
function select(title,items,onBack){if(L.Select.opened && L.Select.opened())L.Select.hide();L.Select.show({title:title,items:items,onSelect:function(i){if(i.run)i.run();},onBack:onBack||home});}
function input(title,value,done,previous){
 L.Input.edit({title:title,value:value,free:true,nosave:true},function(v){done(String(v||'').trim());},previous||home);
}
function cancel(){generation++;var old=requests.slice();requests=[];old.forEach(function(x){x.abort();});}
function request(url,cb,source){
 if(source && source.type==='tpb' && L.Reguest && L.Platform && L.Platform.is('android')) {
  var network=new L.Reguest(), ended=false, timer, handle={abort:function(){network.clear();finish('отменено');}};
  function finish(err,data){
   if(ended)return;ended=true;root.clearTimeout(timer);
   var i=requests.indexOf(handle);if(i>=0)requests.splice(i,1);
   cb(err,data);
  }
  requests.push(handle);
  timer=root.setTimeout(function(){network.clear();finish('тайм-аут');},20000);
  try {
   network.timeout(20000);
   network.native(url,function(data){
    if(typeof data==='string'){try{data=JSON.parse(data);}catch(e){finish('ответ не JSON');return;}}
    finish(null,data);
   },function(){finish('The Pirate Bay недоступен: сеть / ограничение источника');});
  }catch(e){network.clear();finish('нативный запрос недоступен в этой сборке Lampa');}
  return;
 }

 var x=new XMLHttpRequest(), finished=false;
 function end(err,data){if(finished)return;finished=true;var i=requests.indexOf(x);if(i>=0)requests.splice(i,1);cb(err,data);}
 requests.push(x);x.open('GET',url,true);x.timeout=20000;
 x.onload=function(){if(x.status<200||x.status>=300)return end('HTTP '+x.status);try{end(null,JSON.parse(x.responseText));}catch(e){end('ответ не JSON');}};
 x.onerror=function(){end(source && source.type==='tpb'?'The Pirate Bay: сеть / CORS. Попробуйте приложение Lampa Android TV':'сеть / CORS');};x.ontimeout=function(){end('тайм-аут');};x.onabort=function(){end('отменено');};try{x.send();}catch(e){end('запрос заблокирован');}
}
function sources(){try{return C.validate(L.Storage.get('gulki_sources',[]));}catch(e){notify(e.message);return [];}}
function load(q,context){
 cancel();var token=generation;
 searchContext=context || null;
 if(searchContext)searchContext.query=q;
 var returnTo=searchContext ? searchContext.onBack : home;
 select('Гульки — загрузка',[{title:'Отменить',run:function(){cancel();returnTo();}}],function(){cancel();returnTo();});
 C.search(searchContext ? searchContext.sources : sources(),q,request,function(result,errors){
  if(token!==generation)return;
  rows=result;filters={};
  if(errors.length)notify(errors.join('; '));
  catalog();
 });
}
function chooseFilter(field){
 var vals=[];rows.forEach(function(r){var v=r[field];if(v&&vals.indexOf(v)<0)vals.push(v);});vals.sort();
 select(field==='year'?'Год':'Студия',[{title:'Все',run:function(){delete filters[field];catalog();}}].concat(vals.map(function(v){return {title:v,run:function(){filters[field]=v;catalog();}};})),catalog);
}
function catalog(){
 var groups=C.group(rows,filters), page=0, size=50, context=searchContext;
 function show(){
  var items=[{title:context?'Изменить запрос: '+C.clean(context.query):'Поиск',run:function(){input('Название фильма',context?context.query:'',function(q){load(q,context);},show);}},
   {title:'Год: '+(filters.year||'все'),run:function(){chooseFilter('year');}},
   {title:'Студия: '+(filters.studio||'все'),run:function(){chooseFilter('studio');}}];
  if(context && context.movie){
   var noYear=C.movieQuery(context.movie,false);
   if(noYear && context.query!==noYear)items.push({title:'Искать без года',run:function(){load(noYear,context);}});
   var local=String(context.movie.title || '').trim();
   if(local && local!==noYear)items.push({title:'Искать по названию: '+C.clean(local),run:function(){load(local,context);}});
  }
  groups.slice(page*size,(page+1)*size).forEach(function(g){items.push({title:g.name,subtitle:[g.year,g.studio,g.releases.length+' раздач'].join(' · '),run:function(){qualities(g,show);}});});
  if(!groups.length)items.push({title:'Нет результатов. Настройте источники или измените поиск.'});
  if(page>0)items.push({title:'Предыдущая страница',run:function(){page--;show();}});
  if((page+1)*size<groups.length)items.push({title:'Следующая страница',run:function(){page++;show();}});
  select((context?'Гульки — '+C.clean(context.movie.title || context.query):'Гульки — каталог')+' ('+groups.length+')',items,context?context.onBack:home);
 }show();
}
function qualities(g,previous){
 var qs=[];g.releases.forEach(function(r){if(qs.indexOf(r.quality)<0)qs.push(r.quality);});
 select('Качество — '+g.name,qs.map(function(q){return {title:q,run:function(){
  select('Раздачи — '+q,g.releases.filter(function(r){return r.quality===q;}).map(function(r){return {title:r.title,subtitle:r.source+' · сиды: '+r.seeds+' · '+(r.size/1073741824).toFixed(2)+' ГБ',run:function(){
   if(!L.Torrent||!L.Torrent.start){notify('Эта сборка Lampa не предоставляет Torrent.start');return;}
   // Lampa owns TorrServer connection, file selection, playback and errors.
   L.Torrent.start({title:r.title,MagnetUri:/^magnet:/i.test(r.link)?r.link:undefined,Link:r.link},searchContext && searchContext.movie ? searchContext.movie : {title:g.name,release_date:g.year?g.year+'-01-01':''});
  }};}),function(){qualities(g,previous);});
 }};}),previous);
}
function addTpb(){
 var a=sources(), existing=a.filter(function(s){return s.type==='tpb';})[0];
 if(existing)existing.enabled=true;else a.push(C.tpbSource());
 try{L.Storage.set('gulki_sources',C.validate(a));return true;}catch(e){notify(e.message);return false;}
}
function settings(){
 select('Источники Гульки',[
  {title:'Добавить The Pirate Bay — без ключа',run:function(){if(addTpb())notify('The Pirate Bay подключён');settings();}},
  {title:'Добавить Jackett',run:function(){input('Название источника','',function(name){input('URL Jackett (http://…:9117)','',function(url){input('Индексатор (all или ID)','all',function(id){input('API-ключ (сохранится только на устройстве)','',function(key){
   var a=sources();a.push({name:name,type:'jackett',url:url,indexer:id,apiKey:key});save(a);
  },settings);},settings);},settings);},settings);}},
  {title:'Добавить JSON-источник',run:function(){input('URL API с {query}','',function(url){var a=sources();a.push({name:'JSON '+(a.length+1),type:'json',url:url});save(a);},settings);}},
  {title:'Управление источниками',run:function(){select('Источники',sources().map(function(s,i){return {title:s.name+(s.enabled?' — включён':' — выключен'),run:function(){select(s.name,[{title:'Включить / выключить',run:function(){var a=sources();a[i].enabled=!a[i].enabled;save(a);}},{title:'Удалить',run:function(){var a=sources();a.splice(i,1);save(a);}}],settings);}};}),settings);}}
 ],home);
}
function save(a){try{L.Storage.set('gulki_sources',C.validate(a));notify('Сохранено на устройстве');settings();}catch(e){notify(e.message);settings();}}
function home(){searchContext=null;select('Гульки',[
 {title:'Фильмы с постерами — в каталоге Lampa',run:function(){notify('Откройте фильм в Lampa → Смотреть / Источники → Гульки → выберите источник');home();}},
 {title:'The Pirate Bay — поиск без ключа',run:function(){if(addTpb())input('Поиск фильмов The Pirate Bay','',load);}},
 {title:'Каталог',run:catalog},
 {title:'Поиск',run:function(){input('Название фильма','',load);}},
 {title:'Обновить каталог из источников',run:function(){load('');}},
 {title:'Источники',run:settings},
 {title:'О плагине',run:function(){notify('Гульки 0.3.0. Независимые источники; проигрывание через Lampa. Фильтры применяются к загруженным результатам.');home();}}
],back);}
function cardSources(movie){
 var choices=C.validate([C.tpbSource()]);
 sources().forEach(function(s){if(s.enabled && s.type!=='tpb')choices.push(s);});
 var returnTo=function(){cancel();searchContext=null;L.Controller.toggle('full_start');};
 function run(selected){
  var query=C.movieQuery(movie,true);
  if(!query){notify('В карточке нет названия фильма');returnTo();return;}
  load(query,{movie:movie,sources:selected,onBack:function(){cardSources(movie);}});
 }
 var items=choices.map(function(s){return {title:s.name,subtitle:s.type==='tpb'?'Фильмы · без API-ключа':'Подключённый источник',run:function(){run([s]);}};});
 if(choices.length>1)items.push({title:'Искать во всех этих источниках',run:function(){run(choices);}});
 select('Гульки — где искать «'+C.clean(movie.title || movie.original_title)+'»?',items,returnTo);
}
function attachCard(event){
 if(!event || event.type!=='complite' || !event.data || !event.data.movie)return;
 var movie=event.data.movie;
 if(!movie.title && !movie.original_title)return;
 var body=event.body;
 if(!body && event.object && event.object.activity && event.object.activity.render)body=event.object.activity.render();
 if(!body || !body.find)return;
 if(body.find('.gulki-full-button').length)return;
 var container=body.find('.buttons--container').first();
 if(!container.length)container=body.find('.full-start-new__buttons, .full-start__buttons').first();
 if(!container.length)return;
 var button=$('<div class="full-start__button selector gulki-full-button"><span>Гульки</span></div>');
 button.on('hover:enter',function(){cardSources(movie);});
 container.append(button);
}
if(L.Listener && L.Listener.follow)L.Listener.follow('full',attachCard);
function install(){
 if($('.menu__item[data-action="gulki"]').length)return;
 var menu=$('.menu .menu__list').first();if(!menu.length)return;
 var item=$('<li class="menu__item selector" data-action="gulki"><div class="menu__ico">◈</div><div class="menu__text">Гульки</div></li>');
 item.on('hover:enter',home);menu.append(item);
}
if(root.appready)install();else L.Listener.follow('app',function(e){if(e.type==='ready')install();});
})(window);
