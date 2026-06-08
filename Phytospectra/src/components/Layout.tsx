import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";

export function Layout({
  children,
  wsConnected,
  dbConnected,
  wsUrl,
}: {
  children: ReactNode;
  wsConnected: boolean;
  dbConnected: boolean;
  wsUrl: string;
}) {
  return (
    <div className="flex min-h-screen w-full bg-background">
      <Sidebar wsUrl={wsUrl} wsConnected={wsConnected} dbConnected={dbConnected} />
      <main className="flex-1 p-4 md:p-6 overflow-x-hidden">{children}</main>
    </div>
  );
}