import { Check, Palette } from "lucide-react";
import { useTheme, type ThemeId } from "@/lib/theme";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function CustomizationPage() {
  const { themeId, themes, setTheme, theme } = useTheme();

  return (
    <div className="p-6 max-w-5xl space-y-6" data-testid="page-customization">
      <div className="flex items-center gap-3">
        <Palette className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">App Customization</h1>
          <p className="text-sm text-muted-foreground">
            Pick a starter to change the app's logo and accent color.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {themes.map((t) => {
          const isActive = t.id === themeId;
          return (
            <Card
              key={t.id}
              className={`relative p-5 flex flex-col items-center text-center gap-4 cursor-pointer transition-all hover-elevate ${
                isActive ? "ring-2 ring-primary border-primary/40" : ""
              }`}
              onClick={() => setTheme(t.id as ThemeId)}
              data-testid={`card-theme-${t.id}`}
            >
              {isActive && (
                <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                  <Check className="w-4 h-4" />
                </div>
              )}
              <div className="h-32 w-full flex items-center justify-center">
                <img
                  src={t.logo}
                  alt={`${t.label} logo`}
                  className="max-h-32 object-contain"
                />
              </div>
              <div className="space-y-1">
                <div className="font-semibold text-base">{t.label}</div>
                <div className="text-xs text-muted-foreground leading-snug">
                  {t.description}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="w-5 h-5 rounded-full border border-border"
                  style={{ backgroundColor: t.swatchHex }}
                  aria-hidden
                />
                <span className="text-xs font-mono text-muted-foreground">
                  {t.swatchHex.toUpperCase()}
                </span>
              </div>
              <Button
                variant={isActive ? "default" : "outline"}
                size="sm"
                className="w-full"
                onClick={(e) => {
                  e.stopPropagation();
                  setTheme(t.id as ThemeId);
                }}
                data-testid={`button-apply-${t.id}`}
              >
                {isActive ? "Active" : "Apply"}
              </Button>
            </Card>
          );
        })}
      </div>

      <Card className="p-5 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Live preview
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary button</Button>
          <Button variant="outline">Outline button</Button>
          <span className="status-monitoring px-2 py-1 rounded text-xs font-mono">
            MONITORING
          </span>
          <span className="text-primary font-mono text-sm">
            Currently using: {theme.label}
          </span>
        </div>
      </Card>
    </div>
  );
}
