
const ORIGIN_CEP = "04715005";

const PACKAGE = {
  width: 18,
  height: 9,
  length: 28,
  weight: 1.5
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "Método não permitido."
    });
  }

  try {
    const cep = String(req.body?.cep || "").replace(/\D/g, "");

    if (!/^\d{8}$/.test(cep)) {
      return res.status(400).json({
        error: "Informe um CEP válido."
      });
    }

    const token = process.env.MELHOR_ENVIO_TOKEN;

    if (!token) {
      console.error("Token do Melhor Envio não configurado.");
      return res.status(503).json({
        error: "Cotação de frete indisponível."
      });
    }

    const response = await fetch(
      "https://www.melhorenvio.com.br/api/v2/me/shipment/calculate",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "Mimbox (www.mimbox.com.br)"
        },
        body: JSON.stringify({
          from: { postal_code: ORIGIN_CEP },
          to: { postal_code: cep },
          package: PACKAGE
        })
      }
    );

    if (!response.ok) {
      console.error("Erro Melhor Envio:", response.status);
      return res.status(502).json({
        error: "Não foi possível consultar o frete."
      });
    }

    const data = await response.json();

    const opcoes = (Array.isArray(data) ? data : [])
      .filter(opcao =>
        !opcao.error &&
        opcao.id &&
        Number.isFinite(Number(opcao.custom_price ?? opcao.price))
      )
      .map(opcao => ({
        id: opcao.id,
        transportadora: opcao.company?.name || "Transportadora",
        servico: opcao.name,
        valor: Number(opcao.custom_price ?? opcao.price),
        prazo: opcao.custom_delivery_time ?? opcao.delivery_time
      }));

    return res.status(200).json({ opcoes });

  } catch (error) {
    console.error("Erro ao calcular frete:", error);
    return res.status(500).json({
      error: "Não foi possível calcular o frete."
    });
  }
}
