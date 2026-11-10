import React from 'react';

export interface AvatarProps {
  name: string;
  role?: 'owner' | 'manager' | 'cashier' | string;
  size?: 'sm' | 'md' | 'lg';
  src?: string;
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  name,
  role = 'cashier',
  size = 'md',
  src,
  className = '',
}) => {
  // Extract initials (e.g. "Store Owner" -> "SO")
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'U';

  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
  }[size];

  const roleRing = {
    owner: 'ring-2 ring-purple-500/80 bg-purple-100 text-purple-900 dark:bg-purple-950 dark:text-purple-300',
    manager: 'ring-2 ring-sky-500/80 bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-300',
    cashier: 'ring-2 ring-brand-500/80 bg-brand-100 text-brand-900 dark:bg-brand-950 dark:text-brand-300',
  }[role as 'owner' | 'manager' | 'cashier'] || 'ring-2 ring-slate-400 bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200';

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-full font-bold uppercase select-none shadow-subtle ${sizeClasses} ${roleRing} ${className}`}
      title={`${name} (${role})`}
    >
      {src ? (
        <img
          src={src}
          alt={name}
          className="w-full h-full object-cover rounded-full"
          onError={(e) => {
            // fallback to initials on error
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
};

