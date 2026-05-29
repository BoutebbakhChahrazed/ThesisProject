import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";

export function Layout({ children, wsConnected, dbConnected }: { children: ReactNode; wsConnected: boolean; dbConnected: boolean }) {
  return (
    <div className="flex min-h-screen w-full bg-background">
      <Sidebar wsConnected={wsConnected} dbConnected={dbConnected} />
      <main className="flex-1 p-4 md:p-6 overflow-x-hidden">{children}</main>
    </div>
  );
}