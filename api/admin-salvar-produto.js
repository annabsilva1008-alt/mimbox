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

// Somente servidor: usa a tabela de configurações já existente; sem migrações.
async function readCatalogSettings(base, secret, ids) {
  const keys = [CATEGORIES_KEY, ...[...new Set(ids.map(String))].filter(id => /^[0-9a-f-]{36}$/i.test(id)).map(id => VARIATIONS_PREFIX + id.toLowerCase())];
  const rows = [];
  for (let offset = 0; offset < keys.length; offset += 35) {
    const response = await fetch(base + '/rest/v1/configuracoes_loja?select=chave,valor&chave=in.(' + keys.slice(offset, offset + 35).join(',') + ')&limit=35', {headers: {apikey: secret, Authorization: 'Bearer ' + secret}, cache: 'no-store'});
    if (!response.ok) throw Error('Não foi possível conferir as variações. Tente novamente.');
    const data = await response.json();
    if (!Array.isArray(data)) throw Error('Configuração de catálogo inválida.');
    rows.push(...data);
  }
  const variants = new Map(); let categories = null;
  for (const row of rows) {
    if (row.chave === CATEGORIES_KEY) categories = normalizeCategories(row.valor);
    else if (String(row.chave).startsWith(VARIATIONS_PREFIX)) variants.set(row.chave.slice(VARIATIONS_PREFIX.length), normalizeVariations(row.valor));
  }
  return {variants, categories};
}

function attachVariations(products, settings) {
  return products.map(product => ({...product, variacoes: settings.variants.get(String(product.id).toLowerCase()) || emptyVariations()}));
}


const base = (process.env.SUPABASE_URL || "")
  .replace(/\/$/, "");

const key = process.env.SUPABASE_SECRET_KEY;

const clean = (value, max = 500) =>
  String(value ?? "").trim().slice(0, max);

function getSessionToken(req) {
  const cookie = (req.headers.cookie || "")
    .split(";")
    .map(item => item.trim())
    .find(item =>
      item.startsWith("mimbox_admin_session=")
    );

  if (!cookie) return "";

  try {
    return decodeURIComponent(
      cookie.slice("mimbox_admin_session=".length)
    );
  } catch {
    return "";
  }
}

async function checkAdmin(req) {
  const token = getSessionToken(req);

  if (!token) return false;

  const userResponse = await fetch(
    `${base}/auth/v1/user`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`
      }
    }
  );

  if (!userResponse.ok) return false;

  const user = await userResponse.json();

  if (!user?.id) return false;

  const adminResponse = await fetch(
    `${base}/rest/v1/administradores` +
    `?usuario_id=eq.${encodeURIComponent(user.id)}` +
    `&select=usuario_id&limit=1`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`
      }
    }
  );

  if (!adminResponse.ok) {
    throw new Error(
      "Não foi possível verificar o administrador"
    );
  }

  const admins = await adminResponse.json();

  return Array.isArray(admins) && admins.length > 0;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({
      erro: "Método não permitido"
    });
  }

  if (!base || !key) {
    return res.status(503).json({
      erro: "Supabase não configurado"
    });
  }

  try {
    const autorizado = await checkAdmin(req);

    if (!autorizado) {
      return res.status(401).json({
        erro: "Sessão administrativa inválida"
      });
    }

    const dados = req.body || {};

    let variations;
    if (dados.variacoes !== undefined) {
      try { variations = normalizeVariations(dados.variacoes); if(variations.opcoes.length && Number(dados.preco)<=0)throw Error("Informe um preço padrão maior que zero para o produto."); }
      catch (error) { return res.status(400).json({erro: error.message}); }
      variations.revisao = crypto.randomUUID();
    }
    const nome = clean(dados.nome, 150);
    const colecao = clean(dados.colecao, 100);
    const descricao = clean(dados.descricao, 2000);
    const imagem_url = clean(dados.imagem_url, 2048);
    const preco = Number(dados.preco);

    if (!nome) {
      return res.status(400).json({
        erro: "Informe o nome do produto"
      });
    }

    if (!Number.isFinite(preco) || preco < 0) {
      return res.status(400).json({
        erro: "Informe um preço válido"
      });
    }

    if (
      imagem_url &&
      !/^https?:\/\//i.test(imagem_url)
    ) {
      return res.status(400).json({
        erro: "Endereço da imagem inválido"
      });
    }

    const produto = {
      nome,
      colecao,
      preco,
      descricao,
      imagem_url,
      disponivel: variations?.opcoes.length ? false : dados.disponivel !== false,
      destaque: dados.destaque === true
    };

    const resposta = await fetch(
      `${base}/rest/v1/produtos`,
      {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify(produto)
      }
    );

    const texto = await resposta.text();

    let resultado;

    try {
      resultado = JSON.parse(texto);
    } catch {
      resultado = null;
    }

    if (!resposta.ok) {
      console.error(
        "Erro ao cadastrar produto:",
        resposta.status,
        texto
      );

      return res.status(502).json({
        erro:
          resultado?.message ||
          resultado?.details ||
          "Não foi possível cadastrar o produto"
      });
    }

    const cadastrado = Array.isArray(resultado)
      ? resultado[0]
      : null;

    if (!cadastrado?.id) {
      return res.status(502).json({
        erro: "O cadastro não retornou o produto criado"
      });
    }

    let variantsSaved = true;
    if (variations?.opcoes.length) {
      try {
        const response = await fetch(`${base}/rest/v1/configuracoes_loja?on_conflict=chave`, {method: "POST", headers: {apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation,resolution=merge-duplicates"}, body: JSON.stringify({chave: VARIATIONS_PREFIX + cadastrado.id.toLowerCase(), valor: variations})});
        if (!response.ok) variantsSaved = false;
      } catch { variantsSaved = false; }
      if (!variantsSaved) {
        // Não deixar à venda um produto cuja escolha obrigatória não foi salva.
        await fetch(`${base}/rest/v1/produtos?id=eq.${encodeURIComponent(cadastrado.id)}`, {method: "PATCH", headers: {apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json"}, body: JSON.stringify({disponivel: false})});
      }
    }
    let activationFailed = false;
    if (variantsSaved && variations?.opcoes.length && dados.disponivel !== false) {
      try {
        const activated = await fetch(`${base}/rest/v1/produtos?id=eq.${encodeURIComponent(cadastrado.id)}`, {method: "PATCH", headers: {apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json"}, body: JSON.stringify({disponivel: true})});
        activationFailed = !activated.ok;
        if (!activationFailed) cadastrado.disponivel = true;
      } catch { activationFailed = true; }
    }
    return res.status(201).json({
      ok: true,
      ...(activationFailed ? {aviso: "Produto e variações cadastrados, mas o anúncio está oculto. Abra o cadastro e marque Disponível para colocá-lo à venda."} : {}),
      variacoes_salvas: variantsSaved,
      ...(!variantsSaved ? {aviso: "Produto criado e ocultado, mas as variações não foram salvas. Abra este cadastro, adicione as opções e disponibilize-o ao salvar. Não cadastre novamente."} : {}),
      produto: cadastrado,
      mensagem: "Produto cadastrado com sucesso"
    });

  } catch (erro) {
    console.error(
      "admin-salvar-produto:",
      erro
    );

    return res.status(500).json({
      erro: "Falha no cadastro: " + erro.message
    });
  }
}
