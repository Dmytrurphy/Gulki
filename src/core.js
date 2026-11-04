/* Gulki 0.2.0 — MIT. Public movie search; no bundled credentials. */
(function (root) {
'use strict';
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
root.GulkiCore = {normalize:normalize,group:group,validate:validate,requestUrl:requestUrl,search:search,clean:clean,tpbSource:tpbSource,tpbRelease:tpbRelease};
})(typeof window !== 'undefined' ? window : globalThis);
