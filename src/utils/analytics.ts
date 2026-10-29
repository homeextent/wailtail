/**
 * Telemetry Utility Module for Google Analytics 4 (GA4)
 * Measurement ID: G-GQZ2L1RQ9M
 */

declare global {
  interface Window {
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
  }
}

export const GA_MEASUREMENT_ID = 'G-GQZ2L1RQ9M';

/**
 * Internal helper to safely dispatch events to Google Analytics
 * with fail-open safety (handling ad-blockers) and development mode suppression.
 */
function dispatchGaEvent(eventName: string, params: Record<string, any>): void {
  try {
    if (import.meta.env.DEV) {
      console.debug('[GA4 Telemetry]', eventName, params);
      return;
    }

    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      window.gtag('event', eventName, params);
    }
  } catch (error) {
    // Fail-open safety: never break application logic due to telemetry
    console.warn('[GA4 Telemetry Error]', error);
  }
}

/**
 * Record SPA Route Pageviews with full path and hydrated document title
 */
export function trackPageView(path: string, title: string): void {
  try {
    if (import.meta.env.DEV) {
      console.debug('[GA4 Telemetry] page_view', {
        page_path: path,
        page_title: title,
        send_to: GA_MEASUREMENT_ID
      });
      return;
    }

    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      window.gtag('event', 'page_view', {
        page_path: path,
        page_title: title,
        send_to: GA_MEASUREMENT_ID
      });
    }
  } catch (error) {
    console.warn('[GA4 Telemetry Error]', error);
  }
}

/**
 * Dispatch bid_placed conversion event upon successful bid placement
 */
export function trackBidPlaced(auctionId: string, vehicleTitle: string, amountCAD: number): void {
  dispatchGaEvent('bid_placed', {
    auction_id: auctionId,
    vehicle_title: vehicleTitle,
    value: amountCAD,
    currency: 'CAD'
  });
}

/**
 * Dispatch consignment_submitted conversion event upon successful consignment application submission
 */
export function trackConsignmentSubmitted(year: string | number, make: string, model: string): void {
  dispatchGaEvent('consignment_submitted', {
    vehicle_year: year,
    vehicle_make: make,
    vehicle_model: model
  });
}

/**
 * Dispatch provenance_view event when users click on external verification dossiers
 */
export function trackProvenanceClick(auctionId: string, type: 'cloud_dossier' | 'hagerty_valuation'): void {
  dispatchGaEvent('provenance_view', {
    auction_id: auctionId,
    link_type: type
  });
}
