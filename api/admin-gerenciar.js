
const BASE = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SECRET_KEY;

const headers = () => ({
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json"
});

const json = (res, code, data) => res.status(code).json(data);
const str = (value, max = 500) =>
  String(value ?? "").trim().slice(0, max);

async function db(table, method = "GET", query = "", body) {
  const response = await fetch(`${BASE}/rest/v1/${table}${query}`, {
    method,
    headers: {
      ...headers(),
      Prefer:
        method === "POST" && table === "configuracoes_loja"
          ? "return=representation,resolution=merge-duplicates"
          : "return=representation"
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });

  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = raw;
  }

  if (!response.ok) {
    throw new Error(
      typeof data === "object"
        ? data.message || data.details || "Erro no banco"
        : String(data)
    );
  }
  return data;
}

async function authorized(req) {
  const cookie = (req.headers.cookie || "")
    .split(";")
    .map(x => x.trim())
    .find(x => x.startsWith("mimbox_admin_session="));

  const token = cookie
    ? decodeURIComponent(cookie.slice("mimbox_admin_session=".length))
    : "";

  if (!token) return false;

  const response = await fetch(`${BASE}/auth/v1/user`, {
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) return false;
  const user = await response.json();
  if (!user?.id) return false;

  const admins = await db(
    "administradores",
    "GET",
    `?usuario_id=eq.${encodeURIComponent(user.id)}&select=usuario_id&limit=1`
  );
  return Array.isArray(admins) && admins.length > 0;
}

const SITE_KEY = "site_editor_v1";

const SITE_DEFAULTS = {
  hero_titulo: "Presentes com personalidade.",
  hero_subtitulo: "Coleções criativas e personalizados para deixar sua marca.",
  hero_imagem: "",
  hero_botao_texto: "Conheça as coleções",
  hero_botao_link: "/#colecoes",
  seo_titulo: "Mimbox | Copos personalizados, brindes e coleções criativas",
  seo_descricao: "Copos personalizados, brindes empresariais e coleções criativas. Conheça a Mimbox e peça seu orçamento.",
  whatsapp: "",
  instagram: "",
  aviso: ""
};

const SITE_LIMITS = {
  hero_titulo: 100,
  hero_subtitulo: 240,
  hero_imagem: 2048,
  hero_botao_texto: 55,
  hero_botao_link: 500,
  seo_titulo: 70,
  seo_descricao: 180,
  whatsapp: 25,
  instagram: 200,
  aviso: 240
};

function validarConteudoSite(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Conteúdo inválido");
  }

  const output = {};
  for (const [campo, limite] of Object.entries(SITE_LIMITS)) {
    output[campo] = String(
      input[campo] ?? SITE_DEFAULTS[campo]
    ).trim().slice(0, limite);
  }

  for (const campo of ["hero_imagem", "instagram"]) {
    if (output[campo] && !/^https:\/\/[^\s]+$/i.test(output[campo])) {
      throw new Error(`${campo}: use uma URL HTTPS`);
    }
  }

  if (
    output.hero_botao_link &&
    !/^(https:\/\/[^\s]+|\/(?!\/)[^\s]*|#[^\s]*)$/i.test(output.hero_botao_link)
  ) {
    throw new Error("Link do botão inválido");
  }

  return output;
}

const deliveryStatuses = [
  "aguardando",
  "em_preparacao",
  "pronto_retirada",
  "enviado",
  "entregue",
  "cancelado"
];

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (!["GET", "POST"].includes(req.method)) {
    return json(res, 405, { erro: "Método não permitido" });
  }

  if (!BASE || !KEY) {
    return json(res, 503, { erro: "Supabase não configurado" });
  }

  try {
    if (!(await authorized(req))) {
      return json(res, 401, {
        erro: "Acesso administrativo não autorizado"
      });
    }

    const action = req.method === "GET"
      ? req.query.action
      : req.body?.action;

    if (action === "site_conteudo") {
      if (req.method === "GET") {
        const rows = await db(
          "configuracoes_loja",
          "GET",
          `?chave=eq.${SITE_KEY}&select=valor&limit=1`
        );

        return json(res, 200, {
          ok: true,
          conteudo: {
            ...SITE_DEFAULTS,
            ...(rows[0]?.valor || {})
          }
        });
      }

      let conteudo;
      try {
        conteudo = validarConteudoSite(req.body?.conteudo);
      } catch (erro) {
        return json(res, 400, { erro: erro.message });
      }

      await db(
        "configuracoes_loja",
        "POST",
        "?on_conflict=chave",
        { chave: SITE_KEY, valor: conteudo }
      );

      return json(res, 200, { ok: true, conteudo });
    }

    if (action === "overview") {
      const [pedidos, produtos, clientes, config] =
        await Promise.all([
          db(
            "pedidos",
            "GET",
            "?select=*,clientes(nome,telefone,email)&order=criado_em.desc&limit=200"
          ),
          db("produtos", "GET", "?select=*&limit=200"),
          db("clientes", "GET", "?select=*&limit=200"),
          db(
            "configuracoes_loja",
            "GET",
            "?chave=eq.principal&select=valor&limit=1"
          )
        ]);

      return json(res, 200, {
        pedidos,
        produtos,
        clientes,
        config: config[0]?.valor || {}
      });
    }

    if (action === "config") {
      const c = req.body?.config || {};
      const config = {
        retirada_ativa: !!c.retirada_ativa,
        retirada_local: str(c.retirada_local, 250),
        retirada_horarios: str(c.retirada_horarios, 300),
        retirada_instrucoes: str(c.retirada_instrucoes, 800),
        loja_aviso: str(c.loja_aviso, 300),
        whatsapp: str(c.whatsapp, 25),
        instagram: str(c.instagram, 200)
      };

      await db(
        "configuracoes_loja",
        "POST",
        "?on_conflict=chave",
        { chave: "principal", valor: config }
      );

      return json(res, 200, { ok: true, config });
    }

    if (action === "pedido_status") {
      const id = str(req.body?.id, 100);
      const status = str(req.body?.status_entrega, 50);

      if (!id || !deliveryStatuses.includes(status)) {
        return json(res, 400, {
          erro: "Pedido ou status inválido"
        });
      }

      const result = await db(
        "pedidos",
        "PATCH",
        `?id=eq.${encodeURIComponent(id)}&select=id,status_entrega`,
        { status_entrega: status }
      );

      if (!result.length) {
        return json(res, 404, { erro: "Pedido não encontrado" });
      }

      return json(res, 200, {
        ok: true,
        pedido: result[0]
      });
    }

    if (action === "pedido_nota") {
      const id = str(req.body?.id, 100);
      const nota = str(req.body?.nota, 1000);

      if (!id) {
        return json(res, 400, { erro: "Pedido inválido" });
      }

      const result = await db(
        "pedidos",
        "PATCH",
        `?id=eq.${encodeURIComponent(id)}&select=id,observacoes`,
        { observacoes: nota }
      );

      if (!result.length) {
        return json(res, 404, { erro: "Pedido não encontrado" });
      }

      return json(res, 200, { ok: true });
    }

    if (action === "produto") {
      const p = req.body?.produto || {};
      const id = str(p.id, 100);
      const preco = Number(p.preco);

      if (!id) {
        return json(res, 400, {
          erro: "ID do produto obrigatório"
        });
      }

      if (
        !str(p.nome, 150) ||
        !Number.isFinite(preco) ||
        preco < 0
      ) {
        return json(res, 400, {
          erro: "Nome e preço válidos obrigatórios"
        });
      }

      const data = {
        nome: str(p.nome, 150),
        colecao: str(p.colecao, 100),
        preco,
        descricao: str(p.descricao, 2000),
        imagem_url: str(p.imagem_url, 2048),
        disponivel: !!p.disponivel,
        destaque: !!p.destaque
      };

      const result = await db(
        "produtos",
        "PATCH",
        `?id=eq.${encodeURIComponent(id)}&select=id`,
        data
      );

      if (!result.length) {
        return json(res, 404, {
          erro: "Produto não encontrado"
        });
      }

      return json(res, 200, { ok: true });
    }

    if (action === "pedido_manual") {
      const c = req.body?.cliente || {};
      const p = req.body?.pedido || {};

      const nome = str(c.nome, 150);
      const email = str(c.email, 254).toLowerCase();
      const telefone = str(c.telefone, 30);

      if (
        nome.length < 2 ||
        !/^\S+@\S+\.\S+$/.test(email)
      ) {
        return json(res, 400, {
          erro: "Nome e e-mail válidos são obrigatórios"
        });
      }

      const valor = Number(p.valor_total);
      if (!Number.isFinite(valor) || valor < 0) {
        return json(res, 400, { erro: "Valor inválido" });
      }

      const forma = [
        "retirada",
        "transportadora"
      ].includes(p.forma_entrega)
        ? p.forma_entrega
        : null;

      if (!forma) {
        return json(res, 400, {
          erro: "Forma de entrega inválida"
        });
      }

      const clientes = await db(
        "clientes",
        "POST",
        "?select=id",
        { nome, email, telefone }
      );

      const idCliente = clientes[0]?.id;
      if (!idCliente) {
        throw new Error("Cliente não pôde ser criado");
      }

      const codigo = `MANUAL-${Date.now()}`;
      const pedido = {
        numero_pedido: codigo,
        cliente_id: idCliente,
        valor_total: valor,
        forma_entrega: forma,
        status_pagamento: "pendente",
        status_entrega: "aguardando",
        itens: [
          {
            descricao: str(p.descricao, 200),
            quantidade: Math.max(
              1,
              Math.min(100, Number(p.quantidade) || 1)
            )
          }
        ]
      };

      const result = await db(
        "pedidos",
        "POST",
        "?select=id,numero_pedido",
        pedido
      );

      return json(res, 201, {
        ok: true,
        pedido: result[0]
      });
    }

    return json(res, 400, {
      erro: "Ação desconhecida"
    });
  } catch (erro) {
    console.error("admin-gerenciar", erro);
    return json(res, 500, {
      erro: erro.message || "Erro no servidor"
    });
  }
}
