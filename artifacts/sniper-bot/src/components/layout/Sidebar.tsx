import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { Home, ListChecks, Layers, User, Globe, BarChart2, Settings, Menu, HelpCircle, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";

export function Sidebar() {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const { theme } = useTheme();

  const navItems = [
    { href: "/", label: "Dashboard", icon: Home },
    { href: "/tasks", label: "Tasks", icon: ListChecks },
    { href: "/task-groups", label: "Task Groups", icon: Layers },
    { href: "/profiles", label: "Profiles", icon: User },
    { href: "/proxies", label: "Proxies", icon: Globe },
    { href: "/analytics", label: "Analytics", icon: BarChart2 },
    { href: "/customization", label: "Customization", icon: Palette },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className={`flex flex-col h-full bg-sidebar border-r border-sidebar-border transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'}`}>
      <div className="flex items-center justify-center p-2 border-b border-sidebar-border h-16">
        <img
          src={theme.logo}
          alt="TCG Snipers"
          className={collapsed ? "h-12 w-auto object-contain" : "h-14 w-auto object-contain"}
          style={{ aspectRatio: "832 / 1248" }}
          data-testid="img-sidebar-logo"
        />
      </div>
      
      <div className="p-2 border-b border-sidebar-border flex justify-center">
        <Button variant="ghost" size="icon" onClick={() => setCollapsed(!collapsed)} data-testid="button-toggle-sidebar" className="w-full">
          <Menu className="w-4 h-4" />
        </Button>
      </div>

      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${isActive ? 'bg-primary/10 text-primary' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'} ${collapsed ? 'justify-center' : ''}`} data-testid={`link-sidebar-${item.label.toLowerCase().replace(' ', '-')}`}>
              <item.icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border flex flex-col gap-2">
        <Link href="/support" className={`flex items-center gap-3 text-muted-foreground hover:text-foreground transition-colors ${collapsed ? 'justify-center' : ''}`}>
          <HelpCircle className="w-5 h-5" />
          {!collapsed && <span className="text-sm">Support</span>}
        </Link>
        {!collapsed && <div className="text-xs text-muted-foreground/50 font-mono mt-2">v1.0.5</div>}
      </div>
    </div>
  );
}
