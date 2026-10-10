
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
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    return res.status(405).json({
      erro: "Método não permitido"
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
    // Confirma que a sessão pertence a um usuário válido.
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

    // Confirma a permissão administrativa no banco.
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

    // Consulta os produtos, sem alterar nenhum registro.
    const produtosResposta = await fetch(
      `${base}/rest/v1/produtos?select=id,nome,descricao,colecao,preco,imagem_url,disponivel,destaque,ordem&order=ordem.asc,criado_em.asc`,
      {
        headers: {
          apikey: secret,
          Accept: "application/json"
        }
      }
    );

    if (!produtosResposta.ok) {
      return res.status(503).json({
        erro: "Não foi possível consultar os produtos"
      });
    }

    const produtos = await produtosResposta.json();

    return res.status(200).json({
      sucesso: true,
      produtos
    });

  } catch {
    return res.status(503).json({
      erro: "Serviço temporariamente indisponível"
    });
  }
}
