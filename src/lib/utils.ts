import React from 'react';
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function toBengaliNumber(number: number | string): string {
  const bengaliDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return number.toString().replace(/\d/g, (digit) => bengaliDigits[parseInt(digit)]);
}

export function formatCurrency(amount: number | string) {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '০';
  
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);

  return toBengaliNumber(formatted);
}

export function formatNumberWithCommas(value: string | number): string {
  const num = typeof value === 'string' ? value.replace(/,/g, '') : value.toString();
  if (!num || isNaN(Number(num))) return '';
  
  return new Intl.NumberFormat('en-IN').format(Number(num));
}

export function parseNumberFromCommas(value: string): string {
  return value.replace(/,/g, '');
}

export function generateId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
}

export function getDirectDriveUrl(url: string) {
  if (!url) return '';
  // Handle /d/ID format
  const driveRegex = /\/d\/([a-zA-Z0-9_-]+)/;
  const match = url.match(driveRegex);
  if (match && match[1]) {
    return `https://lh3.googleusercontent.com/d/${match[1]}`;
  }
  // Handle ?id=ID format
  const idRegex = /[?&]id=([a-zA-Z0-9_-]+)/;
  const idMatch = url.match(idRegex);
  if (idMatch && idMatch[1]) {
    return `https://lh3.googleusercontent.com/d/${idMatch[1]}`;
  }
  return url;
}

export function formatAddress(addr: any) {
  if (!addr) return '---';
  if (typeof addr === 'string') return addr;
  const parts = [addr.village, addr.postOffice, addr.thana, addr.district].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : '---';
}

