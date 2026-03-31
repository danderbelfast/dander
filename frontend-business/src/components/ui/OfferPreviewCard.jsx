import React from 'react';
import { CategoryIcon } from './CategoryIcon';

const BOGO_TYPES = new Set(['bogo', 'free_item']);
const NO_STRIKETHROUGH = new Set(['bogo', 'free_item', 'custom']);

export function OfferPreviewCard({ offer, businessName, imagePreview }) {
  const isBogo = BOGO_TYPES.has(offer.offer_type);

  const badge = isBogo
    ? (offer.offer_type === 'bogo' ? 'BOGO' : 'FREE')
    : offer.original_price && offer.offer_price
    ? `${Math.round((1 - offer.offer_price / offer.original_price) * 100)}% OFF`
    : offer.discount_percent
    ? `${Math.round(offer.discount_percent)}% OFF`
    : null;

  return (
    <div className="offer-preview">
      <div className="offer-preview-img">
        {imagePreview
          ? <img src={imagePreview} alt={offer.title} />
          : <span>🏪</span>
        }
        {offer.category && <CategoryIcon category={offer.category} bg={offer.icon_color || '#000000'} size={36} />}
        {badge && <div className="offer-preview-badge">{badge}</div>}
      </div>
      <div className="offer-preview-body">
        <div className="offer-preview-biz">{businessName || 'Your Business'}</div>
        <div className="offer-preview-title">{offer.title || 'Offer title'}</div>
        {offer.description && (
          <div className="offer-preview-desc">{offer.description}</div>
        )}
        {offer.custom_desc && (
          <div className="offer-preview-desc" style={{ marginTop: 4, fontStyle: 'italic' }}>{offer.custom_desc}</div>
        )}
        {(offer.offer_price || offer.original_price) && (
          <div className="offer-preview-price">
            {offer.offer_price && <span className="offer-preview-new">£{parseFloat(offer.offer_price).toFixed(2)}</span>}
            {offer.original_price && (
              NO_STRIKETHROUGH.has(offer.offer_type) || !offer.offer_price
                ? <span className="offer-preview-new">£{parseFloat(offer.original_price).toFixed(2)}</span>
                : <span className="offer-preview-old">£{parseFloat(offer.original_price).toFixed(2)}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
