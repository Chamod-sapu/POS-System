import React from 'react';

// Code 128 pattern dictionary for values 0..106
const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
];

const START_CODE_B = 104;
const STOP_CODE = 106;

/**
 * Encodes ASCII string into Code 128 (Subset B) boolean modules.
 * Returns an array of booleans where true = bar (black) and false = space (white).
 */
export function encodeCode128BModules(text: string): boolean[] {
  const codes: number[] = [START_CODE_B];
  let checksum = START_CODE_B;

  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    // ASCII range 32 to 127
    const val = charCode >= 32 && charCode <= 127 ? charCode - 32 : 0;
    codes.push(val);
    checksum += val * (i + 1);
  }

  codes.push(checksum % 103);
  codes.push(STOP_CODE);

  const modules: boolean[] = [];

  for (const code of codes) {
    const pattern = CODE128_PATTERNS[code];
    if (!pattern) continue;

    let isBar = true;
    for (let j = 0; j < pattern.length; j++) {
      const width = parseInt(pattern[j] ?? '1', 10);
      for (let k = 0; k < width; k++) {
        modules.push(isBar);
      }
      isBar = !isBar;
    }
  }

  return modules;
}

/**
 * Generates raw SVG markup string for a Code 128 barcode.
 */
export function generateCode128Svg(
  text: string,
  options?: {
    height?: number;
    barWidth?: number;
    quietZone?: number;
    showText?: boolean;
  }
): string {
  const height = options?.height ?? 40;
  const barWidth = options?.barWidth ?? 1.5;
  const quietZone = options?.quietZone ?? 10;
  const showText = options?.showText ?? true;

  const modules = encodeCode128BModules(text);
  const totalBarWidth = modules.length * barWidth;
  const totalWidth = totalBarWidth + quietZone * 2;
  const totalHeight = showText ? height + 14 : height;

  let rects = '';
  let inBar = false;
  let barStart = 0;

  for (let i = 0; i < modules.length; i++) {
    const isBar = modules[i];
    if (isBar && !inBar) {
      inBar = true;
      barStart = i;
    } else if (!isBar && inBar) {
      inBar = false;
      const x = quietZone + barStart * barWidth;
      const w = (i - barStart) * barWidth;
      rects += `<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${height}" fill="#000000" />`;
    }
  }

  if (inBar) {
    const x = quietZone + barStart * barWidth;
    const w = (modules.length - barStart) * barWidth;
    rects += `<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${height}" fill="#000000" />`;
  }

  const textElement = showText
    ? `<text x="${(totalWidth / 2).toFixed(2)}" y="${(height + 11).toFixed(2)}" text-anchor="middle" font-family="monospace" font-size="10" font-weight="bold" fill="#000000">${text}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth.toFixed(2)} ${totalHeight}" width="${totalWidth.toFixed(2)}" height="${totalHeight}" style="display:block;margin:0 auto;">${rects}${textElement}</svg>`;
}

export interface Code128BarcodeProps {
  value: string;
  height?: number;
  barWidth?: number;
  showText?: boolean;
  className?: string;
}

export const Code128Barcode: React.FC<Code128BarcodeProps> = ({
  value,
  height = 40,
  barWidth = 1.5,
  showText = true,
  className = '',
}) => {
  const quietZone = 10;
  const modules = React.useMemo(() => encodeCode128BModules(value), [value]);
  const totalBarWidth = modules.length * barWidth;
  const totalWidth = totalBarWidth + quietZone * 2;
  const totalHeight = showText ? height + 14 : height;

  const rects = React.useMemo(() => {
    const list: { x: number; w: number }[] = [];
    let inBar = false;
    let barStart = 0;

    for (let i = 0; i < modules.length; i++) {
      const isBar = modules[i];
      if (isBar && !inBar) {
        inBar = true;
        barStart = i;
      } else if (!isBar && inBar) {
        inBar = false;
        list.push({
          x: quietZone + barStart * barWidth,
          w: (i - barStart) * barWidth,
        });
      }
    }

    if (inBar) {
      list.push({
        x: quietZone + barStart * barWidth,
        w: (modules.length - barStart) * barWidth,
      });
    }

    return list;
  }, [modules, barWidth]);

  return (
    <div className={`flex flex-col items-center justify-center my-1 ${className}`}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${totalWidth.toFixed(2)} ${totalHeight}`}
        width={totalWidth}
        height={totalHeight}
        style={{ display: 'block', margin: '0 auto' }}
      >
        {rects.map((r, idx) => (
          <rect
            key={idx}
            x={r.x.toFixed(2)}
            y="0"
            width={r.w.toFixed(2)}
            height={height}
            fill="#000000"
          />
        ))}
        {showText && (
          <text
            x={(totalWidth / 2).toFixed(2)}
            y={(height + 11).toFixed(2)}
            textAnchor="middle"
            fontFamily="monospace"
            fontSize="10"
            fontWeight="bold"
            fill="#000000"
          >
            {value}
          </text>
        )}
      </svg>
    </div>
  );
};

