/**
 * useCurrency — return the active user's currency symbol and a
 * formatter. The user's countryCode is set at registration and
 * carried in the AuthUser blob; the symbol is resolved by fetching
 * /api/countries once and caching the lookup map in module scope so
 * every screen shares the same network round-trip.
 *
 * Falls back to '£' until the lookup resolves so the UI never
 * flickers a missing glyph.
 */

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Country, listCountries } from '../api/auth';

let countriesPromise: Promise<Country[]> | null = null;
function loadCountriesOnce(): Promise<Country[]> {
  if (!countriesPromise) {
    countriesPromise = listCountries()
      .then((r) => r.countries || [])
      .catch(() => []);
  }
  return countriesPromise;
}

export function useCurrency() {
  const { user } = useAuth();
  const countryCode = (user as any)?.countryCode || 'GB';

  const [symbol, setSymbol]             = useState<string>('£');
  const [currencyCode, setCurrencyCode] = useState<string>('GBP');

  useEffect(() => {
    let cancelled = false;
    loadCountriesOnce().then((list) => {
      if (cancelled) return;
      const match = list.find((c) => c.code === countryCode);
      if (match) {
        setSymbol(match.currency_symbol);
        setCurrencyCode(match.currency_code);
      }
    });
    return () => { cancelled = true; };
  }, [countryCode]);

  return useMemo(() => ({
    symbol,
    currencyCode,
    fmt: (amount: number, opts: { decimals?: number } = {}) => {
      const n = Number(amount);
      if (!Number.isFinite(n)) return `${symbol}0.00`;
      const decimals = opts.decimals != null ? opts.decimals : 2;
      return `${symbol}${n.toFixed(decimals)}`;
    },
  }), [symbol, currencyCode]);
}
