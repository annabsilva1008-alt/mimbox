
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({
      erro: "Método não permitido"
    });
  }

  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secret) {
    return res.status(503).json({
      erro: "Configuração do login incompleta"
    });
  }

  const { email, senha } = req.body || {};

  if (
    typeof email !== "string" ||
    typeof senha !== "string" ||
    !email.includes("@") ||
    email.length > 254 ||
    senha.length === 0 ||
    senha.length > 1024
  ) {
    return res.status(400).json({
      erro: "Informe e-mail e senha válidos"
    });
  }

  try {
    const base = url.replace(/\/$/, "");

    // Verifica o e-mail e a senha no Supabase Auth.
    const loginResposta = await fetch(
      `${base}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: secret
        },
        body: JSON.stringify({
          email,
          password: senha
        })
      }
    );

    if (!loginResposta.ok) {
      return res.status(401).json({
        erro: "E-mail ou senha inválidos"
      });
    }

    const sessao = await loginResposta.json();

    // Identifica o usuário autenticado.
    const usuarioResposta = await fetch(
      `${base}/auth/v1/user`,
      {
        headers: {
          apikey: secret,
          Authorization: `Bearer ${sessao.access_token}`
        }
      }
    );

    if (!usuarioResposta.ok) {
      return res.status(401).json({
        erro: "Não foi possível validar o usuário"
      });
    }

    const usuario = await usuarioResposta.json();

    if (!usuario.id) {
      return res.status(401).json({
        erro: "Usuário inválido"
      });
    }

    // A chave secreta autoriza a consulta pelo servidor.
    // Não usamos sb_secret_ como Bearer token.
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
        erro: "Não foi possível verificar a permissão"
      });
    }

    const administradores = await adminResposta.json();

    if (
      !Array.isArray(administradores) ||
      administradores.length !== 1
    ) {
      return res.status(403).json({
        erro: "Usuário sem permissão administrativa"
      });
    }

    // Não devolvemos tokens nem chaves ao navegador.
    return res.status(200).json({
      status: "autenticado",
      mensagem: "Login administrativo validado"
    });

  } catch {
    return res.status(503).json({
      erro: "Serviço temporariamente indisponível"
    });
  }
}
