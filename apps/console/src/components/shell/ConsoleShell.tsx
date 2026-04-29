import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-screen grid-rows-[auto_1fr] bg-canvas text-ink">
      <TopBar />
      <div className="grid grid-cols-[220px_1fr] overflow-hidden">
        <Sidebar />
        <main className="overflow-auto">{children}</main>
      </div>
    </div>
  );
}
