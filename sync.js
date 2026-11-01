/* Riveria Sanasto sync v1.1 — ES5-compatible; never embed access keys in public source. */
(function () {
 'use strict';
 var CFG='rs_sync_cfg_v1', CLIENT='rs_client_id_v1', SCORES='rs_scores_v1', WORDS='rs_user_words_v1', FAVORITES='rs_favorites_v1';
 var FMETA='rs_favorite_meta_v1', DELETED='rs_deleted_words_v1';
 var cfg=null, syncing=false, lastSync=0, queueTimer=null, clientId='';
 function read(k,f){try{var s=localStorage.getItem(k);return s?JSON.parse(s):f;}catch(e){return f;}}
 function write(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true;}catch(e){return false;}}
 function mkid(){return 'C'+Date.now().toString(36)+Math.floor(Math.random()*1e9).toString(36);}
 function text(id,value){var e=document.getElementById(id);if(e)e.textContent=value;}
 function status(message,bad){text('cloud-state',message);var el=document.getElementById('cloud-indicator');if(el){el.textContent=bad?'☁ Ошибка синхронизации':'☁ '+message;el.style.color=bad?'#a53c30':'#21754e';}}
 function showPanel(){var p=document.getElementById('cloud-panel');if(p)p.hidden=!p.hidden;if(!p.hidden)fillConfig();}
 function fillConfig(){var url=document.getElementById('cloud-url'),key=document.getElementById('cloud-key');if(url)url.value=cfg&&cfg.url||'';if(key)key.value=cfg&&cfg.key||'';}
 function validUrl(u){return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:\?.*)?$/.test(u||'');}
 function cleanScores(data){return data&&typeof data==='object'&&!Array.isArray(data)?data:{};}
 function takeSnapshot(){var scores=cleanScores(read(SCORES,{})),words=read(WORDS,[]),favorites=read(FAVORITES,{}),meta=read(FMETA,{}),deleted=read(DELETED,{}),map={},k,now=Date.now();
   if(!Array.isArray(words))words=[];
   for(var i=0;i<words.length;i++){var x=words[i];if(!x||!x.id)continue;if(!x.updatedAt)x.updatedAt=1;map[x.id]={id:x.id,fi:x.fi||'',ru:x.ru||'',cat:x.cat||'Omat sanat',catRu:x.catRu||'Мои слова',example:x.example||'',updatedAt:x.updatedAt,deleted:false};}
   Object.keys(deleted).forEach(function(id){var x=map[id]||{id:id};if(Number(deleted[id])>=Number(x.updatedAt||0)){x.updatedAt=deleted[id];x.deleted=true;map[id]=x;}});
   var f={};Object.keys(favorites||{}).forEach(function(id){if(!meta[id])meta[id]={starred:!!favorites[id],updatedAt:1};});
   Object.keys(meta||{}).forEach(function(id){var p=meta[id];f[id]={starred:!!p.starred,updatedAt:Number(p.updatedAt)||1};});
   return {scores:scores,words:Object.keys(map).map(function(id){return map[id];}),favorites:f};
 }
 function merge(remote){var snapshot=takeSnapshot(),newScores={},changed=false,k,rs=cleanScores(remote.scores),local=snapshot.scores;
  Object.keys(local).concat(Object.keys(rs)).forEach(function(id){if(newScores[id])return;var a=local[id]||{},b=rs[id]||{};newScores[id]={correct:Math.max(Number(a.correct)||0,Number(b.correct)||0),wrong:Math.max(Number(a.wrong)||0,Number(b.wrong)||0),seen:Math.max(Number(a.seen)||0,Number(b.seen)||0),last:Math.max(Number(a.last)||0,Number(b.last)||0)};});
  var wordMap={},remoteWords=remote.words||{},localWords=snapshot.words;
  Object.keys(remoteWords).forEach(function(id){if(remoteWords[id])wordMap[id]=remoteWords[id];});
  localWords.forEach(function(x){var prior=wordMap[x.id];if(!prior||Number(x.updatedAt||0)>Number(prior.updatedAt||0))wordMap[x.id]=x;});
  var newWords=[],deleted={};Object.keys(wordMap).forEach(function(id){var x=wordMap[id];if(!x)return;if(x.deleted)deleted[id]=Number(x.updatedAt)||1;else if(x.fi&&x.ru)newWords.push({id:x.id,fi:x.fi,ru:x.ru,cat:x.cat||'Omat sanat',catRu:x.catRu||'Мои слова',example:x.example||'',updatedAt:Number(x.updatedAt)||1});});
  var favData={},favFlags={},rm=remote.favorites||{},lm=snapshot.favorites;
  Object.keys(rm).concat(Object.keys(lm)).forEach(function(id){var a=rm[id],b=lm[id];var v=(!a||b&&Number(b.updatedAt)>Number(a.updatedAt))?b:a;if(!v)return;favData[id]={starred:!!v.starred,updatedAt:Number(v.updatedAt)||1};favFlags[id]=!!v.starred;});
  // Merge against the latest local version, not just the state captured before HTTP requests.
  var before=JSON.stringify([read(SCORES,{}),read(WORDS,[]),read(FAVORITES,{})]);
  var after=JSON.stringify([newScores,newWords,favFlags]);
  var ok=write(SCORES,newScores)&&write(WORDS,newWords)&&write(FAVORITES,favFlags)&&write(FMETA,favData)&&write(DELETED,deleted);
  if(!ok)throw new Error('Не удалось сохранить объединённые данные на устройстве');
  if(before!==after && window.RS_SYNC_REFRESH)window.RS_SYNC_REFRESH();
 }
 function pull(url,key){return new Promise(function(resolve,reject){var cb='RS_SYNC_CB_'+Date.now().toString(36)+'_'+Math.floor(Math.random()*1e9).toString(36),tag=document.createElement('script'),done=false,timeout;
    function clear(){if(done)return;done=true;window.clearTimeout(timeout);try{delete window[cb];}catch(e){window[cb]=undefined;}if(tag.parentNode)tag.parentNode.removeChild(tag);}
    window[cb]=function(result){clear();resolve(result);};
    tag.onerror=function(){clear();reject(new Error('Не получилось получить ответ от Google. Проверь адрес и публикацию скрипта.'));};
    timeout=setTimeout(function(){clear();reject(new Error('Google не ответил на запрос.'));},25000);
    tag.src=url+(url.indexOf('?')>=0?'&':'?')+'prefix='+encodeURIComponent(cb)+'&key='+encodeURIComponent(key)+'&deviceId='+encodeURIComponent(clientId)+'&t='+Date.now();
    document.head.appendChild(tag);
  });}
 function push(url,key,payload){
   // A simple cross-origin POST that does not require the Apps Script server to set CORS headers.
   // The opaque POST result is never considered success. A matching server-side ack is required later.
   return fetch(url,{method:'POST',mode:'no-cors',redirect:'follow',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'payload='+encodeURIComponent(JSON.stringify(payload))}).then(function(){return true;});
 }
 function sync(quiet){if(syncing||!cfg||!cfg.url||!cfg.key)return Promise.resolve(false);if(!navigator.onLine){status('Нет интернета — данные остаются на устройстве',false);return Promise.resolve(false);}
   syncing=true;status('Синхронизирую…',false);
   var requestId='R'+Date.now().toString(36)+Math.floor(Math.random()*1e8).toString(36);
   var snapshot=takeSnapshot(),payload={op:'sync',key:cfg.key,deviceId:clientId,requestId:requestId,scores:snapshot.scores,words:snapshot.words,favorites:snapshot.favorites};
   // Pull first to reject invalid credentials without pushing. POST then confirm the server processed it.
   return pull(cfg.url,cfg.key).then(function(check){if(!check||!check.ok)throw new Error(check&&check.error==='invalid_key'?'Неверный ключ доступа':'Не удалось подключиться к Google Sheets');
     return push(cfg.url,cfg.key,payload).then(function(){return pull(cfg.url,cfg.key);});
   }).then(function(response){if(!response||!response.ok)throw new Error('Сервер не вернул данные');if(response.ack!==requestId)throw new Error('Google не подтвердил запись. Попробуй ещё раз.');
     merge(response);lastSync=Date.now();write('rs_last_sync_v1',lastSync);text('cloud-last','Последняя синхронизация: '+new Date(lastSync).toLocaleString('ru-RU'));status('Облако обновлено; другие устройства получат изменения при подключении',false);return true;
   }).catch(function(e){status('Ошибка: '+String(e.message||e),true);return false;}).then(function(ok){syncing=false;return ok;});
 }
 function schedule(){if(!cfg)return;if(queueTimer)clearTimeout(queueTimer);queueTimer=setTimeout(function(){sync(true);},12000);}
 function saveCfg(){var url=document.getElementById('cloud-url').value.replace(/^\s+|\s+$/g,''),key=document.getElementById('cloud-key').value.replace(/^\s+|\s+$/g,'');
  if(!validUrl(url)){status('Нужна ссылка Apps Script, заканчивающаяся на /exec',true);return;}
  if(key.length<24){status('Ключ должен содержать не менее 24 символов',true);return;}
  cfg={url:url,key:key};if(!write(CFG,cfg)){status('Настройки не сохранились',true);return;}
  status('Подключение сохранено только на этом устройстве',false);sync(false);
 }
 function disconnect(){if(!window.confirm('Отключить синхронизацию на этом устройстве? Локальные слова и прогресс останутся.'))return;
  try{localStorage.removeItem(CFG);}catch(e){}cfg=null;fillConfig();status('Не подключено',false);
 }
 function mount(){var btn=document.getElementById('cloud-toggle');if(btn)btn.addEventListener('click',showPanel);
  var a=document.getElementById('cloud-save');if(a)a.addEventListener('click',saveCfg);
  var b=document.getElementById('cloud-run');if(b)b.addEventListener('click',function(){sync(false);});
  var c=document.getElementById('cloud-disconnect');if(c)c.addEventListener('click',disconnect);
  lastSync=Number(read('rs_last_sync_v1',0))||0;if(lastSync)text('cloud-last','Последняя подтверждённая синхронизация: '+new Date(lastSync).toLocaleString('ru-RU'));
  clientId=read(CLIENT,'');if(typeof clientId!=='string'||!clientId){clientId=mkid();write(CLIENT,clientId);}
  cfg=read(CFG,null);if(!cfg||!validUrl(cfg.url)||typeof cfg.key!=='string'||cfg.key.length<24){cfg=null;status('Синхронизация не настроена',false);}else{status('Ожидает связи с Google',false);setTimeout(function(){sync(true);},2500);}
  fillConfig();
  window.addEventListener('online',function(){setTimeout(function(){sync(true);},1800);});
  window.addEventListener('rs:datachange',schedule);
  document.addEventListener('visibilitychange',function(){if(!document.hidden&&Date.now()-lastSync>120000)sync(true);});
  setInterval(function(){if(cfg&&navigator.onLine&&Date.now()-lastSync>120000)sync(true);},120000);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
