import { SkipLink } from "@/components/a11y";
import { FailureBanners } from "./FailureBanners";
import { LiveTailProvider } from "./LiveTailContext";
import { LiveTailAnnouncer } from "./LiveTailAnnouncer";
import { ShellBody } from "./ShellBody";
import { TopBar } from "./TopBar";

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  return (
    <LiveTailProvider>
      {/* First focusable element — lets keyboard users bypass nav to the main landmark. */}
      <SkipLink />
      <div className="grid h-screen grid-rows-[auto_auto_1fr] bg-canvas text-ink">
        <TopBar />
        <FailureBanners />
        <ShellBody>{children}</ShellBody>
      </div>
      {/* Visually-hidden polite aria-live region for live-tail announcements. */}
      <LiveTailAnnouncer />
    </LiveTailProvider>
  );
}
