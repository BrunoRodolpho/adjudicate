"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";

/**
 * Secondary hero action — demotes the cinematic Remotion film to an opt-in
 * modal ("Watch the constitutional flow") so the live KernelTrace stays the
 * primary, interactive centerpiece. The video is the checked-in render.
 */
export function WatchFlowModal() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 font-mono text-[13px] text-console-muted transition-colors hover:text-console-ink focus-ring-console"
      >
        <Play size={13} aria-hidden="true" /> Watch the constitutional flow
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        label="The constitutional flow"
        className="bg-console-canvas/95 backdrop-blur"
      >
        <div className="flex h-full w-full items-center justify-center p-6">
          <div className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-console-edge shadow-2xl">
            <video
              autoPlay
              loop
              muted
              playsInline
              controls
              poster="/hero-kernel-poster.jpg"
              className="w-full bg-console-canvas"
            >
              <source src="/hero-kernel.mp4" type="video/mp4" />
              <source src="/hero-kernel.webm" type="video/webm" />
            </video>
          </div>
        </div>
      </Dialog>
    </>
  );
}
