(function(){
"use strict";
// IDs estáveis: nomes e preços podem mudar sem alterar pedidos já registrados.
const VARIATIONS_PREFIX = 'mimbox_variacoes_';
const CATEGORIES_KEY = 'mimbox_catalogo_categorias_v1';
const DEFAULT_CATEGORIES = ['Copos', 'Pratos', 'Boxes', 'Brindes', 'Personalizados'];
const catalogNameKey = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR');
const emptyVariations = () => ({titulo: 'Modelo', opcoes: [], revisao: ''});

function normalizeVariations(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Array.isArray(input.opcoes) || input.opcoes.length > 40) throw Error('Cadastre até 40 variações por produto.');
  const titulo = String(input.titulo || 'Modelo').trim();
  if (!titulo || titulo.length > 60) throw Error('O título das variações deve ter até 60 caracteres.');
  const ids = new Set(), names = new Set();
  const opcoes = input.opcoes.map(option => {
    if (!option || typeof option !== 'object') throw Error('Variação inválida.');
    const id = String(option.id || ''), nome = String(option.nome || '').trim();
    if (!/^v_[a-zA-Z0-9_-]{8,64}$/.test(id) || ids.has(id)) throw Error('Identificador de variação inválido ou repetido.');
    if (!nome || nome.length > 80 || names.has(catalogNameKey(nome))) throw Error('Dê um nome diferente a cada variação (até 80 caracteres).');
    const preco = option.preco === null || option.preco === undefined || option.preco === '' ? null : Number(option.preco);
    if (preco !== null && (!Number.isFinite(preco) || preco <= 0 || preco > 100000 || Math.abs(preco * 100 - Math.round(preco * 100)) > 0.00001)) throw Error('O preço da variação deve ser maior que zero, com até duas casas decimais.');
    const imagem_url = String(option.imagem_url || '').trim();
    if (imagem_url && (imagem_url.length > 2048 || !/^https:\/\/[^\s]+$/i.test(imagem_url))) throw Error('Use uma foto HTTPS válida na variação.');
    if (typeof option.disponivel !== 'boolean') throw Error('Informe a disponibilidade da variação.');
    ids.add(id); names.add(catalogNameKey(nome));
    return {id, nome, preco, imagem_url, disponivel: option.disponivel};
  });
  return {titulo, opcoes, revisao: String(input.revisao || '')};
}

function selectVariation(product, variationId) {
  const config = product.variacoes || emptyVariations();
  const id = String(variationId || '');
  if (!config.opcoes.length) {
    if (id) throw Error('Esta variação mudou. Remova o item do carrinho e escolha novamente.');
    return null;
  }
  const option = config.opcoes.find(value => value.id === id);
  if (!option || !option.disponivel) throw Error('Escolha uma variação disponível de ' + String(product.nome || 'seu produto') + '.');
  return {...option, titulo: config.titulo};
}

function normalizeCategories(value) {
  if (!value || !Array.isArray(value.nomes) || !Array.isArray(value.excluidas) || value.nomes.length > 60 || value.excluidas.length > 120) throw Error('Cadastro de categorias inválido.');
  const clean = list => {
    const result = [], keys = new Set();
    for (const item of list) {
      if (typeof item !== 'string' || !item.trim() || item.length > 55 || /[\[\];,\r\n]/.test(item) || catalogNameKey(item) === 'todos') throw Error('Use nomes de categoria de até 55 caracteres, sem colchetes ou separadores.');
      const key = catalogNameKey(item);
      if (keys.has(key)) throw Error('Há categorias repetidas.');
      keys.add(key); result.push(item.trim());
    }
    return result;
  };
  const nomes = clean(value.nomes), excluidas = clean(value.excluidas);
  if (nomes.some(name => excluidas.some(removed => catalogNameKey(removed) === catalogNameKey(name)))) throw Error('Categoria ativa e excluída ao mesmo tempo.');
  return {nomes, excluidas, revisao: String(value.revisao || '')};
}

function catalogCategories(products, stored) {
  const value = stored ? normalizeCategories(stored) : {nomes: DEFAULT_CATEGORIES, excluidas: [], revisao: ''};
  const nomes = [...value.nomes], seen = new Set(nomes.map(catalogNameKey)), removed = new Set(value.excluidas.map(catalogNameKey));
  for (const product of products) {
    const match = String(product.descricao || '').match(/\[\[MIMBOX_CATEGORIA:([^;\]\r\n]*)/i);
    const name = match?.[1]?.trim(), key = catalogNameKey(name);
    if (name && !seen.has(key) && !removed.has(key)) {nomes.push(name); seen.add(key);}
  }
  return {...value, nomes};
}

const cartLineKey = item => String(item.id) + '::' + String(item.variacao_id || '');


window.MimboxCatalogRules={normalizeVariations,emptyVariations,selectVariation,catalogNameKey,cartLineKey,catalogCategories,normalizeCategories};
})();
