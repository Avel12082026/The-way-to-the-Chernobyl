(() => {
if(!window.Telegram?.WebApp?.initData)return;
const host=document.getElementById('kpkScreen');if(!host)return;
const open=document.createElement('button');open.textContent='Переход в андроид';open.type='button';open.style.cssText='display:block;width:100%;margin:16px 0;padding:14px';
open.onclick=()=>{
 const dialog=document.createElement('dialog');dialog.style.cssText='background:#171e17;color:#eee;max-width:360px;border:1px solid #789;padding:24px';
 dialog.innerHTML='<form><h3>Переход в андроид</h3><p>Задай данные для входа этим же персонажем в приложение.</p><label>Логин <input name="login" autocomplete="username" required pattern="[A-Za-z0-9_]{3,32}" minlength="3" maxlength="32"></label><p><label>Пароль <input name="password" type="password" autocomplete="new-password" required minlength="12" maxlength="128"></label></p><small>Логин: латиница, цифры, _. Пароль: от 12 символов.</small><p role="alert"></p><button type="submit">Привязать профиль</button><button type="button">Закрыть</button></form>';
 dialog.querySelector('button[type=button]').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();
 dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();const form=e.target,button=form.querySelector('button[type=submit]'),status=form.querySelector('[role=alert]');button.disabled=true;
 try{const r=await fetch(SERVER_URL+'/api/mobile/link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData:window.Telegram.WebApp.initData,login:form.elements.login.value,password:form.elements.password.value})});const data=await r.json();if(!r.ok||!data.success)throw new Error(data.error||'Сервер ещё не обновлён.');form.elements.password.value='';status.textContent='Готово. В приложении войди с этим логином и паролем.';}
 catch(e){status.textContent=e.message;button.disabled=false;}};
 document.body.append(dialog);dialog.showModal();
};host.append(open);
})();
