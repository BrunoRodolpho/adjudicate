import { KillSwitchPanel } from "@/components/control/KillSwitchPanel";

export default function ControlPage() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between border-b border-edge pb-3">
        <h1 className="text-[10px] uppercase tracking-section text-muted">
          Control · Emergency Kill Switch
        </h1>
        <span className="text-[10px] uppercase tracking-wider text-faint">
          Global scope
        </span>
      </header>
      <KillSwitchPanel />
    </div>
  );
}
