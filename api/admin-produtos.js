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


const COOKIE_NAME = "mimbox_admin_session";

function lerCookie(req) {
  const cookies = (req.headers.cookie || "")
    .split(";")
    .map(item => item.trim());

  const cookie = cookies.find(item =>
    item.startsWith(COOKIE_NAME + "=")
  );

  if (!cookie) return null;

  try {
    return decodeURIComponent(
      cookie.slice(COOKIE_NAME.length + 1)
    );
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader(
    "X-Content-Type-Options",
    "nosniff"
  );

  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, max-age=0"
  );

  if (req.method !== "GET") {
    return res.status(405).json({
      erro: "Método não permitido"
    });
  }

  const base = String(
    process.env.SUPABASE_URL || ""
  ).replace(/\/$/, "");

  const secret = process.env.SUPABASE_SECRET_KEY;

  if (!base || !secret) {
    return res.status(503).json({
      erro: "Configuração incompleta"
    });
  }

  const publico = req.query?.publico === "1";

  try {
    // PROTEÇÃO DA CONSULTA ADMINISTRATIVA
    if (!publico) {
      const token = lerCookie(req);

      if (!token) {
        return res.status(401).json({
          erro: "Faça login no painel"
        });
      }

      const usuarioResposta = await fetch(
        `${base}/auth/v1/user`,
        {
          headers: {
            apikey: secret,
            Authorization: `Bearer ${token}`
          },
          cache: "no-store"
        }
      );

      if (!usuarioResposta.ok) {
        return res.status(401).json({
          erro: "Sessão inválida ou expirada"
        });
      }

      const usuario = await usuarioResposta.json();

      if (!usuario?.id) {
        return res.status(401).json({
          erro: "Usuário inválido"
        });
      }

      const adminResposta = await fetch(
        `${base}/rest/v1/administradores` +
        `?usuario_id=eq.${encodeURIComponent(usuario.id)}` +
        `&select=usuario_id&limit=1`,
        {
          headers: {
            apikey: secret,
            Authorization: `Bearer ${secret}`,
            Accept: "application/json"
          },
          cache: "no-store"
        }
      );

      if (!adminResposta.ok) {
        return res.status(503).json({
          erro: "Falha ao verificar permissões"
        });
      }

      const administradores =
        await adminResposta.json();

      if (
        !Array.isArray(administradores) ||
        administradores.length !== 1
      ) {
        return res.status(403).json({
          erro: "Acesso não autorizado"
        });
      }
    }

    // CAMPOS DO CATÁLOGO
    // Inclui a galeria de até 8 fotos.
    const campos = [
      "id",
      "nome",
      "descricao",
      "colecao",
      "preco",
      "imagem_url",
      "imagens",
      "disponivel",
      "destaque",
      "ordem"
    ].join(",");

    // A loja consulta somente produtos disponíveis.
    // O CRM consulta todos os produtos.
    const filtro = publico
      ? "&disponivel=eq.true"
      : "";

    const consulta =
      `${base}/rest/v1/produtos` +
      `?select=${campos}` +
      filtro +
      `&order=ordem.asc,nome.asc` +
      `&limit=200`;

    const produtosResposta = await fetch(
      consulta,
      {
        headers: {
          apikey: secret,
          Authorization: `Bearer ${secret}`,
          Accept: "application/json"
        },
        cache: "no-store"
      }
    );

    if (!produtosResposta.ok) {
      const detalhe = await produtosResposta.text();

      console.error(
        "Erro ao consultar produtos:",
        produtosResposta.status,
        detalhe.slice(0, 500)
      );

      return res.status(503).json({
        erro: "Não foi possível consultar os produtos"
      });
    }

    const produtos = await produtosResposta.json();

    if (!Array.isArray(produtos)) {
      return res.status(503).json({
        erro: "Resposta inválida do catálogo"
      });
    }

    // NORMALIZAÇÃO DAS IMAGENS
    const settings = await readCatalogSettings(base, secret, produtos.map(p => p.id));
    const catalogo = attachVariations(produtos, settings).map(produto => {
      const imagens = Array.isArray(produto.imagens)
        ? produto.imagens.filter(
            url =>
              typeof url === "string" &&
              /^https:\/\//i.test(url)
          ).slice(0, 8)
        : [];

      const principal =
        typeof produto.imagem_url === "string"
          ? produto.imagem_url.trim()
          : "";

      // Produtos antigos podem ter somente imagem_url.
      if (imagens.length === 0 && principal) {
        imagens.push(principal);
      }

      return {
        ...produto,
        imagem_url: imagens[0] || principal,
        imagens
      };
    });

    const cup = product => /^Personalizados — Copos — /.test(String(product.colecao || ''));
    const visible = publico ? (req.query?.personalizados === 'copos' ? catalogo.filter(cup) : catalogo.filter(p => !cup(p) || p.variacoes.opcoes.length > 0)) : catalogo;
    return res.status(200).json({
      sucesso: true,
      produtos: visible,
      categorias: catalogCategories(catalogo, settings.categories)
    });

  } catch (erro) {
    console.error("admin-produtos:", erro);

    return res.status(503).json({
      erro: "Serviço temporariamente indisponível"
    });
  }
}
