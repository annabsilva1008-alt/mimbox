
const base = (process.env.SUPABASE_URL || "")
  .replace(/\/$/, "");

const key = process.env.SUPABASE_SECRET_KEY;

const headers = () => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json"
});

const clean = (v, max = 500) =>
  String(v ?? "").trim().slice(0, max);

const enc = v => encodeURIComponent(String(v));

async function db(table, method = "GET", query = "", body) {
  const r = await fetch(
    `${base}/rest/v1/${table}${query}`,
    {
      method,
      headers: {
        ...headers(),
        Prefer: "return=representation"
      },
      ...(body === undefined
        ? {}
        : { body: JSON.stringify(body) })
    }
  );

  const raw = await r.text();
  let data;

  try {
    data = JSON.parse(raw);
  } catch {
    data = raw;
  }

  if (!r.ok) {
    throw Error(
      typeof data === "object"
        ? data.message || data.details || "Erro Supabase"
        : String(data)
    );
  }

  return data;
}

async function admin(req) {
  const cookie = (req.headers.cookie || "")
    .split(";")
    .map(s => s.trim())
    .find(s => s.startsWith("mimbox_admin_session="));

  const token = cookie
    ? decodeURIComponent(
        cookie.slice("mimbox_admin_session=".length)
      )
    : "";

  if (!token) return false;

  const r = await fetch(
    `${base}/auth/v1/user`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`
      }
    }
  );

  if (!r.ok) return false;

  const user = await r.json();
  if (!user?.id) return false;

  const rows = await db(
    "administradores",
    "GET",
    `?usuario_id=eq.${enc(user.id)}&select=usuario_id&limit=1`
  );

  return rows.length > 0;
}

const statuses = [
  "aguardando",
  "em_preparacao",
  "pronto_retirada",
  "enviado",
  "entregue",
  "cancelado"
];

const goodId = id =>
  /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(
    String(id || "")
  );

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (!["GET", "POST"].includes(req.method)) {
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
    if (!(await admin(req))) {
      return res.status(401).json({
        erro: "Sessão administrativa inválida"
      });
    }

    const acao = req.method === "GET"
      ? req.query.acao
      : req.body?.acao;

    if (req.method === "GET") {
      if (acao === "produtos") {
        return res.json({
          produtos: await db(
            "produtos",
            "GET",
            "?select=*&order=nome.asc&limit=300"
          )
        });
      }

      if (acao === "estoque") {
        return res.json({
          itens: await db(
            "estoque_mimbox",
            "GET",
            "?select=*&order=nome.asc&limit=300"
          )
        });
      }

      if (acao === "envios") {
        const pedidos = await db(
          "pedidos",
          "GET",
          "?select=id,numero_pedido,forma_entrega,status_entrega,transportadora,observacoes,clientes(nome)&order=criado_em.desc&limit=200"
        );

        const meta = await db(
          "envios_mimbox",
          "GET",
          "?select=pedido_id,rastreio&limit=300"
        );

        const mapa = new Map(
          meta.map(x => [x.pedido_id, x])
        );

        return res.json({
          envios: pedidos.map(p => ({
            ...p,
            rastreio: mapa.get(p.id)?.rastreio || ""
          }))
        });
      }

      return res.status(400).json({
        erro: "Consulta desconhecida"
      });
    }

    if (acao === "produto_editar") {
      const id = req.body?.id;
      const p = req.body?.produto || {};

      if (
        !goodId(id) ||
        !clean(p.nome, 150) ||
        !Number.isFinite(Number(p.preco)) ||
        Number(p.preco) < 0
      ) {
        return res.status(400).json({
          erro: "Produto inválido"
        });
      }

      const produto = {
        nome: clean(p.nome, 150),
        colecao: clean(p.colecao, 100),
        preco: Number(p.preco),
        descricao: clean(p.descricao, 2000),
        imagem_url: clean(p.imagem_url, 2048),
        disponivel: !!p.disponivel,
        destaque: !!p.destaque
      };

      const rows = await db(
        "produtos",
        "PATCH",
        `?id=eq.${enc(id)}`,
        produto
      );

      return res.json({ ok: rows.length > 0 });
    }

    if (acao === "estoque_criar") {
      const x = req.body?.item || {};
      const quantidade = Number(x.quantidade);
      const minimo = Number(x.minimo);

      if (
        !clean(x.nome, 150) ||
        !Number.isSafeInteger(quantidade) ||
        quantidade < 0 ||
        !Number.isSafeInteger(minimo) ||
        minimo < 0
      ) {
        return res.status(400).json({
          erro: "Estoque inválido"
        });
      }

      const rows = await db(
        "estoque_mimbox",
        "POST",
        "",
        {
          nome: clean(x.nome, 150),
          quantidade,
          minimo,
          unidade: clean(x.unidade, 20) || "un"
        }
      );

      return res.status(201).json({
        item: rows[0]
      });
    }

    if (acao === "estoque_editar") {
      const { id } = req.body || {};
      const quantidade = Number(req.body?.quantidade);
      const minimo = Number(req.body?.minimo);

      if (
        !goodId(id) ||
        !Number.isSafeInteger(quantidade) ||
        quantidade < 0 ||
        !Number.isSafeInteger(minimo) ||
        minimo < 0
      ) {
        return res.status(400).json({
          erro: "Estoque inválido"
        });
      }

      const rows = await db(
        "estoque_mimbox",
        "PATCH",
        `?id=eq.${enc(id)}`,
        { quantidade, minimo }
      );

      return res.json({ ok: rows.length > 0 });
    }

    if (acao === "envio_editar") {
      const { id } = req.body || {};
      const x = req.body?.envio || {};

      if (
        !goodId(id) ||
        !statuses.includes(x.status_entrega)
      ) {
        return res.status(400).json({
          erro: "Envio inválido"
        });
      }

      const pedidos = await db(
        "pedidos",
        "PATCH",
        `?id=eq.${enc(id)}`,
        {
          status_entrega: x.status_entrega,
          transportadora: clean(x.transportadora, 150),
          observacoes: clean(x.observacoes, 1000)
        }
      );

      if (!pedidos.length) {
        return res.status(404).json({
          erro: "Pedido não encontrado"
        });
      }

      const existing = await db(
        "envios_mimbox",
        "GET",
        `?pedido_id=eq.${enc(id)}&select=pedido_id&limit=1`
      );

      if (existing.length) {
        await db(
          "envios_mimbox",
          "PATCH",
          `?pedido_id=eq.${enc(id)}`,
          { rastreio: clean(x.rastreio, 150) }
        );
      } else {
        await db(
          "envios_mimbox",
          "POST",
          "",
          {
            pedido_id: id,
            rastreio: clean(x.rastreio, 150)
          }
        );
      }

      return res.json({ ok: true });
    }

    if (acao === "pedido_manual") {
      const c = req.body?.cliente || {};
      const p = req.body?.pedido || {};
      const total = Number(p.valor_total);
      const quantidade = Number(p.quantidade);

      if (
        clean(c.nome, 150).length < 2 ||
        !/^\S+@\S+\.\S+$/.test(clean(c.email, 254)) ||
        !clean(p.descricao, 250) ||
        !Number.isFinite(total) ||
        total < 0 ||
        !Number.isSafeInteger(quantidade) ||
        quantidade < 1 ||
        !["retirada", "transportadora"].includes(
          p.forma_entrega
        )
      ) {
        return res.status(400).json({
          erro: "Dados do pedido inválidos"
        });
      }

      const clientes = await db(
        "clientes",
        "POST",
        "",
        {
          nome: clean(c.nome, 150),
          email: clean(c.email, 254).toLowerCase(),
          telefone: clean(c.telefone, 30)
        }
      );

      const cliente_id = clientes[0]?.id;

      if (!cliente_id) {
        throw Error("Não foi possível cadastrar cliente");
      }

      const codigo =
        `MANUAL-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

      const pedidos = await db(
        "pedidos",
        "POST",
        "",
        {
          numero_pedido: codigo,
          cliente_id,
          valor_total: total,
          forma_entrega: p.forma_entrega,
          status_pagamento: "pendente",
          status_entrega: "aguardando",
          itens: [{
            descricao: clean(p.descricao, 250),
            quantidade
          }],
          observacoes: clean(p.observacoes, 1000)
        }
      );

      return res.status(201).json({
        ok: true,
        pedido: pedidos[0]
      });
    }

    return res.status(400).json({
      erro: "Ação desconhecida"
    });

  } catch (err) {
    console.error("admin-operacoes", err);

    return res.status(500).json({
      erro: "Falha na operação: " + err.message
    });
  }
}
