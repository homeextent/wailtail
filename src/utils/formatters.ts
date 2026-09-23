export function formatCurrency(amount: number, style: 'standard' | 'short' | 'code' = 'standard'): string {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return style === 'code' ? 'CAD $0' : '$0 CAD';
  }
  const formatted = Math.floor(amount).toLocaleString('en-CA');
  if (style === 'code') {
    return `CAD $${formatted}`;
  }
  if (style === 'short') {
    return `$${formatted}`;
  }
  return `$${formatted} CAD`;
}

export function getEffectiveAuctionStatus(
  startTime: number,
  endTime: number,
  status?: string,
  now: number = Date.now()
): 'draft' | 'upcoming' | 'active' | 'ending_soon' | 'ended' | 'sold' {
  if (status === 'draft' || status === 'sold') return status;
  if (now < startTime) return 'upcoming';
  if (now >= endTime) return 'ended';
  const isEndingSoon = (endTime - now) <= 120 * 1000;
  return isEndingSoon ? 'ending_soon' : 'active';
}

export function formatAuctionCountdown(
  startTime: number, 
  endTime: number, 
  status?: string, 
  now: number = Date.now()
) {
  const effectiveStatus = getEffectiveAuctionStatus(startTime, endTime, status, now);
  const isUpcoming = effectiveStatus === 'upcoming';
  const isEnded = effectiveStatus === 'ended' || effectiveStatus === 'sold';

  if (isUpcoming) {
    const diff = Math.max(0, startTime - now);
    const totalSeconds = Math.floor(diff / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    let formatted = '';
    if (days > 0) {
      formatted = `Starts in ${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      formatted = `Starts in ${hours}h ${minutes}m ${seconds}s`;
    } else {
      formatted = `Starts in ${minutes}m ${seconds.toString().padStart(2, '0')}s`;
    }

    return {
      statusType: 'upcoming' as const,
      days,
      hours,
      minutes,
      seconds,
      totalSeconds,
      isEnded: false,
      isUpcoming: true,
      isUrgent: false,
      formatted
    };
  }

  if (isEnded) {
    const endType: 'sold' | 'ended' = effectiveStatus === 'sold' ? 'sold' : 'ended';
    return {
      statusType: endType,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      totalSeconds: 0,
      isEnded: true,
      isUpcoming: false,
      isUrgent: false,
      formatted: effectiveStatus === 'sold' ? 'Vehicle Sold' : 'Auction Ended'
    };
  }

  // Active auction countdown (when now >= startTime and now < endTime)
  const diff = Math.max(0, endTime - now);
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const isUrgent = diff <= 2 * 60 * 1000; // <= 2 minutes (Anti-sniping window)

  let formatted = '';
  if (days > 0) {
    formatted = `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    formatted = `${hours}h ${minutes}m ${seconds}s`;
  } else {
    formatted = `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }

  return {
    statusType: 'active' as const,
    days,
    hours,
    minutes,
    seconds,
    totalSeconds,
    isEnded: false,
    isUpcoming: false,
    isUrgent,
    formatted
  };
}

export function formatTimeRemaining(endTime: number, now: number = Date.now()) {
  return formatAuctionCountdown(0, endTime, 'active', now);
}

export function formatDateTime(timestamp: number): string {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  });
}

export function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  return formatDateTime(timestamp);
}

/**
 * Sanitizes and normalizes an external URL, prepending https:// if protocol is missing.
 * Prevents browser relative URL path resolution errors.
 * Returns empty string if url is invalid, empty, or whitespace-only.
 */
export function formatExternalUrl(url?: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}
