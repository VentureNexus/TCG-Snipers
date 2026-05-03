export interface CheckoutSuccessPayload {
  retailer: string;
  productName: string;
  price: string;
  orderNumber: string;
  profileNickname: string;
  webhookUrl: string;
}

export interface CheckoutFailurePayload {
  retailer: string;
  productName: string;
  errorMessage: string;
  retryCount: number;
  profileNickname: string;
  webhookUrl: string;
}

export async function notifySuccess(payload: CheckoutSuccessPayload): Promise<void> {
  if (!payload.webhookUrl) return;
  const body = {
    embeds: [
      {
        title: "✅ Checkout Successful",
        color: 0x22c55e,
        fields: [
          { name: "Retailer", value: payload.retailer, inline: true },
          { name: "Product", value: payload.productName, inline: false },
          { name: "Price", value: payload.price === "N/A" ? "N/A" : `$${payload.price}`, inline: true },
          { name: "Order #", value: payload.orderNumber, inline: true },
          { name: "Profile", value: payload.profileNickname, inline: true },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  };
  const res = await fetch(payload.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Discord webhook responded with ${res.status} ${res.statusText}`);
  }
}

export async function notifyFailure(payload: CheckoutFailurePayload): Promise<void> {
  if (!payload.webhookUrl) return;
  const body = {
    embeds: [
      {
        title: "❌ Checkout Failed",
        color: 0xef4444,
        fields: [
          { name: "Retailer", value: payload.retailer, inline: true },
          { name: "Product", value: payload.productName, inline: false },
          { name: "Error", value: payload.errorMessage, inline: false },
          { name: "Retries", value: String(payload.retryCount), inline: true },
          { name: "Profile", value: payload.profileNickname, inline: true },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  };
  const res = await fetch(payload.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Discord webhook responded with ${res.status} ${res.statusText}`);
  }
}
