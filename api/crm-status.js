
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ erro: "Método não permitido" });
  }

  res.setHeader("Cache-Control", "no-store");

  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secret) {
    return res.status(503).json({
      status: "configuracao_pendente"
    });
  }

  try {
    const resposta = await fetch(
      `${url.replace(/\/$/, "")}/auth/v1/health`,
      {
        headers: {
          apikey: secret
        },
        signal: AbortSignal.timeout(5000)
      }
    );

    return res.status(resposta.ok ? 200 : 503).json({
      status: resposta.ok ? "conectado" : "indisponivel"
    });
  } catch {
    return res.status(503).json({
      status: "indisponivel"
    });
  }
}
