
const PRODUCTS = {
  "vsf": {
    description: "VSF — Vá Ser Feliz — Kit com 4 copos",
    price: 5990
  },
  "pe-na-areia": {
    description: "Pé na Areia — Kit com 4 copos",
    price: 5990
  },
  "brasilidades": {
    description: "Brasilidades — Kit com 4 copos",
    price: 5990
  },
  "mimcine": {
    description: "MimCine — Kit com 4 copos",
    price: 5990
  },
  "clube-3-meses": {
    description: "Clube Mimbox — 3 meses",
    price: 24990
  },
  "clube-6-meses": {
    description: "Clube Mimbox — 6 meses",
    price: 44990
  },
  "clube-9-meses": {
    description: "Clube Mimbox — 9 meses",
    price: 69990
  }
};

const PRODUCT_ALIASES = {
  "VSF — Vá Ser Feliz": "vsf",
  "Pé na Areia": "pe-na-areia",
  "Brasilidades": "brasilidades",
  "MimCine": "mimcine",
  "Clube Mimbox — 3 meses": "clube-3-meses",
  "Clube Mimbox — 6 meses": "clube-6-meses",
  "Clube Mimbox — 9 meses": "clube-9-meses"
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "Método não permitido."
    });
  }

  try {
    const {
      items,
      customer,
      deliveryMethod
    } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: "Carrinho vazio."
      });
    }

    if (
      !customer ||
      typeof customer.name !== "string" ||
      customer.name.trim().length < 2
    ) {
      return res.status(400).json({
        error: "Informe o nome do comprador."
      });
    }

    const rawPhone = String(
      customer.phone_number || customer.phone || ""
    );

    let phone = rawPhone.replace(/\D/g, "");

    if (phone.startsWith("55") && phone.length > 11) {
      phone = phone.slice(2);
    }

    if (phone.length < 10 || phone.length > 11) {
      return res.status(400).json({
        error: "Informe um telefone válido."
      });
    }

    if (!["shipping", "pickup"].includes(deliveryMethod)) {
      return res.status(400).json({
        error: "Forma de entrega inválida."
      });
    }

    // O frete precisa ser configurado antes
    // de permitir pagamentos com entrega.
    if (deliveryMethod === "shipping") {
      return res.status(400).json({
        error: "O cálculo do frete ainda não está configurado. Selecione retirada para testar o checkout."
      });
    }

    const checkoutItems = [];

    for (const item of items) {
      if (!item || typeof item !== "object") {
        return res.status(400).json({
          error: "Há itens inválidos no carrinho."
        });
      }

      const rawId = String(item.id || "").trim();

      const productId = Object.hasOwn(PRODUCTS, rawId)
        ? rawId
        : PRODUCT_ALIASES[rawId];

      const quantity = Number(
        item.qty ?? item.quantity ?? 1
      );

      if (
        !productId ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 20
      ) {
        return res.status(400).json({
          error: "Há produtos ou quantidades inválidos no carrinho."
        });
      }

      checkoutItems.push({
        quantity,
        price: PRODUCTS[productId].price,
        description: PRODUCTS[productId].description
      });
    }

    const orderNsu = `mimbox-${crypto.randomUUID()}`;

    const payload = {
      handle: "mimbox",
      order_nsu: orderNsu,
      redirect_url:
        "https://www.mimbox.com.br/pagamento-retorno.html",
      customer: {
        name: customer.name.trim(),
        phone_number: "+55" + phone
      },
      items: checkoutItems
    };

    const response = await fetch(
      "https://api.checkout.infinitepay.io/links",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    const data = await response.json();

    const checkoutUrl =
      data.url ||
      data.checkout_url ||
      data.payment_url ||
      data.link;

    if (
      !response.ok ||
      typeof checkoutUrl !== "string" ||
      !checkoutUrl.startsWith("https://")
    ) {
      console.error(
        "Erro da InfinitePay:",
        response.status,
        data
      );

      return res.status(502).json({
        error: "Não foi possível gerar o pagamento na InfinitePay."
      });
    }

    return res.status(200).json({
      url: checkoutUrl,
      order_nsu: orderNsu
    });

  } catch (error) {
    console.error("Erro ao criar checkout:", error);

    return res.status(500).json({
      error: "Não foi possível iniciar o pagamento."
    });
  }
}
