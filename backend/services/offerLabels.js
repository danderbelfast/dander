'use strict';

const BASE_URL = process.env.DANDER_BASE_URL || 'https://dander.io';

function discountLabel(offer) {
  switch (offer.offer_type) {
    case 'percentage':
      return offer.discount_percent ? `${Math.round(offer.discount_percent)}% OFF` : null;
    case 'fixed':
    case 'fixed_price':
      return offer.offer_price != null ? `£${parseFloat(offer.offer_price).toFixed(2)}` : null;
    case 'free_item':
    case 'gift_with_purchase':
      return 'FREE GIFT';
    case 'bogo':
    case 'buy_one_get_one':
      return '2 FOR 1';
    case 'free_delivery':
      return 'FREE DELIVERY';
    case 'custom':
      return offer.discount_label || offer.description || null;
    default:
      return null;
  }
}

function ogImageUrl(offerId) {
  return `${BASE_URL}/api/v1/offers/${offerId}/preview.png`;
}

function enrichOffer(offer) {
  if (!offer) return null;
  return {
    ...offer,
    discount_label: discountLabel(offer),
    og_image_url: ogImageUrl(offer.id),
  };
}

module.exports = { discountLabel, enrichOffer, ogImageUrl, BASE_URL };
