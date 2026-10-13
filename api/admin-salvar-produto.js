
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

function origemPermitida(req) {
  const origem = req.headers.origin;
  const host = req.headers.host;

  if (!origem || !host) return false;

  try {
    const url = new URL(origem);

    return (
      url.protocol === "https:" &&
      url.host === host
    );
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({
      erro: "Método não permitido"
    });
  }

  // Impede solicitações de outros sites.
  if (!origemPermitida(req)) {
    return res.status(403).json({
      erro: "Origem não autorizada"
    });
  }

  const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const secret = process.env.SUPABASE_SECRET_KEY;

  if (!base || !secret) {
    return res.status(503).json({
      erro: "Configuração incompleta"
    });
  }

  const token = lerCookie(req);

  if (!token) {
    return res.status(401).json({
      erro: "Faça login no painel"
    });
  }

  try {
    // Verifica o usuário autenticado.
    const usuarioResposta = await fetch(
      `${base}/auth/v1/user`,
      {
        headers: {
          apikey: secret,
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!usuarioResposta.ok) {
      return res.status(401).json({
        erro: "Sessão inválida ou expirada"
      });
    }

    const usuario = await usuarioResposta.json();

    if (!usuario.id) {
      return res.status(401).json({
        erro: "Usuário inválido"
      });
    }

    // Confirma que o usuário é administrador.
    const adminResposta = await fetch(
      `${base}/rest/v1/administradores?usuario_id=eq.${encodeURIComponent(usuario.id)}&select=usuario_id`,
      {
        headers: {
          apikey: secret,
          Accept: "application/json"
        }
      }
    );

    if (!adminResposta.ok) {
      return res.status(503).json({
        erro: "Falha ao verificar permissões"
      });
    }

    const administradores = await adminResposta.json();

    if (
      !Array.isArray(administradores) ||
      administradores.length !== 1
    ) {
      return res.status(403).json({
        erro: "Acesso não autorizado"
      });
    }

    // Recebe e valida as informações do produto.
    const dados = req.body || {};

    const nome =
      typeof dados.nome === "string"
        ? dados.nome.trim()
        : "";

    const descricao =
      typeof dados.descricao === "string"
        ? dados.descricao.trim()
        : "";

    const colecao =
      typeof dados.colecao === "string"
        ? dados.colecao.trim()
        : "";

    const preco = dados.preco;

    if (
      !nome ||
      nome.length > 150 ||
      descricao.length > 2000 ||
      colecao.length > 100 ||
      typeof preco !== "number" ||
      !Number.isFinite(preco) ||
      preco < 0 ||
      preco > 99999999.99 ||
      Math.round(preco * 100) / 100 !== preco
    ) {
      return res.status(400).json({
        erro: "Confira o nome, a descrição e o preço"
      });
    }

    let imagem_url = null;

    if (dados.imagem_url != null && dados.imagem_url !== "") {
      if (
        typeof dados.imagem_url !== "string" ||
        dados.imagem_url.length > 2048
      ) {
        return res.status(400).json({
          erro: "Endereço da imagem inválido"
        });
      }

      try {
        const url = new URL(dados.imagem_url);

        if (url.protocol !== "https:") {
          throw new Error("Protocolo inválido");
        }

        imagem_url = url.toString();
      } catch {
        return res.status(400).json({
          erro: "A imagem precisa ter um link HTTPS válido"
        });
      }
    }

    const produto = {
      nome,
      descricao,
      colecao,
      preco,
      imagem_url,
      disponivel: dados.disponivel !== false,
      destaque: dados.destaque === true,
      ordem: 0
    };

    // Salva somente na tabela de produtos.
    const salvarResposta = await fetch(
      `${base}/rest/v1/produtos`,
      {
        method: "POST",
        headers: {
          apikey: secret,
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify(produto)
      }
    );

    if (!salvarResposta.ok) {
      return res.status(503).json({
        erro: "Não foi possível salvar o produto"
      });
    }

    const resultado = await salvarResposta.json();

    return res.status(201).json({
      sucesso: true,
      mensagem: "Produto cadastrado com sucesso",
      produto: resultado[0]
    });

  } catch {
    return res.status(503).json({
      erro: "Serviço temporariamente indisponível"
    });
  }
}
