
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
      disponivel: dados.disponivel !== false,
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

    return res.status(201).json({
      ok: true,
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
