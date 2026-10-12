
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      erro: "Método não permitido"
    });
  }

  const base = (process.env.SUPABASE_URL || "")
    .replace(/\/$/, "");

  const key = process.env.SUPABASE_SECRET_KEY;

  if (!base || !key) {
    return res.status(503).json({
      erro: "Serviço indisponível"
    });
  }

  try {
    const resposta = await fetch(
      `${base}/rest/v1/configuracoes_loja?chave=eq.principal&select=valor&limit=1`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`
        }
      }
    );

    if (!resposta.ok) {
      throw new Error("Configuração indisponível");
    }

    const registros = await resposta.json();
    const config = registros[0]?.valor || {};

    res.setHeader(
      "Cache-Control",
      "public, max-age=30"
    );

    return res.status(200).json({
      retirada_ativa: !!config.retirada_ativa,
      retirada_local: config.retirada_local || "",
      retirada_horarios: config.retirada_horarios || "",
      retirada_instrucoes: config.retirada_instrucoes || "",
      loja_aviso: config.loja_aviso || "",
      whatsapp: config.whatsapp || "",
      instagram: config.instagram || ""
    });
  } catch (erro) {
    return res.status(503).json({
      erro: "Configurações indisponíveis"
    });
  }
}
