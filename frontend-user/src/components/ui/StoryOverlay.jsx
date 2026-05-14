import React, { useEffect, useState } from 'react';
import { getBusinessStory } from '../../api/offers';
import { resolveImageUrl } from '../../utils/imageUrl';
import { Spinner } from './Spinner';

export function StoryOverlay({ businessId, businessName, onClose }) {
  const [story, setStory]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBusinessStory(businessId)
      .then(({ story: s }) => setStory(s))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [businessId]);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="story-overlay" onClick={onClose}>
      <div className="story-overlay-inner" onClick={(e) => e.stopPropagation()}>
        <button className="story-overlay-close" onClick={onClose} aria-label="Close">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="story-overlay-header">
          <span className="story-overlay-biz">{businessName}</span>
        </div>

        {loading ? (
          <div className="story-overlay-loading"><Spinner white /></div>
        ) : story ? (
          <>
            <img
              className="story-overlay-img"
              src={resolveImageUrl(story.image_url)}
              alt={`${businessName}'s post`}
            />
            {story.caption && (
              <div className="story-overlay-caption">{story.caption}</div>
            )}
          </>
        ) : (
          <div className="story-overlay-loading" style={{ color: '#fff', fontSize: '0.9rem' }}>
            No story right now
          </div>
        )}
      </div>
    </div>
  );
}
