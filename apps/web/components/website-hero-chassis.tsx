"use client";

import { useId } from "react";
import { prefersReducedMotion } from "../lib/motion";

interface Props {
  url?: string;
  active?: boolean;
}

/**
 * WebsiteHeroChassis — The central physical product hero from the Stitch Remix.
 *
 * In A11yForge, the website is the single physical hardware object evaluated
 * inside a dark luxury showroom. Front-facing, recognizable, zero arbitrary
 * floating or unmotivated 3D spin. Shows a real browser HUD with the target
 * address, traffic lights, and clean web layout.
 */
export function WebsiteHeroChassis({ url = "", active = false }: Props): React.JSX.Element {
  const displayUrl = url.trim() !== "" ? url.trim() : "https://yourwebsite.com";
  const reducedMotion = prefersReducedMotion();
  const chassisId = useId();

  return (
    <div
      className="relative w-full max-w-[760px] aspect-[16/11] rounded-xl bg-[#111113] shadow-2xl transition-all duration-700 ease-out select-none"
      id={`chassis-${chassisId}`}
      style={{
        transform: reducedMotion
          ? "none"
          : "perspective(1400px) rotateY(-4deg) rotateX(3deg) scale(0.98)",
        transformStyle: "preserve-3d",
      }}
      aria-label="Inspection preview viewport"
      role="img"
    >
      {/* Specular Optical Reflection Top Lip */}
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent z-30" />

      {/* Outer Machined Chassis Frame */}
      <div className="w-full h-full flex flex-col rounded-xl overflow-hidden bg-[#18181b]/95 backdrop-blur-2xl border border-white/10 shadow-2xl">
        {/* Browser HUD Header */}
        <div className="h-10 px-4 bg-[#111113]/95 flex items-center justify-between shrink-0 z-20 border-b border-white/5">
          <div className="flex items-center gap-2 min-w-0">
            {/* Traffic-light window controls */}
            <div className="flex gap-1.5 items-center shrink-0" aria-hidden="true">
              <div className="w-2.5 h-2.5 rounded-full bg-[#353436]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#353436]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#353436]" />
            </div>
            <div className="mx-2 h-3.5 w-[1px] bg-white/10 shrink-0" />
            {/* Address Bar */}
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-[#0b0b0c]/80 text-[#7e7d7a] font-mono text-[11px] truncate max-w-[320px]">
              <span className="text-[#27ae60]" aria-hidden="true">🔒</span>
              <span className="text-[#f5f4f0] font-medium truncate">{displayUrl}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-[#222226] text-[#e5a93c] font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#e5a93c] animate-pulse" />
              {active ? "READY TO CHECK" : "INSPECTION STANDBY"}
            </span>
          </div>
        </div>

        {/* Website Canvas Surface */}
        <div className="relative flex-1 bg-[#0b0b0c] overflow-hidden flex flex-col p-6">
          {/* Subtle architectural grid representing the inspected surface */}
          <div
            className="absolute inset-0 bg-[linear-gradient(to_right,#18181b_1px,transparent_1px),linear-gradient(to_bottom,#18181b_1px,transparent_1px)] bg-[size:24px_24px] opacity-30 pointer-events-none"
            aria-hidden="true"
          />

          {/* Active scan sweep line when active */}
          {active && (
            <div
              className="absolute left-0 right-0 h-[2px] bg-[#e5a93c] shadow-[0_0_16px_2px_rgba(229,169,60,0.6)] z-30 transition-all pointer-events-none"
              style={{
                top: "35%",
                animation: reducedMotion ? "none" : "scanSweep 3s ease-in-out infinite alternate",
              }}
              aria-hidden="true"
            />
          )}

          {/* Simulated Webpage Layout */}
          <div className="relative z-10 flex flex-col h-full justify-between">
            {/* Nav */}
            <div className="flex items-center justify-between pb-4 border-b border-white/5">
              <div className="flex items-center gap-3">
                <span className="font-serif text-lg tracking-tight text-[#f5f4f0] font-medium">ATELIER NOIR</span>
                <span className="hidden sm:inline text-xs text-[#7e7d7a]">• Spatial Design</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-[#7e7d7a]">
                <span>Objects</span>
                <span>Editions</span>
                <span className="px-2 py-0.5 rounded bg-[#18181b] text-[#f5f4f0]">Cart (0)</span>
              </div>
            </div>

            {/* Hero Body */}
            <div className="grid grid-cols-12 gap-4 py-4 my-auto items-center">
              <div className="col-span-7 flex flex-col gap-2">
                <span className="text-[10px] uppercase font-mono tracking-widest text-[#e5a93c]">New Collection</span>
                <h3 className="font-serif text-xl sm:text-2xl text-[#f5f4f0] leading-tight">
                  Precision Forms & Monoliths
                </h3>
                <p className="text-xs text-[#7e7d7a] line-clamp-2">
                  Cast concrete and black titanium artifacts engineered for architectural spaces.
                </p>
                <div className="flex items-center gap-2 pt-2">
                  <div className="h-7 px-3 rounded bg-white text-[#0b0b0c] text-xs font-medium flex items-center">
                    Explore Edition
                  </div>
                  {/* Highlighted defective element demonstration */}
                  <div className="relative">
                    <div className="h-7 w-7 rounded bg-[#222226] border border-[#eb5757]/60 flex items-center justify-center text-xs text-[#f5f4f0]">
                      ★
                    </div>
                    {/* Plain English defect tag */}
                    <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap px-1.5 py-0.5 rounded bg-[#eb5757] text-[#f5f4f0] text-[9px] font-mono tracking-wider font-semibold">
                      NO NAME
                    </span>
                  </div>
                </div>
              </div>

              {/* Product preview box */}
              <div className="col-span-5 h-28 rounded-lg bg-[#18181b] border border-white/5 flex items-center justify-center relative overflow-hidden">
                <div className="w-16 h-16 rounded bg-[#222226] transform rotate-12 border border-white/10 shadow-lg" />
                <span className="absolute bottom-1 right-2 text-[9px] font-mono text-[#7e7d7a]">OBJECT 01</span>
              </div>
            </div>

            {/* Footer telemetry */}
            <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[10px] font-mono text-[#7e7d7a]">
              <span>STATUS: REAL BROWSER READY</span>
              <span>TEST ENGINE: CHROMIUM</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
