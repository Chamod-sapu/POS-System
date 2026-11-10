import React from 'react';

/**
 * Pure TypeScript Code 128 (Subset B) Barcode Encoder
 * Generates sharp, scalable SVG barcodes without any external dependencies.
 */

// Code 128 pattern table for symbols 0 to 106 (widths of alternating bars & spaces)
const CODE128_PATTERNS: string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', // 0-9
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', // 10-19
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', // 20-29
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', // 30-39
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', // 40-49
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', // 50-59
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', // 60-69
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', // 70-79
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', // 80-89
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', // 90-99
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112', // 100-106 (104=Start B, 106=Stop)
];

const START_B_INDEX = 104;
const STOP_INDEX = 106;

/**
 * Encodes ASCII string into a boolean array of modules (true = black bar, false = white space)
 */
export function encodeCode128B(text: string): boolean[] {
  if (!text || text.length === 0) return [];

  const symbols: number[] = [START_B_INDEX];
  let checksum = START_B_INDEX;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // Code 128B maps ASCII 32..127 to symbol 0..95
    const symbol = code >= 32 && code <= 127 ? code - 32 : 0;
    symbols.push(symbol);
    checksum += symbol * (i + 1);
  }

  const checkSymbol = checksum % 103;
  symbols.push(checkSymbol);
  symbols.push(STOP_INDEX);

  // Convert symbol widths into boolean modules
  const modules: boolean[] = [];

  // Quiet zone: 10 blank modules
  for (let q = 0; q < 10; q++) modules.push(false);

  for (const sym of symbols) {
    const pattern = CODE128_PATTERNS[sym] || '';
    let isBar = true;
    for (let p = 0; p < pattern.length; p++) {
      const width = parseInt(pattern[p] || '1', 10);
      for (let w = 0; w < width; w++) {
        modules.push(isBar);
      }
      isBar = !isBar;
    }
  }

  // Final termination bar (2 modules black) for stop character
  modules.push(true);
  modules.push(true);

  // Quiet zone: 10 blank modules
  for (let q = 0; q < 10; q++) modules.push(false);

  return modules;
}

export interface Barcode128Props {
  value: string;
  height?: number;
  barWidth?: number;
  showText?: boolean;
  className?: string;
}

/**
 * React SVG Component for rendering high-precision Code128 barcodes.
 */
export const Barcode128: React.FC<Barcode128Props> = ({
  value,
  height = 50,
  barWidth = 1.5,
  showText = true,
  className = '',
}) => {
  if (!value || value.trim() === '') {
    return null;
  }

  const modules = encodeCode128B(value.trim());
  const totalWidth = modules.length * barWidth;

  // Group contiguous black bars into rects for compact SVG DOM
  const rects: { x: number; width: number }[] = [];
  let currentStart: number | null = null;

  for (let i = 0; i < modules.length; i++) {
    if (modules[i]) {
      if (currentStart === null) currentStart = i;
    } else {
      if (currentStart !== null) {
        rects.push({
          x: currentStart * barWidth,
          width: (i - currentStart) * barWidth,
        });
        currentStart = null;
      }
    }
  }

  if (currentStart !== null) {
    rects.push({
      x: currentStart * barWidth,
      width: (modules.length - currentStart) * barWidth,
    });
  }

  const svgHeight = showText ? height + 16 : height;

  return (
    <div className={`inline-flex flex-col items-center select-none ${className}`}>
      <svg
        width={totalWidth}
        height={svgHeight}
        viewBox={`0 0 ${totalWidth} ${svgHeight}`}
        xmlns="http://www.w3.org/2000/svg"
        className="shape-rendering-crispEdges"
      >
        <rect width={totalWidth} height={svgHeight} fill="#ffffff" />
        {rects.map((r, idx) => (
          <rect key={idx} x={r.x} y={0} width={r.width} height={height} fill="#000000" />
        ))}
        {showText && (
          <text
            x={totalWidth / 2}
            y={height + 13}
            textAnchor="middle"
            fill="#1e293b"
            fontSize="11"
            fontFamily="monospace"
            fontWeight="bold"
            letterSpacing="1"
          >
            {value}
          </text>
        )}
      </svg>
    </div>
  );
};
