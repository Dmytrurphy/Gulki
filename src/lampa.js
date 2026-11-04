(function(root){
'use strict';
if (!root.Lampa || !root.jQuery || root.gulkiInstalled) return;
var L=root.Lampa, $=root.jQuery, C=root.GulkiCore, rows=[], filters={}, generation=0, requests=[];
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
function load(q){
 cancel();var token=generation;
 select('Гульки — загрузка',[{title:'Отменить',run:function(){cancel();home();}}],function(){cancel();home();});
 C.search(sources(),q,request,function(result,errors){
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
 var groups=C.group(rows,filters), page=0, size=50;
 function show(){
  var items=[{title:'Поиск',run:function(){input('Название фильма','',load,catalog);}},
   {title:'Год: '+(filters.year||'все'),run:function(){chooseFilter('year');}},
   {title:'Студия: '+(filters.studio||'все'),run:function(){chooseFilter('studio');}}];
  groups.slice(page*size,(page+1)*size).forEach(function(g){items.push({title:g.name,subtitle:[g.year,g.studio,g.releases.length+' раздач'].join(' · '),run:function(){qualities(g,show);}});});
  if(!groups.length)items.push({title:'Нет результатов. Настройте источники или измените поиск.'});
  if(page>0)items.push({title:'Предыдущая страница',run:function(){page--;show();}});
  if((page+1)*size<groups.length)items.push({title:'Следующая страница',run:function(){page++;show();}});
  select('Гульки — каталог ('+groups.length+')',items,home);
 }show();
}
function qualities(g,previous){
 var qs=[];g.releases.forEach(function(r){if(qs.indexOf(r.quality)<0)qs.push(r.quality);});
 select('Качество — '+g.name,qs.map(function(q){return {title:q,run:function(){
  select('Раздачи — '+q,g.releases.filter(function(r){return r.quality===q;}).map(function(r){return {title:r.title,subtitle:r.source+' · сиды: '+r.seeds+' · '+(r.size/1073741824).toFixed(2)+' ГБ',run:function(){
   if(!L.Torrent||!L.Torrent.start){notify('Эта сборка Lampa не предоставляет Torrent.start');return;}
   // Lampa owns TorrServer connection, file selection, playback and errors.
   L.Torrent.start({title:r.title,MagnetUri:/^magnet:/i.test(r.link)?r.link:undefined,Link:r.link},{title:g.name,release_date:g.year?g.year+'-01-01':''});
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
function home(){select('Гульки',[
 {title:'The Pirate Bay — поиск без ключа',run:function(){if(addTpb())input('Поиск фильмов The Pirate Bay','',load);}},
 {title:'Каталог',run:catalog},
 {title:'Поиск',run:function(){input('Название фильма','',load);}},
 {title:'Обновить каталог из источников',run:function(){load('');}},
 {title:'Источники',run:settings},
 {title:'О плагине',run:function(){notify('Гульки 0.2.0. Независимые источники; проигрывание через Lampa. Фильтры применяются к загруженным результатам.');home();}}
],back);}
function install(){
 if($('.menu__item[data-action="gulki"]').length)return;
 var menu=$('.menu .menu__list').first();if(!menu.length)return;
 var item=$('<li class="menu__item selector" data-action="gulki"><div class="menu__ico">◈</div><div class="menu__text">Гульки</div></li>');
 item.on('hover:enter',home);menu.append(item);
}
if(root.appready)install();else L.Listener.follow('app',function(e){if(e.type==='ready')install();});
})(window);
