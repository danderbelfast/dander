import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useLocation } from '../context/LocationContext';
import { useAuth } from '../context/AuthContext';
import { OfferCardH, OfferCard } from '../components/offers/OfferCard';
import { Spinner } from '../components/ui/Spinner';
import { SectionIcon } from '../components/ui/CategoryIcon';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { getSavedOffers } from '../api/offers';

const ALL_CATS = [
  { key: 'Food & Drink',          match: ['food & drink', 'food', 'drinks', 'restaurant', 'café', 'cafe', 'bakery', 'bar & pub', 'bar', 'pub'] },
  { key: 'Beauty & Wellness',     match: ['beauty & wellness', 'health & beauty', 'beauty'] },
  { key: 'Health & Fitness',      match: ['health & fitness', 'fitness', 'health'] },
  { key: 'Entertainment',         match: ['entertainment'] },
  { key: 'Retail & Shopping',     match: ['retail & shopping', 'retail'] },
  { key: 'Services',              match: ['services'] },
  { key: 'Experiences & Leisure', match: ['experiences & leisure', 'experiences', 'leisure'] },
];

function matchCat(offer, cat) {
  const c = (offer.category || '').toLowerCase().trim();
  return cat.match.includes(c);
}

function isEndingSoon(expiresAt) {
  if (!expiresAt) return false;
  return new Date(expiresAt) - Date.now() < 3 * 3_600_000;
}

function CategoryRow({ title, offers, savedIds, onSaveToggle, onSeeAll }) {
  if (!offers.length) return null;
  return (
    <div className="cat-row">
      <div className="cat-row-header">
        <div className="cat-row-title-wrap">
          <SectionIcon category={title} />
          <span className="cat-row-title">{title}</span>
        </div>
        {offers.length > 3 && (
          <span className="cat-row-link" onClick={onSeeAll}>See all</span>
        )}
      </div>
      <div className="cat-row-scroll">
        {offers.map((o) => (
          <OfferCardH
            key={o.id}
            offer={o}
            saved={savedIds.has(o.id)}
            onSaveToggle={onSaveToggle}
          />
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const {
    location, permission, requestLocation,
    nearbyOffers, loadingOffers, refresh,
  } = useLocation();

  const scrollRef             = useRef(null);
  const { pulling, distance } = usePullToRefresh(refresh, scrollRef);

  // Saved offers state
  const [savedIds, setSavedIds] = useState(new Set());
  useEffect(() => {
    getSavedOffers()
      .then((d) => setSavedIds(new Set((d.offers || []).map((o) => o.id))))
      .catch(() => {});
  }, []);

  const handleSaveToggle = useCallback((id, isSaved) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (isSaved) next.add(id); else next.delete(id);
      return next;
    });
  }, []);

  // Search
  const [search, setSearch] = useState('');

  // Filter category state (null = discovery rows, string = filtered list)
  const [filterCat, setFilterCat] = useState(null);

  // Avatar
  const initials = user
    ? `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || '?'
    : '?';

  // Deduplicate offers by id
  const uniqueOffers = useMemo(() => {
    const seen = new Set();
    return nearbyOffers.filter((o) => {
      if (seen.has(o.id)) return false;
      seen.add(o.id);
      return true;
    });
  }, [nearbyOffers]);

  // Apply search filter
  const searchedOffers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return uniqueOffers;
    return uniqueOffers.filter((o) =>
      o.title?.toLowerCase().includes(q) ||
      o.business_name?.toLowerCase().includes(q) ||
      o.category?.toLowerCase().includes(q)
    );
  }, [uniqueOffers, search]);

  // Group by category
  const grouped = useMemo(() => {
    const map = {};
    for (const cat of ALL_CATS) {
      map[cat.key] = searchedOffers.filter((o) => matchCat(o, cat));
    }
    return map;
  }, [searchedOffers]);

  const endingSoon = useMemo(
    () => searchedOffers.filter((o) => isEndingSoon(o.expires_at)),
    [searchedOffers]
  );

  // Filtered list for "See all" / category view
  const filteredList = useMemo(() => {
    if (!filterCat) return [];
    const cat = ALL_CATS.find((c) => c.key === filterCat);
    return cat ? uniqueOffers.filter((o) => matchCat(o, cat)) : uniqueOffers;
  }, [filterCat, uniqueOffers]);

  const hasOffers = uniqueOffers.length > 0;

  return (
    <div ref={scrollRef} style={{ overflowY: 'auto', height: '100%' }}>
      {/* Pull-to-refresh indicator */}
      {distance > 8 && (
        <div className="pull-indicator" style={{ opacity: Math.min(distance / 60, 1) }}>
          {pulling ? <Spinner size="sm" /> : <span style={{ fontSize: '1.1rem' }}>↓</span>}
          <span>{pulling ? 'Release to refresh' : 'Pull to refresh'}</span>
        </div>
      )}

      {/* Header */}
      <header className="home-header">
        <div>
          <div className="home-logo">Dander</div>
          {location && (
            <div className="home-greeting">
              {user?.firstName ? `Hi ${user.firstName} 👋` : 'Deals near you'}
            </div>
          )}
        </div>
        <Link to="/settings" className="home-avatar">
          {user?.avatarUrl
            ? <img src={user.avatarUrl} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ color: 'var(--c-primary)', fontWeight: 700, fontSize: '0.9rem', fontFamily: 'var(--f-head)' }}>{initials}</span>
          }
        </Link>
      </header>

      {/* Location banners */}
      {permission === 'prompt' && (
        <div className="location-banner">
          <span style={{ fontSize: '1.3rem' }}>📍</span>
          <span style={{ flex: 1 }}>
            <strong>Enable location</strong> to see deals near you
          </span>
          <button className="btn btn-sm" onClick={requestLocation}>Enable</button>
        </div>
      )}
      {permission === 'denied' && (
        <div className="location-banner" style={{ borderColor: 'rgba(201,138,0,0.3)', background: 'rgba(201,138,0,0.06)' }}>
          <span style={{ fontSize: '1.3rem' }}>⚠️</span>
          <span style={{ fontSize: '0.83rem', color: 'var(--c-text-muted)' }}>
            Location blocked — showing all Belfast offers. Enable in browser settings for nearby results.
          </span>
        </div>
      )}

      {/* Search bar — shown when we have offers and no category filter */}
      {hasOffers && !filterCat && (
        <div className="home-search-wrap">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="home-search-icon">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            className="home-search-input"
            type="search"
            placeholder="Search deals, shops…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="home-search-clear"
              onClick={() => setSearch('')}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
      )}

      {/* "N deals near you" banner */}
      {hasOffers && !filterCat && !search && (
        <div className="deals-banner">
          <span>🔥</span>
          <span>
            <strong>{uniqueOffers.length} {uniqueOffers.length === 1 ? 'deal' : 'deals'}</strong>{' '}
            near you right now
          </span>
        </div>
      )}

      {/* Loading state */}
      {loadingOffers && uniqueOffers.length === 0 && (
        <div className="loading-center">
          <Spinner />
          <span>Finding offers near you…</span>
        </div>
      )}

      {/* Empty state */}
      {!loadingOffers && uniqueOffers.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <div className="empty-state-title">No offers found</div>
          <p className="empty-state-body">No active offers in this area right now. Check back soon.</p>
        </div>
      )}

      {/* Search empty state */}
      {search && searchedOffers.length === 0 && (
        <div className="empty-state" style={{ padding: '32px 24px' }}>
          <div className="empty-state-icon" style={{ fontSize: '2rem' }}>🔍</div>
          <div className="empty-state-title">No results for "{search}"</div>
        </div>
      )}

      {/* ── Filtered list view (category "See all") ── */}
      {filterCat && uniqueOffers.length > 0 && (
        <>
          <div className="home-list-back" onClick={() => setFilterCat(null)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            All categories
          </div>
          <div style={{ padding: '0 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <SectionIcon category={filterCat} />
            <span style={{ fontFamily: 'var(--f-head)', fontSize: '1.2rem', fontWeight: 700 }}>
              {filterCat}
            </span>
            <span style={{ fontSize: '0.82rem', color: 'var(--c-text-muted)', marginLeft: 8 }}>
              {filteredList.length} {filteredList.length === 1 ? 'offer' : 'offers'}
            </span>
          </div>
          <div className="offer-list">
            {filteredList.map((o) => (
              <OfferCard
                key={o.id}
                offer={o}
                saved={savedIds.has(o.id)}
                onSaveToggle={handleSaveToggle}
              />
            ))}
          </div>
          {filteredList.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">🔍</div>
              <div className="empty-state-title">No {filterCat.toLowerCase()} deals</div>
              <p className="empty-state-body">No {filterCat.toLowerCase()} offers nearby right now.</p>
            </div>
          )}
        </>
      )}

      {/* ── Discovery rows ── */}
      {!filterCat && searchedOffers.length > 0 && (
        <div style={{ paddingTop: 4 }}>
          {endingSoon.length > 0 && (
            <CategoryRow
              title="Ending soon"
              offers={endingSoon}
              savedIds={savedIds}
              onSaveToggle={handleSaveToggle}
              onSeeAll={() => {}}
            />
          )}

          <CategoryRow
            title="Nearest to you"
            offers={searchedOffers.slice(0, 12)}
            savedIds={savedIds}
            onSaveToggle={handleSaveToggle}
            onSeeAll={() => {}}
          />

          {ALL_CATS.map((cat) => {
            const offers = grouped[cat.key] || [];
            if (!offers.length) return null;
            return (
              <CategoryRow
                key={cat.key}
                title={cat.key}
                offers={offers}
                savedIds={savedIds}
                onSaveToggle={handleSaveToggle}
                onSeeAll={() => setFilterCat(cat.key)}
              />
            );
          })}
        </div>
      )}

      <div style={{ height: 16 }} />
    </div>
  );
}
