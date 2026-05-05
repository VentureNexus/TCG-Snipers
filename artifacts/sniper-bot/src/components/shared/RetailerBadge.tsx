import { SiTarget } from "react-icons/si";
import { ShoppingBag, ShoppingCart, Package, Star } from "lucide-react";

export function RetailerBadge({ retailer }: { retailer: string }) {
  const getBadgeStyle = () => {
    switch (retailer.toLowerCase()) {
      case "target":
        return { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/20", icon: <SiTarget className="w-3 h-3" /> };
      case "amazon":
        return { bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/20", icon: <ShoppingCart className="w-3 h-3" /> };
      case "best buy":
      case "bestbuy":
        return { bg: "bg-yellow-400/10", text: "text-yellow-300", border: "border-yellow-400/20", icon: <ShoppingBag className="w-3 h-3" /> };
      case "costco":
        return { bg: "bg-sky-500/10", text: "text-sky-400", border: "border-sky-500/20", icon: <Package className="w-3 h-3" /> };
      case "sam's club":
      case "samsclub":
        return { bg: "bg-blue-600/10", text: "text-blue-400", border: "border-blue-600/20", icon: <ShoppingBag className="w-3 h-3" /> };
      case "walmart":
        return { bg: "bg-blue-400/10", text: "text-blue-300", border: "border-blue-400/20", icon: <ShoppingCart className="w-3 h-3" /> };
      case "pokemon center":
      case "pokemon":
        return { bg: "bg-yellow-500/10", text: "text-yellow-400", border: "border-yellow-500/20", icon: <Star className="w-3 h-3" /> };
      default:
        return { bg: "bg-muted/40", text: "text-muted-foreground", border: "border-border", icon: null };
    }
  };

  const style = getBadgeStyle();

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border ${style.bg} ${style.text} ${style.border}`}
    >
      {style.icon}
      <span>{retailer}</span>
    </div>
  );
}
