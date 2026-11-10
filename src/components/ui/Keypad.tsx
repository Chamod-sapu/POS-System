import React from 'react';
import { Delete } from 'lucide-react';

export interface KeypadProps {
  onKeyPress: (key: string) => void;
  onClear?: () => void;
  onBackspace?: () => void;
  showDecimal?: boolean;
  showDoubleZero?: boolean;
  className?: string;
  disabled?: boolean;
}

/**
 * High-speed tactile numeric keypad for cashier touch-screens.
 */
export const Keypad: React.FC<KeypadProps> = ({
  onKeyPress,
  onClear,
  onBackspace,
  showDecimal = true,
  showDoubleZero = true,
  className = '',
  disabled = false,
}) => {
  const handleKeyClick = (key: string) => {
    if (disabled) return;
    if (key === 'clear') {
      onClear?.();
    } else if (key === 'backspace') {
      onBackspace?.();
    } else {
      onKeyPress(key);
    }
  };

  const keys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    [
      showDecimal ? '.' : 'clear',
      '0',
      showDoubleZero ? '00' : 'backspace',
    ],
  ];

  return (
    <div className={`grid grid-cols-3 gap-2 p-1 ${className}`}>
      {keys.flat().map((k, idx) => {
        let label: React.ReactNode = k;
        let variantStyle =
          'bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700 dark:active:bg-slate-600 dark:text-slate-100 border border-slate-200 dark:border-slate-700 font-mono text-xl font-bold';

        if (k === 'clear') {
          label = 'C';
          variantStyle =
            'bg-amber-50 hover:bg-amber-100 active:bg-amber-200 text-amber-800 dark:bg-amber-950/60 dark:hover:bg-amber-900/80 dark:text-amber-300 border border-amber-200 dark:border-amber-800/80 font-bold text-lg';
        } else if (k === 'backspace') {
          label = <Delete className="w-5 h-5" />;
          variantStyle =
            'bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-800 dark:bg-rose-950/60 dark:hover:bg-rose-900/80 dark:text-rose-300 border border-rose-200 dark:border-rose-800/80 font-bold';
        }

        return (
          <button
            key={`${k}-${idx}`}
            type="button"
            disabled={disabled}
            onClick={() => handleKeyClick(k)}
            className={`min-h-[52px] sm:min-h-[58px] rounded-xl flex items-center justify-center shadow-subtle transition-subtle active:scale-[0.96] select-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-40 disabled:pointer-events-none ${variantStyle}`}
          >
            {label}
          </button>
        );
      })}

      {/* Extra Action Row: Clear and Backspace if not in the 4th row */}
      {showDecimal && showDoubleZero && (
        <div className="col-span-3 grid grid-cols-2 gap-2 mt-0.5">
          <button
            type="button"
            disabled={disabled}
            onClick={() => handleKeyClick('clear')}
            className="min-h-[46px] rounded-xl bg-amber-50 hover:bg-amber-100 active:bg-amber-200 text-amber-800 dark:bg-amber-950/60 dark:hover:bg-amber-900/80 dark:text-amber-300 border border-amber-200 dark:border-amber-800/80 font-bold text-sm flex items-center justify-center shadow-subtle transition-subtle active:scale-[0.96] cursor-pointer"
          >
            Clear (C)
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => handleKeyClick('backspace')}
            className="min-h-[46px] rounded-xl bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-800 dark:bg-rose-950/60 dark:hover:bg-rose-900/80 dark:text-rose-300 border border-rose-200 dark:border-rose-800/80 font-bold text-sm flex items-center justify-center space-x-1 shadow-subtle transition-subtle active:scale-[0.96] cursor-pointer"
          >
            <Delete className="w-4 h-4 mr-1" />
            <span>Delete</span>
          </button>
        </div>
      )}
    </div>
  );
};

