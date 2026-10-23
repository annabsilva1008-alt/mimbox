(async function () {
  'use strict';
  const params = new URLSearchParams(location.search);
  const order = params.get('order_nsu'), transaction = params.get('transaction_nsu'), slug = params.get('slug') || params.get('invoice_slug');
  const section = document.getElementById('custom-art-return');
  if (!section || !/^mimbox-[0-9a-f-]{36}$/i.test(order || '') || !transaction || !slug || transaction.length > 200 || slug.length > 200) return;
  const verification = document.getElementById('payment-verification');
  const status = verification.querySelector('[data-art-status]');
  const retry = verification.querySelector('[data-art-retry]');
  const link = section.querySelector('[data-art-link]');
  verification.hidden = false;
  async function verify() {
    retry.hidden = true; link.hidden = true; section.hidden = true;
    status.textContent = 'Confirmando o pagamento do pedido…';
    try {
      const response = await fetch('/api/criar-checkout?webhook=1', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({order_nsu: order, transaction_nsu: transaction, slug})});
      const result = await response.json();
      if (!response.ok || result.success !== true) throw Error('Pagamento ainda não confirmado');
      const models = Array.isArray(result.personalizados) ? result.personalizados.filter(p => typeof p.descricao === 'string' && Number.isInteger(p.quantidade) && p.quantidade > 0) : [];
      status.textContent = 'Pagamento confirmado!';
      if (result.copos === true) { try { localStorage.removeItem('mimbox-personalizados-copos-v1'); } catch {} }
      if (!models.length) return;
      status.textContent = 'Pagamento confirmado!';
      if (result.copos === true) { try { localStorage.removeItem('mimbox-personalizados-copos-v1'); } catch {} }
      section.hidden = false;
      if (window.MimboxContent) await Promise.race([window.MimboxContent.load(), new Promise(resolve => setTimeout(resolve, 1500))]);
      const contact = document.querySelector('[data-cms-contact=whatsapp]')?.href || '';
      const number = /^https:\/\/wa\.me\/(\d{12,15})(?:[?\/]|$)/i.exec(contact)?.[1] || '5511954556660';
      link.href = 'https://wa.me/' + number + '?text=' + encodeURIComponent('Olá, Mimbox! Vou enviar a arte do pedido ' + order + '.\n\n' + models.map(p => p.quantidade + ' × ' + p.descricao).join('\n') + '\n\nVou anexar o arquivo da arte como documento nesta conversa.');
      link.hidden = false;
    } catch {
      status.textContent = 'O pagamento ainda não foi confirmado. Aguarde um momento e tente verificar novamente. A confirmação será atualizada assim que o pagamento for reconhecido.';
      retry.hidden = false;
    }
  }
  retry.addEventListener('click', verify);
  await verify();
})();
