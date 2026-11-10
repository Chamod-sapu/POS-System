import React from 'react';

export interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  circle?: boolean;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  width,
  height,
  circle = false,
}) => {
  return (
    <div
      className={`bg-slate-200 dark:bg-slate-800 animate-pulse ${
        circle ? 'rounded-full' : 'rounded-lg'
      } ${className}`}
      style={{
        width: width !== undefined ? width : undefined,
        height: height !== undefined ? height : undefined,
      }}
      aria-hidden="true"
    />
  );
};

