
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({
      erro: "Método não permitido"
    });
  }

  // Verifica se a solicitação veio do próprio site.
  const origem = req.headers.origin;

  if (!origem) {
    return res.status(403).json({
      erro: "Origem não autorizada"
    });
  }

  try {
    const url = new URL(origem);

    if (
      url.protocol !== "https:" ||
      url.host !== req.headers.host
    ) {
      return res.status(403).json({
        erro: "Origem não autorizada"
      });
    }
  } catch {
    return res.status(403).json({
      erro: "Origem inválida"
    });
  }

  // Apaga o cookie usado pelo login administrativo.
  res.setHeader(
    "Set-Cookie",
    [
      "mimbox_admin_session=",
      "HttpOnly",
      "Secure",
      "SameSite=Strict",
      "Path=/api/",
      "Max-Age=0"
    ].join("; ")
  );

  return res.status(200).json({
    sucesso: true,
    mensagem: "Sessão encerrada"
  });
}
