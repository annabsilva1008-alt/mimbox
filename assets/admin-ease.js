/* Controles de apresentação; os salvamentos continuam nas rotinas existentes. */
(() => {
  'use strict';
  const menu=document.getElementById('menu-toggle');
  const navigation=document.getElementById('navigation');
  menu?.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));navigation.classList.toggle('menu-open',open);});
  navigation?.addEventListener('click',event=>{if(event.target.closest('[data-page]')){navigation.classList.remove('menu-open');menu?.setAttribute('aria-expanded','false');}});
  const content=document.getElementById('content');let productDirty=false;
  const markProductDirty=event=>{if(event.target.closest('#new-product,.product-item'))productDirty=true;};
  content?.addEventListener('input',markProductDirty);content?.addEventListener('change',markProductDirty);
  content?.addEventListener('click',event=>{if(event.target.closest('#new-product .gallery-entry button,.product-item .gallery-entry button'))productDirty=true;});
  const canLeave=event=>{if(productDirty&&!window.confirm('Há alterações de produto não salvas. Sair e descartá-las?')){event.preventDefault();event.stopImmediatePropagation();return false;}productDirty=false;return true;};
  navigation?.addEventListener('click',event=>{if(event.target.closest('[data-page],a'))canLeave(event);},true);
  document.getElementById('logout')?.addEventListener('click',canLeave,true);
  window.addEventListener('beforeunload',event=>{if(productDirty){event.preventDefault();event.returnValue='';}});
  if(content)new MutationObserver(()=>{productDirty=false;}).observe(content,{childList:true});
  // O navegador precisa conseguir focar um campo inválido dentro de uma seção fechada.
  document.addEventListener('invalid',event=>{let section=event.target.closest('details');while(section){section.open=true;section=section.parentElement?.closest('details');}},true);
  const form=document.getElementById('site-form');
  const saveState=document.getElementById('save-state');
  const status=document.getElementById('status');
  if(form&&saveState){
    const update=()=>{if(typeof snapshot!=='function')return;const dirty=typeof lastSaved!=='undefined'&&JSON.stringify(snapshot())!==lastSaved;saveState.textContent=dirty?'Alterações não salvas':'Tudo salvo';saveState.classList.toggle('has-changes',!!dirty);};
    form.addEventListener('input',update);form.addEventListener('change',update);
    if(status)new MutationObserver(update).observe(status,{childList:true,subtree:true,characterData:true});
    update();
  }
})();
