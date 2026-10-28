(function () {
  'use strict';
  const original = window.products;
  if (typeof original !== 'function' || !window.MimboxCustomModels) return;
  window.products = function (area) {
    original(area);
    const section = element('details', undefined, 'card editor-options personalized-models-editor');
    section.append(element('summary', 'Preços e cadastro de outros personalizados'));
    section.append(element('p', 'Defina o preço unitário de cada modelo para liberar a compra online. Fotos, descrição, disponibilidade e preço continuam editáveis na lista de produtos. O WhatsApp será usado para receber a arte após o pagamento.', 'muted'));
    for (const model of window.MimboxCustomModels.models) {
      const matches = state.produtos.filter(p => window.MimboxCustomModels.matches(p, model));
      const box = element('form', undefined, 'item');
      box.append(element('h3', model.name));
      if (matches.length > 1) {
        box.append(element('p', 'Há mais de um cadastro deste modelo. Revise a lista de produtos antes de ativá-lo.'));
        section.append(box); continue;
      }
      const current = matches[0];
      const price = field('Preço por unidade (R$)', current?.preco ?? '', 'number');
      price.input.min = '0.01'; price.input.required = true;
      box.append(price.wrap);
      const submit = element('button', current ? 'Salvar preço e disponibilizar' : 'Cadastrar e disponibilizar modelo', 'btn');
      submit.type = 'submit'; box.append(submit);
      box.onsubmit = async event => {
        event.preventDefault();
        const value = Number(price.input.value);
        if (!box.reportValidity() || !Number.isFinite(value) || value <= 0) return;
        submit.disabled = true;
        try {
          if (current) {
            const result = await operations('produto_editar', {id: current.id, produto: {
              nome: current.nome, colecao: current.colecao, descricao: current.descricao || '',
              imagem_url: current.imagem_url || '', preco: value, disponivel: true,
              destaque: current.destaque === true, ordem: current.ordem ?? 0
            }});
            if (!result.ok) throw Error('Não foi possível atualizar este modelo.');
          } else {
            await request('/api/admin-salvar-produto', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({
              nome: model.name + ' — Sua arte aqui', colecao: model.collection, preco: value,
              imagem_url: 'https://www.mimbox.com.br' + model.image, disponivel: true, destaque: false,
              descricao: 'Uma unidade de ' + model.name + ' com a sua arte. Compre pelo site e, após o pagamento, clique em Continuar para voltar à Mimbox e enviar a arte pelo WhatsApp com o número do pedido. A produção depende do recebimento e da aprovação da arte.\n[[MIMBOX_CATEGORIA:Personalizados;TAGS:]]'
            })});
          }
          await openPage('produtos'); notify('Modelo disponível para compra pelo site.');
        } catch (error) { notify(error.message, true); }
        finally { submit.disabled = false; }
      };
      section.append(box);
    }
    area.append(section);
  };
})();
