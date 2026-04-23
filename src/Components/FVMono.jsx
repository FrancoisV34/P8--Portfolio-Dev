import React from 'react';

export default function FVMono({ size = 32, light = false, variant2 = true }) {
  const fill = light ? 'oklch(0.14 0 0)' : 'oklch(0.97 0 0)';

  if (variant2) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
      >
        <rect
          x="1"
          y="1"
          width="30"
          height="30"
          rx="6"
          stroke={fill}
          strokeWidth="1.5"
          fill="none"
        />
        <text
          x="50%"
          y="57%"
          dominantBaseline="middle"
          textAnchor="middle"
          fontFamily="Inter, -apple-system, sans-serif"
          fontSize="13"
          fontWeight="700"
          fill={fill}
          letterSpacing="-0.5"
        >
          FV
        </text>
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <rect
        width="32"
        height="32"
        rx="7"
        fill={fill}
        fillOpacity={light ? 1 : 0.12}
      />
      <text
        x="50%"
        y="57%"
        dominantBaseline="middle"
        textAnchor="middle"
        fontFamily="Inter, -apple-system, sans-serif"
        fontSize="13"
        fontWeight="700"
        fill={fill}
        letterSpacing="-0.5"
      >
        FV
      </text>
    </svg>
  );
}
