import React from "react";

interface LogoProps {
  size?: number;
  className?: string;
  showWordmark?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ size = 30, className = "", showWordmark = false }) => {
  return (
    <div className={`logo-container ${className}`} style={{ display: "inline-flex", alignItems: "center", gap: "10px" }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 256 256"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="NovaDL Logo"
        style={{ flexShrink: 0, filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.5))" }}
      >
        <defs>
          <linearGradient id="logoBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#141517" />
            <stop offset="100%" stopColor="#07080a" />
          </linearGradient>

          <linearGradient id="logoBorderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#34343a" />
            <stop offset="100%" stopColor="#23252a" />
          </linearGradient>

          <linearGradient id="logoNovaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#5e6ad2" />
            <stop offset="100%" stopColor="#434da3" />
          </linearGradient>
        </defs>

        <rect
          x="10"
          y="10"
          width="236"
          height="236"
          rx="52"
          fill="url(#logoBgGrad)"
          stroke="url(#logoBorderGrad)"
          strokeWidth="3"
        />

        {/* Precision Frequency Stem Arcs */}
        <path d="M 66 84 C 92 84 102 72 128 72 C 154 72 164 84 190 84" stroke="#a78bfa" strokeWidth="5" strokeLinecap="round" opacity="0.9" />
        <path d="M 52 108 C 84 108 98 94 128 94 C 158 94 172 108 204 108" stroke="#f87171" strokeWidth="5.5" strokeLinecap="round" opacity="0.95" />
        <path d="M 60 132 C 88 132 104 118 128 118 C 152 118 168 132 196 132" stroke="#38bdf8" strokeWidth="6" strokeLinecap="round" opacity="0.95" />
        <path d="M 74 156 C 96 156 110 144 128 144 C 146 144 160 156 182 156" stroke="#34d399" strokeWidth="5" strokeLinecap="round" opacity="0.9" />

        {/* Download Arrow Geometry */}
        <path
          d="M 128 206 L 82 142 H 108 V 64 H 148 V 142 H 174 Z"
          fill="url(#logoNovaGrad)"
          stroke="#ffffff"
          strokeOpacity="0.25"
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {/* Center Star Core */}
        <path d="M 128 88 Q 128 114 146 114 Q 128 114 128 140 Q 128 114 110 114 Q 128 114 128 88 Z" fill="#ffffff" />
        <circle cx="128" cy="114" r="4" fill="#ffffff" />
      </svg>

      {showWordmark && (
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ fontSize: "15px", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-ink)" }}>
              NOVA
            </span>
            <span style={{ fontSize: "15px", fontWeight: 700, letterSpacing: "-0.01em", color: "var(--accent-primary)" }}>
              DL
            </span>
          </div>
          <span style={{ fontSize: "9px", fontWeight: 600, letterSpacing: "0.06em", color: "var(--text-subtle)", textTransform: "uppercase", marginTop: "2px" }}>
            Studio &bull; Stems
          </span>
        </div>
      )}
    </div>
  );
};
