import React from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { RamGuard } from "@/components/RamGuard";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <TopBar />
        <RamGuard />
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
