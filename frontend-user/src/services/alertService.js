/**
 * Alert Service
 * Combines haptic and sound into single coordinated calls
 * All app code should call alertService only, never hapticService or soundService directly
 * (except for accessibility/preference setup screens)
 */

import * as hapticService from './hapticService';
import * as soundService from './soundService';

/**
 * Deal nearby - Play sound and trigger haptic
 * If distance < 100m, use very close versions instead
 * @param {number} distanceMeters - optional distance to deal
 */
export async function dealNearby(distanceMeters) {
  const isVeryClose = distanceMeters !== undefined && distanceMeters < 100;

  if (isVeryClose) {
    await soundService.veryClose();
    hapticService.veryClose();
  } else {
    await soundService.dealNearby();
    hapticService.dealNearby();
  }
}

/**
 * Coupon claimed - Play sound and trigger haptic
 * Small delay before haptic so sound and buzz feel simultaneous
 */
export async function couponClaimed() {
  await soundService.couponClaimed();
  // Delay haptic slightly so sound and buzz feel simultaneous
  await new Promise((resolve) => setTimeout(resolve, 300));
  hapticService.couponClaimed();
}

/**
 * Coupon redeemed - Play sound and trigger haptic
 */
export async function couponRedeemed() {
  await soundService.couponRedeemed();
  hapticService.couponRedeemed();
}

/**
 * Deal expiring soon - Play sound and trigger haptic
 */
export async function dealExpiringSoon() {
  await soundService.dealExpiringSoon();
  hapticService.dealExpiringSoon();
}

/**
 * New offer - Play sound and trigger haptic
 */
export async function newOffer() {
  await soundService.newOffer();
  hapticService.dealNearby(); // Use dealNearby haptic for new offers
}

/**
 * Error - Play sound and trigger haptic
 */
export async function error() {
  await soundService.error();
  hapticService.error();
}

/**
 * Test alerts - Play both sound and haptic for preference preview
 * @param {number} volumeOverride - optional volume override (0-1)
 */
export async function testAlerts(volumeOverride) {
  await soundService.dealNearby(volumeOverride);
  hapticService.dealNearby();
}
