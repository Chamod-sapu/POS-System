import React from 'react';

export interface MoneyProps {
  cents: bigint | number | null | undefined;
  size?: 'sm' | 'md' | 'hero';
  className?: string;
  negativeColor?: boolean;
  prefix?: string;
  sign?: '+' | '-' | 'auto';
}

/**
 * Premium formatted Money component adhering to the Wewala Design System.
 * Renders currency symbol ("Rs.") small and muted, rupees prominent and tabular,
 * and cents lighter in three distinct scale sizes (sm, md, hero).
 */
export const Money: React.FC<MoneyProps> = ({
  cents,
  size = 'md',
  className = '',
  negativeColor = false,
  prefix = 'Rs.',
  sign = 'auto',
}) => {
  if (cents === null || cents === undefined) {
    return <span className={`inline-flex tabular-nums text-slate-400 ${className}`}>—</span>;
  }

  const c = typeof cents === 'bigint' ? cents : BigInt(Math.trunc(cents || 0));
  const isNegative = c < 0n;
  const absCents = isNegative ? -c : c;
  const rupees = (absCents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = (absCents % 100n).toString().padStart(2, '0');

  let displaySign = '';
  if (sign === 'auto') {
    displaySign = isNegative ? '-' : '';
  } else if (sign === '+') {
    displaySign = isNegative ? '-' : '+';
  } else if (sign === '-') {
    displaySign = '-';
  }

  const isColorNegative = negativeColor && isNegative;

  // Scale presets
  const sizeStyles = {
    sm: {
      wrapper: 'text-xs sm:text-sm font-medium',
      prefix: 'text-[10px] font-normal opacity-70 mr-0.5',
      rupees: 'font-semibold',
      cents: 'text-[10px] font-normal opacity-60 ml-0.5',
    },
    md: {
      wrapper: 'text-sm sm:text-base font-semibold',
      prefix: 'text-xs font-normal opacity-75 mr-1',
      rupees: 'font-bold',
      cents: 'text-xs font-medium opacity-65 ml-0.5',
    },
    hero: {
      wrapper: 'text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight',
      prefix: 'text-sm sm:text-base font-medium opacity-70 mr-1.5',
      rupees: 'font-black',
      cents: 'text-base sm:text-lg font-semibold opacity-65 ml-0.5',
    },
  };

  const currentSize = sizeStyles[size];

  return (
    <span
      className={`inline-flex items-baseline tabular-nums select-none ${currentSize.wrapper} ${
        isColorNegative
          ? 'text-rose-600 dark:text-rose-400'
          : ''
      } ${className}`}
      data-testid="money-display"
    >
      {displaySign && <span className="mr-0.5 font-bold">{displaySign}</span>}
      <span className={currentSize.prefix}>{prefix}</span>
      <span className={currentSize.rupees}>{rupees}</span>
      <span className={currentSize.cents}>.{fraction}</span>
    </span>
  );
};

