import React from "react";

interface LogoProps {
  size?: number;
  className?: string;
  showWordmark?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ size = 32, className = "", showWordmark = false }) => {
  return (
    <div className={`logo-container ${className}`} style={{ display: "inline-flex", alignItems: "center", gap: "10px" }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 256 256"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0, filter: "drop-shadow(0 2px 8px rgba(99,102,241,0.25))" }}
      >
        <defs>
          <linearGradient id="logoBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0e131f" />
            <stop offset="50%" stopColor="#0a0d16" />
            <stop offset="100%" stopColor="#05070b" />
          </linearGradient>

          <linearGradient id="logoBorderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.6" />
            <stop offset="50%" stopColor="#6366f1" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#a855f7" stopOpacity="0.6" />
          </linearGradient>

          <linearGradient id="logoNovaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="45%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>

          <radialGradient id="logoCoreGlow" cx="50%" cy="38%" r="45%">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.45" />
            <stop offset="50%" stopColor="#818cf8" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect x="10" y="10" width="236" height="236" rx="52" fill="url(#logoBgGrad)" stroke="url(#logoBorderGrad)" strokeWidth="3" />
        <circle cx="128" cy="115" r="85" fill="url(#logoCoreGlow)" />

        {/* Frequency Stem Arcs */}
        <path d="M 66 84 C 92 84 102 72 128 72 C 154 72 164 84 190 84" stroke="#a78bfa" strokeWidth="5" strokeLinecap="round" opacity="0.9" />
        <path d="M 52 108 C 84 108 98 94 128 94 C 158 94 172 108 204 108" stroke="#f87171" strokeWidth="5.5" strokeLinecap="round" opacity="0.95" />
        <path d="M 60 132 C 88 132 104 118 128 118 C 152 118 168 132 196 132" stroke="#38bdf8" strokeWidth="6" strokeLinecap="round" opacity="0.95" />
        <path d="M 74 156 C 96 156 110 144 128 144 C 146 144 160 156 182 156" stroke="#34d399" strokeWidth="5" strokeLinecap="round" opacity="0.9" />

        {/* Download Arrow Body */}
        <path d="M 128 206 L 82 142 H 108 V 64 H 148 V 142 H 174 Z" fill="url(#logoNovaGrad)" stroke="#ffffff" strokeOpacity="0.3" strokeWidth="2" strokeLinejoin="round" />
        
        {/* Nova Star Core */}
        <path d="M 128 88 Q 128 114 146 114 Q 128 114 128 140 Q 128 114 110 114 Q 128 114 128 88 Z" fill="#ffffff" />
        <circle cx="128" cy="114" r="4" fill="#ffffff" />
      </svg>

      {showWordmark && (
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <span style={{ fontSize: "16px", fontWeight: 700, letterSpacing: "-0.02em", color: "#f8fafc" }}>NOVA</span>
            <span style={{ fontSize: "16px", fontWeight: 800, letterSpacing: "-0.01em", background: "linear-gradient(135deg, #38bdf8, #818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>DL</span>
          </div>
          <span style={{ fontSize: "9px", fontWeight: 600, letterSpacing: "0.08em", color: "#64748b", textTransform: "uppercase", marginTop: "2px" }}>
            Studio &bull; Stems
          </span>
        </div>
      )}
    </div>
  );
};
