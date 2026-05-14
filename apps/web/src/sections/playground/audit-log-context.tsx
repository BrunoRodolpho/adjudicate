"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { AuditLogEntry } from "./AuditLog";

interface AuditLogCtx {
  readonly entries: ReadonlyArray<AuditLogEntry>;
  readonly push: (entry: AuditLogEntry) => void;
  readonly clear: () => void;
}

const Ctx = createContext<AuditLogCtx | null>(null);

export function AuditLogProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<ReadonlyArray<AuditLogEntry>>([]);
  const push = useCallback((entry: AuditLogEntry) => {
    setEntries((prev) => [entry, ...prev].slice(0, 50));
  }, []);
  const clear = useCallback(() => setEntries([]), []);
  return <Ctx.Provider value={{ entries, push, clear }}>{children}</Ctx.Provider>;
}

export function useAuditLog(): AuditLogCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuditLog must be used inside <AuditLogProvider>");
  return v;
}
