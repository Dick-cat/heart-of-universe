interface HeartClawLogoProps {
  className?: string;
  size?: number;
}

export function HeartClawLogo({ className = '', size = 32 }: HeartClawLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect width="64" height="64" rx="6" fill="#050505" />
      {/* Black claw silhouette */}
      <path
        d="M32 8 L38 18 L48 12 L44 26 L52 36 L40 44 L32 38 L24 44 L12 36 L20 26 L16 12 L26 18 Z"
        fill="#0a0a0a"
        stroke="#262626"
        strokeWidth="1"
        strokeLinejoin="miter"
      />
      {/* Crimson heart */}
      <path
        d="M32 22 L36 17 L42 20 L44 26 L32 42 L20 26 L22 20 L28 17 Z"
        fill="#dc2626"
      />
      {/* Heart core highlight */}
      <path
        d="M32 26 L34 23 L38 25 L39 28 L32 37 L25 28 L26 25 L30 23 Z"
        fill="#ef4444"
      />
      {/* Gold accent tip */}
      <path d="M32 42 L35 47 L32 49 L29 47 Z" fill="#facc15" />
    </svg>
  );
}
