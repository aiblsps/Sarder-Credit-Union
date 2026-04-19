import React from 'react';
import { cn } from '../lib/utils';

interface SafeAreaLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export const SafeAreaLayout: React.FC<SafeAreaLayoutProps> = ({ children, className }) => {
  return (
    <div 
      className={cn(
        "min-h-screen w-full flex flex-col bg-slate-50 overflow-x-hidden box-border",
        "pt-[env(safe-area-inset-top)]",
        "pb-[env(safe-area-inset-bottom)]",
        "pl-[env(safe-area-inset-left)]",
        "pr-[env(safe-area-inset-right)]",
        className
      )}
    >
      {children}
    </div>
  );
};
