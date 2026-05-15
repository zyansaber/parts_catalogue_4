import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface ImageWithFallbackProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  fallbackSrcs?: string[];
  alt: string;
  className?: string;
  fallbackClassName?: string;
}

export function ImageWithFallback({
  src,
  fallbackSrcs = [],
  alt,
  className,
  fallbackClassName,
  ...props
}: ImageWithFallbackProps) {
  const [currentSrc, setCurrentSrc] = useState(src);
  const [hasError, setHasError] = useState(false);
  const [attempts, setAttempts] = useState(0);
  
  const allSrcs = [src, ...fallbackSrcs];

  useEffect(() => {
    setCurrentSrc(src);
    setHasError(false);
    setAttempts(0);
  }, [src]);

  const handleError = () => {
    const nextAttempt = attempts + 1;
    if (nextAttempt < allSrcs.length) {
      setCurrentSrc(allSrcs[nextAttempt]);
      setAttempts(nextAttempt);
    } else {
      setHasError(true);
    }
  };

  if (hasError) {
    return (
      <div className={cn(
        "flex items-center justify-center bg-gray-100 border border-gray-200 text-gray-500 text-sm",
        fallbackClassName,
        className
      )}>
        No Image
      </div>
    );
  }

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={className}
      onError={handleError}
      {...props}
    />
  );
}