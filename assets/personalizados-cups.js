(function () {
  'use strict';
  const rules = window.MimboxCups, root = document.getElementById('custom-cups');
  if (!root || !rules) return;
  const $ = id => document.getElementById(id);
  const money = n => Number(n).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
  const storage = 'mimbox-personalizados-copos-v1';
  let products = [], basket = [], quote = null, quoteVersion = 0;
  try { const saved = JSON.parse(localStorage.getItem(storage) || '[]'); if (Array.isArray(saved)) basket = saved.map(i => ({id: String(i.id), qty: Number(i.qty)})); } catch {}
  const persist = () => { try { localStorage.setItem(storage, JSON.stringify(basket)); } catch {} };
  function priced() { return rules.priceCupCart(basket, products); }
  function selected() { return products.find(p => p.id === $('cup-variant').value); }
  function updateSelection() {
    const p = selected(), spec = rules.cupSpec(p), qty = Number($('cup-quantity').value);
    $('cup-add').disabled = !p || !Number.isSafeInteger(qty) || qty < 1 || qty > rules.CUP_LIMIT;
    if (!p) { $('cup-details').hidden = true; $('cup-selection-price').textContent = 'Carregando modelos disponíveis…'; return; }
    $('cup-add').textContent=p.variacoes?.opcoes?.length?'Escolher variação →':'Adicionar ao pedido';
    $('cup-details').hidden = false; $('cup-details').href = '/produto.html?id=' + encodeURIComponent(p.id) + '&copos=1';
    const count = basket.reduce((sum, i) => sum + i.qty, 0) + Math.max(0, qty || 0);
    const price = rules.cupUnitPrice(spec, count);
    $('cup-selection-price').textContent = money(price) + ' por unidade · ' + money(price * qty) + ' nesta seleção';
  }
  function render() {
    const state = priced(); persist();
    const list = $('cup-cart-items'); list.replaceChildren();
    state.items.forEach(item => {
      const row = document.createElement('div'); row.className = 'mb-cup-cart-row'; row.dataset.productId = item.id;
      const title = document.createElement('strong'); title.textContent = rules.cupTitle(item.cup);
      const detail = document.createElement('span'); detail.textContent = item.qty + ' × ' + money(item.price) + ' = ' + money(item.qty * item.price);
      const qty = document.createElement('input'); qty.type = 'number'; qty.min = '1'; qty.max = String(rules.CUP_LIMIT); qty.value = item.qty; qty.setAttribute('aria-label', 'Quantidade de ' + rules.cupTitle(item.cup));
      qty.addEventListener('input', () => {
        const next = Number(qty.value), old = basket.find(i => i.id === item.id);
        const valid = Number.isSafeInteger(next) && next > 0 && basket.reduce((n,i)=>n+(i.id===item.id?next:i.qty),0) <= rules.CUP_LIMIT;
        qty.setCustomValidity(valid ? '' : 'Escolha de 1 a 500 copos no total.');
        if (!valid) return;
        old.qty = next; invalidateQuote(); persist(); refreshCosts();
      });
      qty.addEventListener('change', () => {
        qty.setCustomValidity('');
        const next = Number(qty.value), old = basket.find(i => i.id === item.id);
        if (!Number.isSafeInteger(next) || next < 1 || basket.reduce((n, i) => n + (i.id === item.id ? next : i.qty), 0) > rules.CUP_LIMIT) { qty.value = old.qty; return; }
        old.qty = next; invalidateQuote(); render();
      });
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'mb-text-link'; remove.textContent = 'Remover';
      remove.onclick = () => { basket = basket.filter(i => i.id !== item.id); invalidateQuote(); render(); };
      if(products.find(p=>p.id===item.id)?.variacoes?.opcoes?.length){const choose=document.createElement('a');choose.href='/produto.html?id='+encodeURIComponent(item.id)+'&copos=1';choose.textContent='Este modelo ganhou opções. Remova-o e escolha a variação →';row.append(choose);}
      row.append(title, detail, qty, remove); list.append(row);
    });
    $('cup-empty').hidden = state.items.length > 0;
    $('cup-checkout').hidden = !state.items.length;
    refreshCosts();
  }
  function refreshCosts() {
    const state = priced();
    for (const row of $('cup-cart-items').children) { const item = state.items.find(i=>i.id===row.dataset.productId); if(item) row.querySelector('span').textContent = item.qty + ' × ' + money(item.price) + ' = ' + money(item.qty * item.price); }
    $('cup-subtotal').textContent = money(state.items.reduce((sum, i) => sum + i.price * i.qty, 0));
    $('cup-discount').textContent = state.count > 50 ? 'Faixa de 51 ou mais copos aplicada a todos os modelos do pedido.' : state.count > 10 ? 'Faixa de 11 a 50 copos aplicada a todos os modelos do pedido.' : 'Os descontos entram automaticamente a partir de 11 copos.';
    $('cup-total').textContent = $('cup-delivery').value === 'pickup' ? 'Retirada sem frete. Total: ' + $('cup-subtotal').textContent : 'Calcule o frete para ver o total com entrega.';
    updateSelection();
  }
  function invalidateQuote() { quoteVersion++; quote = null; $('cup-total').textContent = $('cup-delivery').value === 'pickup' ? 'Retirada sem frete. Total: ' + $('cup-subtotal').textContent : 'Calcule o frete para ver o total com entrega.'; $('cup-freight-options').replaceChildren(); $('cup-shipping-status').textContent = ''; }
  $('cup-variant').addEventListener('change', updateSelection);
  $('cup-quantity').addEventListener('input', updateSelection);
  $('cup-selection').addEventListener('submit', event => {
    event.preventDefault(); const p = selected(), qty = Number($('cup-quantity').value);
    if(p?.variacoes?.opcoes?.length){window.location.assign('/produto.html?id='+encodeURIComponent(p.id)+'&copos=1');return;}
    if (!p || !Number.isSafeInteger(qty) || qty < 1 || basket.reduce((n, i) => n + i.qty, 0) + qty > rules.CUP_LIMIT) { $('cup-selection-price').textContent = 'Escolha de 1 a 500 copos no total por pedido.'; return; }
    const existing = basket.find(i => i.id === p.id); if (existing) existing.qty += qty; else basket.push({id: p.id, qty});
    invalidateQuote(); render(); $('cup-order').scrollIntoView({behavior: 'smooth', block: 'start'});
  });
  $('cup-delivery').addEventListener('change', () => {
    const pickup = $('cup-delivery').value === 'pickup'; $('cup-address').hidden = pickup;
    $('cup-address').querySelectorAll('input,select,button').forEach(el => { el.disabled = pickup; });
    $('cup-address').querySelectorAll('[data-required]').forEach(el => el.required = !pickup);
    $('cup-pickup').hidden = !pickup; invalidateQuote();
  });
  $('cup-cep').addEventListener('input', () => { $('cup-cep').value = $('cup-cep').value.replace(/\D/g, '').slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2'); invalidateQuote(); });
  $('cup-cep').addEventListener('blur', async () => {
    const cep = $('cup-cep').value.replace(/\D/g, ''); if (cep.length !== 8) return;
    try { const response = await fetch('https://viacep.com.br/ws/' + cep + '/json/'); if (!response.ok) return; const p = await response.json(); if (p.erro || $('cup-cep').value.replace(/\D/g, '') !== cep) return;
      for (const [field, value] of [['street', p.logradouro], ['neighborhood', p.bairro], ['city', p.localidade], ['state', p.uf]]) if (!$('cup-' + field).value) $('cup-' + field).value = value || '';
    } catch {}
  });
  $('cup-quote').addEventListener('click', async () => {
    const button = $('cup-quote'), cep = $('cup-cep').value.replace(/\D/g, '');
    invalidateQuote(); if (cep.length !== 8 || !basket.length) { $('cup-shipping-status').textContent = 'Informe um CEP válido.'; return; }
    const version = quoteVersion; button.disabled = true; $('cup-shipping-status').textContent = 'Calculando frete…';
    try {
      const state = priced(), subtotal = state.items.reduce((sum, i) => sum + i.price * i.qty, 0);
      const response = await fetch('/api/calcular-frete', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({cep, itemCount: state.count, subtotal: Math.round(subtotal * 100), items: basket.map(i => ({id: i.id, quantity: i.qty}))})});
      const result = await response.json(); if (!response.ok) throw Error(result.error || 'Não foi possível calcular o frete.');
      if (!result.opcoes?.length) throw Error('Nenhuma transportadora disponível para esse CEP.');
      if (version !== quoteVersion || $('cup-delivery').value !== 'shipping' || $('cup-cep').value.replace(/\D/g, '') !== cep) return;
      result.opcoes.forEach(option => {
        const label = document.createElement('label'), radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'cup-freight'; radio.value = option.id;
        radio.onchange = () => { quote = {id: option.id, cep}; $('cup-total').textContent = 'Total com entrega: ' + money(subtotal + (subtotal > 300 ? 0 : Number(option.valor)));  };
        label.append(radio, document.createTextNode(' ' + option.transportadora + ' · ' + option.servico + ' · ' + (subtotal > 300 ? 'frete grátis' : money(option.valor)) + (option.prazo ? ' · ' + option.prazo + ' dias úteis de transporte' : '')));
        $('cup-freight-options').append(label);
      }); $('cup-shipping-status').textContent = 'Selecione uma opção. Prazo de transporte após a produção.';
    } catch (error) { if (version === quoteVersion) $('cup-shipping-status').textContent = error.message; } finally { button.disabled = false; }
  });
  $('cup-checkout').addEventListener('submit', async event => {
    event.preventDefault(); const form = $('cup-checkout'), button = $('cup-pay');
    if(basket.some(i=>products.find(p=>p.id===i.id)?.variacoes?.opcoes?.length)){$('cup-checkout-status').textContent='Há modelos que ganharam variações. Remova-os deste pedido e escolha a opção na página do produto.';return;}
    if (!form.reportValidity() || !basket.length || [...$('cup-cart-items').querySelectorAll('input')].some(input=>!input.reportValidity())) return;
    const value = name => form.elements.namedItem(name).value.trim(), digits = value('phone').replace(/\D/g, '');
    if (!/^\d{10,11}$/.test(digits)) { $('cup-checkout-status').textContent = 'Informe o telefone com DDD.'; return; }
    const shipping = value('delivery') === 'shipping', cep = value('cep').replace(/\D/g, '');
    if (shipping && (!quote || quote.cep !== cep)) { $('cup-checkout-status').textContent = 'Calcule o frete e selecione uma transportadora.'; return; }
    button.disabled = true; $('cup-checkout-status').textContent = 'Gerando pagamento seguro…';
    try {
      const response = await fetch('/api/criar-checkout', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({
        items: basket.map(i => ({id: i.id, quantity: i.qty})), customer: {name: value('name'), email: value('email'), phone_number: '+55' + digits}, deliveryMethod: value('delivery'),
        address: {...(shipping ? {cpf: value('cpf').replace(/\D/g, '')} : {}), cep, street: value('street'), number: value('number'), neighborhood: value('neighborhood'), city: value('city'), state: value('state').toUpperCase(), complement: value('complement')}, ...(shipping ? {shippingServiceId: quote.id} : {})
      })});
      const result = await response.json(); if (!response.ok) throw Error(result.error || 'Não foi possível iniciar o pagamento.');
      const url = new URL(result.url); if (url.protocol !== 'https:') throw Error('Link de pagamento inválido.');
      window.location.assign(url.href);
    } catch (error) { $('cup-checkout-status').textContent = error.message; button.disabled = false; }
  });
  (async () => {
    try {
      const response = await fetch('/api/admin-produtos?publico=1&personalizados=copos', {cache: 'no-store'}); if (!response.ok) throw Error();
      const result = await response.json(); if (!Array.isArray(result.produtos)) throw Error();
      products = result.produtos.filter(p => p.disponivel === true && rules.cupSpec(p));
      products = products.filter(p => products.filter(other => rules.cupSpec(other).key === rules.cupSpec(p).key).length === 1);
      basket = basket.filter(i => products.some(p => p.id === i.id) && Number.isSafeInteger(i.qty) && i.qty > 0 && i.qty <= rules.CUP_LIMIT);
      if (basket.reduce((n, i) => n + i.qty, 0) > rules.CUP_LIMIT) basket = [];
      const select = $('cup-variant'); select.replaceChildren();
      products.sort((a, b) => rules.CUP_MODELS.findIndex(m => m.key === rules.cupSpec(a).key) - rules.CUP_MODELS.findIndex(m => m.key === rules.cupSpec(b).key));
      products.forEach(p => { const option = document.createElement('option'); option.value = p.id; option.textContent = rules.cupTitle(rules.cupSpec(p)); select.append(option); });
      if (products.length) { const rows = $('cup-price-rows'); rows.replaceChildren(); products.forEach(p => { const spec = rules.cupSpec(p), row = document.createElement('tr'), title = document.createElement('th'); title.scope = 'row'; title.textContent = rules.cupTitle(spec); row.append(title); for (const price of [spec.base,spec.over10,spec.over50]) { const cell = document.createElement('td'); cell.textContent = money(price); row.append(cell); } rows.append(row); }); }
      const desired = new URLSearchParams(location.search).get('copo');
      const requested = products.find(p => rules.cupSpec(p).key === desired); if (requested) select.value = requested.id;
      select.disabled = !products.length; render();
      $('cup-catalog-status').textContent = products.length ? 'Escolha o modelo e a capacidade. Os descontos consideram o total de copos deste pedido.' : 'Os modelos estão em atualização. Volte em instantes.';
    } catch { $('cup-catalog-status').textContent = 'Não foi possível carregar os modelos. Atualize a página para tentar novamente.'; }
  })();
})();
