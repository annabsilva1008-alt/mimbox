(function () {
  'use strict';
  window.MimboxVariantEditor = function (config, helpers) {
    const {element, field, checkbox, action, productPhoto, uploadProductPhoto} = helpers;
    const rules = window.MimboxCatalogRules;
    config = config || rules.emptyVariations();
    const wrap = element('details', undefined, 'editor-options variant-editor');
    wrap.open = config.opcoes.length > 0;
    wrap.append(element('summary', 'Variações do produto'));
    wrap.append(element('p', 'Um único anúncio, com opções para o cliente escolher. Ex.: Azul, Rosa ou Azul · 300 ml. Sem opções, a compra continua como antes.', 'muted'));
    const title = field('Nome da escolha (ex.: Cor, Modelo ou Tamanho)', config.titulo);
    title.input.maxLength = 60; wrap.append(title.wrap);
    const list = element('div', undefined, 'variant-editor-list'), rows = [];
    wrap.append(list);
    const changed = () => wrap.dispatchEvent(new Event('input', {bubbles: true}));
    function add(option) {
      if (rows.length >= 40) throw Error('Use até 40 variações por produto.');
      option = option || {id: 'v_' + crypto.randomUUID(), nome: '', preco: null, imagem_url: '', disponivel: true};
      const node = element('section', undefined, 'variant-editor-row');
      const name = field('Nome da opção', option.nome); name.input.maxLength = 80;
      const price = field('Preço desta opção (R$; vazio usa o preço do produto)', option.preco ?? '', 'number');
      price.input.min = '0.01'; price.input.placeholder = 'Usar preço do produto';
      const available = checkbox('Opção disponível para compra', option.disponivel);
      const photo = productPhoto('Foto desta opção (opcional)', option.imagem_url);
      const fileId = 'variant-photo-' + option.id;
      photo.file.id = fileId; photo.wrap.querySelector('label').htmlFor = fileId;
      photo.wrap.querySelector('p').textContent = 'Envie do computador. A imagem será otimizada automaticamente ao salvar.';
      const photoDetails = element('details', undefined, 'variant-photo-options');
      photoDetails.append(element('summary', 'Foto da opção'), photo.wrap);
      const row = {id: option.id, node, name, price, available, photo};
      const remove = action('Remover esta opção', () => {
        if (config.opcoes.some(o => o.id === row.id) && !confirm('Remover esta variação das próximas compras? Os pedidos anteriores serão preservados.')) return;
        rows.splice(rows.indexOf(row), 1); node.remove(); changed();
      });
      node.append(name.wrap, price.wrap, available.wrap, photoDetails, remove);
      rows.push(row); list.append(node);
      return row;
    }
    for (const option of config.opcoes) add(option);
    wrap.append(action('+ Adicionar variação', () => {const row = add(); wrap.open = true; row.name.input.focus(); changed();}));
    function collect() {
      try {
        return rules.normalizeVariations({titulo: title.input.value, revisao: config.revisao, opcoes: rows.map(row => ({id: row.id, nome: row.name.input.value, preco: row.price.input.value, disponivel: row.available.input.checked, imagem_url: row.photo.url.value}))});
      } catch (error) {wrap.open = true; throw error;}
    }
    return {wrap, validate: collect, async prepare() {
      collect();
      for (const row of rows) await uploadProductPhoto(row.photo);
      return collect();
    }};
  };

  window.MimboxCategoriesPage = async function (area, context) {
    const {element, card, field, action, operations, notify} = context;
    const key = window.MimboxCatalogRules.catalogNameKey;
    let categories = window.MimboxCatalogRules.normalizeCategories(context.categories);
    const intro = card('Categorias da loja');
    intro.append(element('p', 'Estas são as opções de filtro da loja. Excluir uma categoria retira esse filtro; os produtos continuam disponíveis em Todos. As coleções são gerenciadas na aba Coleções.'));
    area.append(intro);
    const create = card('Adicionar categoria'), name = field('Nome da categoria'); name.input.maxLength = 55;
    create.append(name.wrap, action('Adicionar categoria', async () => {
      const value = name.input.value.trim();
      const next = {nomes: [...categories.nomes, value], excluidas: categories.excluidas.filter(n => key(n) !== key(value)), revisao: categories.revisao};
      await save(next); name.input.value = '';
    })); area.append(create);
    const list = card('Categorias cadastradas'); area.append(list);
    async function save(next) {
      next = window.MimboxCatalogRules.normalizeCategories(next);
      const result = await operations('categorias_salvar', {categorias: next});
      categories = result.categorias; context.onSaved(categories); render(); notify('Categorias atualizadas.');
    }
    function render() {
      list.replaceChildren(element('h2', 'Categorias cadastradas'));
      if (!categories.nomes.length) list.append(element('p', 'Sem filtros de categoria. Os produtos aparecem em Todos.'));
      for (const value of categories.nomes) {
        const row = element('div', undefined, 'category-admin-row');
        const count = context.products.filter(p => key(String(p.descricao || '').match(/\[\[MIMBOX_CATEGORIA:([^;\]\r\n]*)/i)?.[1]) === key(value)).length;
        row.append(element('span', value + (count ? ' · ' + count + ' produto(s) classificado(s)' : '')));
        row.append(action('Excluir categoria', async () => {
          if (!confirm('Excluir a categoria “' + value + '” dos filtros da loja? Nenhum produto será excluído.')) return;
          await save({nomes: categories.nomes.filter(n => key(n) !== key(value)), excluidas: [...categories.excluidas, value], revisao: categories.revisao});
        })); list.append(row);
      }
    }
    render();
  };
})();
