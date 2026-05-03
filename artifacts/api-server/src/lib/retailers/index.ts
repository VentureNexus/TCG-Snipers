import type { RetailerContext, RetailerResult } from "./types";
import { runTarget } from "./target";
import { runAmazon } from "./amazon";
import { runBestBuy } from "./bestbuy";
import { runCostco } from "./costco";
import { runPokemonCenter } from "./pokemoncenter";

type RetailerRunner = (ctx: RetailerContext) => Promise<RetailerResult>;

const RETAILER_MAP: Record<string, RetailerRunner> = {
  Target: runTarget,
  Amazon: runAmazon,
  "Best Buy": runBestBuy,
  Costco: runCostco,
  "Pokemon Center": runPokemonCenter,
};

export async function dispatchRetailer(ctx: RetailerContext): Promise<RetailerResult> {
  const runner = RETAILER_MAP[ctx.task.retailer];
  if (!runner) {
    return {
      success: false,
      productName: ctx.task.productUrl || ctx.task.productKeywords || "Unknown",
      productImage: "",
      price: null,
      orderNumber: "",
      errorMessage: `Unsupported retailer: ${ctx.task.retailer}`,
    };
  }
  return runner(ctx);
}

export type { RetailerContext, RetailerResult } from "./types";
