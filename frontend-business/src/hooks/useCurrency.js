import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';

/**
 * useCurrency — returns the active business's currency_symbol and a
 * helper to format an amount with it. Falls back to '£' when the
 * profile hasn't loaded yet so the UI never flickers a missing glyph.
 *
 *   const { symbol, fmt } = useCurrency();
 *   <span>{fmt(24.50)}</span>          // "£24.50"   (or "$24.50", "€24.50", …)
 *   <span>{symbol}{x.toFixed(2)}</span> // direct interpolation when fmt is overkill
 */
export function useCurrency() {
  const { business } = useAuth();
  return useMemo(() => {
    const symbol = (business && business.currency_symbol) || '£';
    return {
      symbol,
      currencyCode: (business && business.currency_code) || 'GBP',
      fmt: (amount, opts = {}) => {
        const n = Number(amount);
        if (!Number.isFinite(n)) return `${symbol}0.00`;
        const decimals = opts.decimals != null ? opts.decimals : 2;
        return `${symbol}${n.toFixed(decimals)}`;
      },
    };
  }, [business]);
}
