import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { AlertBell } from "./AlertBell";
import { StressAlertMessage } from "@/hooks/useWebSocket";

export function Layout({
  children, wsConnected, dbConnected, wsUrl,
  lastAlert, unreadAlerts, clearUnread,
}: {
  children: ReactNode;
  wsConnected: boolean;
  dbConnected: boolean;
  wsUrl: string;
  lastAlert: StressAlertMessage | null;
  unreadAlerts: number;
  clearUnread: () => void;
}) {
  return (
    <div className="flex min-h-screen w-full bg-background">
      <Sidebar wsUrl={wsUrl} wsConnected={wsConnected} dbConnected={dbConnected} />
      <div className="flex-1 flex flex-col overflow-x-hidden">
        <header className="h-14 shrink-0 border-b border-border/40 bg-background/80 backdrop-blur-sm px-4 flex items-center justify-end sticky top-0 z-30">
          <AlertBell
            lastAlert={lastAlert}
            unreadAlerts={unreadAlerts}
            clearUnread={clearUnread}
          />
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}