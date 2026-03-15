"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface SidebarContextType {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  refreshHistory: () => void;
  historyRefreshKey: number;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const refreshHistory = useCallback(() => setHistoryRefreshKey((k) => k + 1), []);
  return (
    <SidebarContext.Provider value={{ sidebarOpen, setSidebarOpen, refreshHistory, historyRefreshKey }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (ctx === undefined) {
    throw new Error("useSidebar must be used within SidebarProvider");
  }
  return ctx;
}
