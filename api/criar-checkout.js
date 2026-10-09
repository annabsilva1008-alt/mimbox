
const PRODUCTS = {
  vsf: {
    description: "VSF — Vá Ser Feliz — Kit com 4 copos",
    price: 5990
  },
  "pe-na-areia": {
    description: "Pé na Areia — Kit com 4 copos",
    price: 5990
  },
  brasilidades: {
    description: "Brasilidades — Kit com 4 copos",
    price: 5990
  },
  mimcine: {
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
  Brasilidades: "brasilidades",
  MimCine: "mimcine",
  "Clube Mimbox — 3 meses": "clube-3-meses",
  "Clube Mimbox — 6 meses": "clube-6-meses",
  "Clube Mimbox — 9 meses": "clube-9-meses"
};

const ORIGIN_CEP = "04715005";
const FREE_SHIPPING_THRESHOLD = 30000;

const PACKAGE = {
  width: 18,
  height: 9,
  length: 28,
  weight: 1.5
};

function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

async function quoteShipping(cep, itemCount, subtotal) {
  const token = process.env.MELHOR_ENVIO_TOKEN;

  if (!token) {
    throw new Error("MELHOR_ENVIO_TOKEN não configurado.");
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
        from: {
          postal_code: ORIGIN_CEP
        },
        to: {
          postal_code: cep
        },
        package: {
          ...PACKAGE,
          weight: Number(
            (PACKAGE.weight * itemCount).toFixed(2)
          )
        },
        options: {
          insurance_value: Number(
            (subtotal / 100).toFixed(2)
          ),
          receipt: false,
          own_hand: false
        }
      })
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok || !Array.isArray(data)) {
    console.error(
      "Falha na cotação Melhor Envio:",
      response.status,
      data
    );

    throw new Error(
      "Não foi possível confirmar o frete agora."
    );
  }

  return data.filter(option =>
    option &&
    !option.error &&
    option.id != null &&
    Number.isFinite(
      Number(option.custom_price ?? option.price)
    ) &&
    Number(option.custom_price ?? option.price) >= 0
  );
}

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
      deliveryMethod,
      address,
      shippingServiceId
    } = req.body || {};

    if (!Array.isArray(items) || !items.length) {
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

    let phone = digits(
      customer.phone_number || customer.phone
    );

    if (phone.startsWith("55") && phone.length > 11) {
      phone = phone.slice(2);
    }

    if (phone.length < 10 || phone.length > 11) {
      return res.status(400).json({
        error: "Informe um telefone válido."
      });
    }

    const email = String(
      customer.email || ""
    ).trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        error: "Informe um e-mail válido."
      });
    }

    if (!["shipping", "pickup"].includes(deliveryMethod)) {
      return res.status(400).json({
        error: "Forma de entrega inválida."
      });
    }

    const checkoutItems = [];
    let subtotal = 0;
    let itemCount = 0;

    for (const item of items) {
      if (!item || typeof item !== "object") {
        return res.status(400).json({
          error: "Há itens inválidos no carrinho."
        });
      }

      const rawId = String(item.id || "").trim();

      const id = Object.prototype.hasOwnProperty.call(
        PRODUCTS,
        rawId
      )
        ? rawId
        : PRODUCT_ALIASES[rawId];

      const quantity = Number(
        item.qty ?? item.quantity ?? 1
      );

      if (
        !id ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 20
      ) {
        return res.status(400).json({
          error: "Há produtos ou quantidades inválidos no carrinho."
        });
      }

      subtotal += PRODUCTS[id].price * quantity;
      itemCount += quantity;

      checkoutItems.push({
        quantity,
        price: PRODUCTS[id].price,
        description: PRODUCTS[id].description
      });
    }

    if (deliveryMethod === "shipping") {
      const cep = digits(
        address?.cep || address?.postal_code
      );

      if (!/^\d{8}$/.test(cep)) {
        return res.status(400).json({
          error: "Informe um CEP válido para entrega."
        });
      }

      for (const field of [
        "street",
        "number",
        "neighborhood",
        "city",
        "state"
      ]) {
        if (!String(address?.[field] || "").trim()) {
          return res.status(400).json({
            error: "Complete o endereço de entrega."
          });
        }
      }

      if (
        shippingServiceId === undefined ||
        shippingServiceId === null ||
        String(shippingServiceId).trim() === ""
      ) {
        return res.status(400).json({
          error: "Selecione uma transportadora antes de pagar."
        });
      }

      const quotes = await quoteShipping(
        cep,
        itemCount,
        subtotal
      );

      const chosen = quotes.find(
        option =>
          String(option.id) === String(shippingServiceId)
      );

      if (!chosen) {
        return res.status(400).json({
          error: "A transportadora escolhida não está disponível. Recalcule o frete."
        });
      }

      const quotedPrice = Number(
        chosen.custom_price ?? chosen.price
      );

      const shippingCents =
        subtotal > FREE_SHIPPING_THRESHOLD
          ? 0
          : Math.round(quotedPrice * 100);

      if (shippingCents > 0) {
        checkoutItems.push({
          quantity: 1,
          price: shippingCents,
          description:
            `Frete — ${String(chosen.company?.name || "")} ${String(chosen.name || "")}`
              .trim()
              .slice(0, 120)
        });
      }
    }

    const orderNsu = `mimbox-${crypto.randomUUID()}`;

    const payload = {
      handle: "mimbox",
      order_nsu: orderNsu,
      redirect_url:
        "https://www.mimbox.com.br/pagamento-retorno.html",

      customer: {
        name: customer.name.trim(),
        email,
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

    const data = await response.json().catch(() => ({}));

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
      error: "Não foi possível iniciar o pagamento. Confira a cotação e tente novamente."
    });
  }
}
