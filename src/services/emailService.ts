import { collection, addDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { EmailNotification } from '../types';

/**
 * Transactional Email Notification System
 * Compatible with Firebase Trigger Email extension (writes to 'mail' collection)
 * and maintains an administrative ledger in 'emailLogs'.
 */

// Email template generator with Wailtail luxury styling
function generateEmailHtml(params: {
  headline: string;
  preheader: string;
  bodyHtml: string;
  callToAction?: { label: string; url: string };
  footerNote?: string;
}): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${params.headline}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f4f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #181f25; }
    .container { max-width: 600px; margin: 24px auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .header { background-color: #121619; padding: 24px; text-align: center; border-bottom: 2px solid #b91c1c; }
    .brand { font-size: 24px; font-weight: 900; letter-spacing: -0.5px; color: #ffffff; text-transform: uppercase; margin: 0; }
    .brand-sub { font-size: 10px; font-weight: 700; letter-spacing: 2px; color: #94a3b8; text-transform: uppercase; margin-top: 4px; }
    .body { padding: 32px 28px; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 16px; }
    .badge-red { background-color: #fee2e2; color: #991b1b; }
    .badge-amber { background-color: #fef3c7; color: #92400e; }
    .badge-emerald { background-color: #d1fae5; color: #065f46; }
    .h1 { font-size: 22px; font-weight: 800; color: #0f172a; margin: 0 0 16px 0; line-height: 1.3; }
    .text { font-size: 15px; line-height: 1.6; color: #334155; margin-bottom: 20px; }
    .detail-card { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin: 20px 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #edf2f7; font-size: 14px; }
    .detail-row:last-child { border-bottom: none; }
    .detail-label { color: #64748b; font-weight: 500; }
    .detail-val { color: #0f172a; font-weight: 700; }
    .btn { display: inline-block; padding: 14px 28px; background-color: #b91c1c; color: #ffffff !important; text-decoration: none; font-weight: 700; font-size: 14px; border-radius: 8px; margin-top: 12px; }
    .btn:hover { background-color: #991b1b; }
    .footer { background-color: #f8fafc; padding: 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
    .footer-currency { font-weight: 700; color: #065f46; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="brand">WAILTAIL</div>
      <div class="brand-sub">Private Single-Car Auctions • CAD Currency</div>
    </div>
    <div class="body">
      ${params.bodyHtml}
      ${params.callToAction ? `
        <div style="text-align: center; margin: 24px 0 12px 0;">
          <a href="${params.callToAction.url}" class="btn">${params.callToAction.label}</a>
        </div>
      ` : ''}
    </div>
    <div class="footer">
      <p style="margin: 0 0 8px 0;"><strong>WAILTAIL AUCTIONS</strong> • Direct Peer-to-Peer Private Consignments</p>
      <p style="margin: 0 0 8px 0;" class="footer-currency">All transactions and bids are denominated strictly in Canadian Dollars ($CAD) with zero buyer fees.</p>
      <p style="margin: 0;">${params.footerNote || 'You received this notification because of active bidding activity on Wailtail.'}</p>
    </div>
  </div>
</body>
</html>
`;
}

/**
 * Log and queue transactional email
 */
async function recordAndQueueEmail(email: EmailNotification): Promise<void> {
  try {
    // 1. Write to standard Firebase 'mail' collection (Trigger Email extension)
    const mailCol = collection(db, 'mail');
    await addDoc(mailCol, {
      to: [email.to],
      message: {
        subject: email.subject,
        text: email.text,
        html: email.html
      },
      createdAt: email.timestamp,
      notificationType: email.type,
      metadata: email.metadata || {}
    });

    // 2. Also log to 'emailLogs' collection for Owner Dashboard inspection
    const logsCol = collection(db, 'emailLogs');
    await addDoc(logsCol, {
      ...email,
      status: 'sent'
    });
  } catch (err) {
    console.warn('Notice: Logged transactional email to local/client console (Firestore write queued):', err);
  }
}

/**
 * 1. Bid Placement Confirmation Email
 */
export async function sendBidPlacedEmail(params: {
  toEmail: string;
  bidderName: string;
  bidAmount: number;
  vehicleTitle: string;
  auctionId: string;
  isReserveMet: boolean;
  endTime: number;
  antiSniped?: boolean;
}): Promise<void> {
  const formattedAmount = `$${params.bidAmount.toLocaleString()} CAD`;
  const subject = `[Wailtail] Bid Confirmed: ${formattedAmount} on ${params.vehicleTitle}`;
  
  const text = `
Hello ${params.bidderName},

Your bid of ${formattedAmount} has been successfully placed on:
${params.vehicleTitle}

${params.antiSniped ? 'NOTE: Your bid was received in the closing 2 minutes. The countdown timer was extended by +2:00 via Wailtail Anti-Sniping rules.' : ''}
Reserve Status: ${params.isReserveMet ? 'Reserve Met (Car will sell to highest bidder)' : 'Reserve Not Yet Met'}
Current Auction Closing: ${new Date(params.endTime).toLocaleString()}

View live auction: ${window.location.origin}
  `.trim();

  const bodyHtml = `
    <span class="badge badge-emerald">Bid Placed Successfully</span>
    <h1 class="h1">Your Bid of ${formattedAmount} is Confirmed</h1>
    <p class="text">Hello <strong>${params.bidderName}</strong>, your bid has been officially recorded in the auction ledger for <strong>${params.vehicleTitle}</strong>.</p>
    
    <div class="detail-card">
      <div class="detail-row">
        <span class="detail-label">Your Bid Amount:</span>
        <span class="detail-val" style="color: #065f46; font-size: 16px;">${formattedAmount}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Reserve Status:</span>
        <span class="detail-val">${params.isReserveMet ? '✓ Reserve Met (Listing Will Sell)' : 'Reserve In Effect'}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Auction Scheduled End:</span>
        <span class="detail-val">${new Date(params.endTime).toLocaleString()}</span>
      </div>
      ${params.antiSniped ? `
      <div class="detail-row" style="background-color: #fef3c7; margin-top: 8px; padding: 8px; border-radius: 4px;">
        <span class="detail-label" style="color: #92400e; font-weight: bold;">⚡ Anti-Sniping Protection:</span>
        <span class="detail-val" style="color: #92400e;">Timer extended by +2 minutes</span>
      </div>
      ` : ''}
    </div>

    <p class="text" style="font-size: 13px; color: #64748b;">
      You are currently the leading bidder. If another bidder places a higher bid, you will receive an immediate outbid alert with a counter-bid link.
    </p>
  `;

  const html = generateEmailHtml({
    headline: 'Bid Placed Successfully',
    preheader: `Your bid of ${formattedAmount} on ${params.vehicleTitle} is live.`,
    bodyHtml,
    callToAction: { label: 'View Live Auction & Bid Log', url: window.location.origin }
  });

  await recordAndQueueEmail({
    to: params.toEmail,
    type: 'bid_confirmation',
    subject,
    text,
    html,
    timestamp: Date.now(),
    status: 'sent',
    metadata: {
      auctionId: params.auctionId,
      amount: params.bidAmount,
      bidderName: params.bidderName
    }
  });
}

/**
 * 2. Outbid Alert Email
 */
export async function sendOutbidAlertEmail(params: {
  toEmail: string;
  bidderName: string;
  previousBidAmount: number;
  newBidAmount: number;
  vehicleTitle: string;
  auctionId: string;
  endTime: number;
}): Promise<void> {
  const formattedNew = `$${params.newBidAmount.toLocaleString()} CAD`;
  const formattedPrev = `$${params.previousBidAmount.toLocaleString()} CAD`;
  const subject = `[Wailtail Outbid Alert] New High Bid: ${formattedNew} on ${params.vehicleTitle}`;

  const text = `
Hello ${params.bidderName},

You have been outbid on:
${params.vehicleTitle}

Your Previous Bid: ${formattedPrev}
New Leading Bid: ${formattedNew}
Auction Ending: ${new Date(params.endTime).toLocaleString()}

To place a counter-bid before the hammer falls: ${window.location.origin}
  `.trim();

  const bodyHtml = `
    <span class="badge badge-amber">Outbid Alert</span>
    <h1 class="h1">You Have Been Outbid!</h1>
    <p class="text">Hello <strong>${params.bidderName}</strong>, another verified bidder has placed a higher bid on <strong>${params.vehicleTitle}</strong>.</p>
    
    <div class="detail-card">
      <div class="detail-row">
        <span class="detail-label">New High Bid:</span>
        <span class="detail-val" style="color: #b91c1c; font-size: 18px;">${formattedNew}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Your Previous Bid:</span>
        <span class="detail-val" style="text-decoration: line-through; color: #94a3b8;">${formattedPrev}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Auction Scheduled End:</span>
        <span class="detail-val">${new Date(params.endTime).toLocaleString()}</span>
      </div>
    </div>

    <p class="text" style="font-size: 14px;">
      Don't let this vehicle slip away! You can place a counter-bid immediately on the listing page. All bidding activity follows Wailtail 2-minute anti-sniping rules.
    </p>
  `;

  const html = generateEmailHtml({
    headline: 'You Have Been Outbid',
    preheader: `New leading bid is ${formattedNew} on ${params.vehicleTitle}. Place a counter-bid now!`,
    bodyHtml,
    callToAction: { label: 'Place Counter-Bid Now', url: window.location.origin }
  });

  await recordAndQueueEmail({
    to: params.toEmail,
    type: 'outbid_alert',
    subject,
    text,
    html,
    timestamp: Date.now(),
    status: 'sent',
    metadata: {
      auctionId: params.auctionId,
      newAmount: params.newBidAmount,
      previousAmount: params.previousBidAmount,
      bidderName: params.bidderName
    }
  });
}

/**
 * 3. Auction Won / Winner Settlement Notification
 */
export async function sendAuctionWonEmail(params: {
  toEmail: string;
  winnerName: string;
  finalBidAmount: number;
  vehicleTitle: string;
  sellerName: string;
  sellerEmail?: string;
  auctionId: string;
}): Promise<void> {
  const formattedAmount = `$${params.finalBidAmount.toLocaleString()} CAD`;
  const subject = `[Wailtail] Congratulations! You Won: ${params.vehicleTitle}`;

  const text = `
Congratulations ${params.winnerName}!

You are the winning bidder for:
${params.vehicleTitle}

Winning Bid: ${formattedAmount} (CAD, No Buyer's Premium)
Seller: ${params.sellerName} ${params.sellerEmail ? `(${params.sellerEmail})` : ''}

Next Steps:
1. Direct Offline Settlement: Coordinate with the owner to arrange a certified bank draft, wire transfer, or third-party vehicle escrow.
2. Title & Bill of Sale: Verify registration, VIN stamping, and sign transfer documentation.
3. Logistics & Handover: Arrange in-person collection or enclosed vehicle transport.

Thank you for participating on Wailtail.
  `.trim();

  const bodyHtml = `
    <span class="badge badge-emerald">Auction Concluded • Winner</span>
    <h1 class="h1">Congratulations, You Are the Winning Bidder!</h1>
    <p class="text">Hello <strong>${params.winnerName}</strong>, the auction for <strong>${params.vehicleTitle}</strong> has ended and your bid of <strong>${formattedAmount}</strong> is the winning amount!</p>
    
    <div class="detail-card">
      <div class="detail-row">
        <span class="detail-label">Winning Hammer Price:</span>
        <span class="detail-val" style="color: #065f46; font-size: 18px;">${formattedAmount}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Buyer's Fee:</span>
        <span class="detail-val" style="color: #065f46;">$0 CAD (Zero Platform Fees)</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Seller:</span>
        <span class="detail-val">${params.sellerName} ${params.sellerEmail ? `(${params.sellerEmail})` : ''}</span>
      </div>
    </div>

    <div style="background-color: #f1f5f9; border-left: 4px solid #b91c1c; padding: 16px; margin: 20px 0; border-radius: 4px;">
      <h3 style="margin: 0 0 8px 0; font-size: 14px; color: #0f172a;">Direct Offline Settlement Instructions</h3>
      <ol style="margin: 0; padding-left: 18px; font-size: 13px; color: #475569; line-height: 1.6;">
        <li><strong>Owner Contact:</strong> Reach out directly to the seller via email or phone to confirm wire transfer details or bank draft preparation.</li>
        <li><strong>Documentation:</strong> Request high-resolution scans of the provincial/state vehicle title and signed bill of sale before wire dispatch.</li>
        <li><strong>Enclosed Transport / Handover:</strong> Schedule vehicle inspection and carrier pickup.</li>
      </ol>
    </div>
  `;

  const html = generateEmailHtml({
    headline: 'You Won the Auction',
    preheader: `Congratulations! Your winning bid of ${formattedAmount} won ${params.vehicleTitle}.`,
    bodyHtml,
    callToAction: { label: 'Open Auction Summary & Bill of Sale', url: window.location.origin }
  });

  await recordAndQueueEmail({
    to: params.toEmail,
    type: 'auction_won',
    subject,
    text,
    html,
    timestamp: Date.now(),
    status: 'sent',
    metadata: {
      auctionId: params.auctionId,
      amount: params.finalBidAmount,
      winnerName: params.winnerName
    }
  });
}

/**
 * 4. Seller Inquiry Notification Email (Requirement 6 & 10)
 */
export async function sendSellerInquiryEmail(params: {
  sellerEmail: string;
  senderName: string;
  senderEmail: string;
  senderPhone?: string;
  topic: string;
  message: string;
  vehicleTitle: string;
}): Promise<void> {
  const subject = `[Wailtail Inquiry] New Question regarding ${params.vehicleTitle}: ${params.topic}`;

  const text = `
New inquiry received for ${params.vehicleTitle}

From: ${params.senderName} (${params.senderEmail} ${params.senderPhone ? `| ${params.senderPhone}` : ''})
Topic: ${params.topic}

Message:
${params.message}

Reply directly to ${params.senderEmail} to answer this prospective buyer.
  `.trim();

  const bodyHtml = `
    <span class="badge badge-amber">Prospective Buyer Inquiry</span>
    <h1 class="h1">New Inquiry: ${params.topic}</h1>
    <p class="text">A verified Wailtail member has submitted an inquiry regarding your listing: <strong>${params.vehicleTitle}</strong>.</p>
    
    <div class="detail-card">
      <div class="detail-row">
        <span class="detail-label">Prospective Buyer:</span>
        <span class="detail-val">${params.senderName}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Email:</span>
        <span class="detail-val"><a href="mailto:${params.senderEmail}" style="color: #b91c1c;">${params.senderEmail}</a></span>
      </div>
      ${params.senderPhone ? `
      <div class="detail-row">
        <span class="detail-label">Phone:</span>
        <span class="detail-val">${params.senderPhone}</span>
      </div>
      ` : ''}
      <div class="detail-row">
        <span class="detail-label">Topic:</span>
        <span class="detail-val">${params.topic}</span>
      </div>
    </div>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0;">
      <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 6px;">Message Content:</div>
      <p style="margin: 0; font-size: 14px; color: #1e293b; line-height: 1.6; white-space: pre-wrap;">${params.message}</p>
    </div>

    <p class="text" style="font-size: 13px; color: #64748b;">
      You can reply directly to this email or contact the sender at <strong>${params.senderEmail}</strong>.
    </p>
  `;

  const html = generateEmailHtml({
    headline: 'Prospective Buyer Question',
    preheader: `Inquiry from ${params.senderName}: ${params.topic}`,
    bodyHtml,
    callToAction: { label: `Reply to ${params.senderName}`, url: `mailto:${params.senderEmail}?subject=Re: Wailtail Inquiry - ${params.vehicleTitle}` }
  });

  await recordAndQueueEmail({
    to: params.sellerEmail,
    type: 'seller_inquiry',
    subject,
    text,
    html,
    timestamp: Date.now(),
    status: 'sent',
    metadata: {
      senderName: params.senderName,
      senderEmail: params.senderEmail,
      topic: params.topic
    }
  });
}

/**
 * Fetch recent email dispatch logs for Admin Inspection
 */
export async function getEmailDispatchLogs(): Promise<EmailNotification[]> {
  try {
    const logsCol = collection(db, 'emailLogs');
    const q = query(logsCol, orderBy('timestamp', 'desc'), limit(25));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as EmailNotification[];
  } catch (err) {
    console.warn('Could not read emailLogs from Firestore, returning empty list:', err);
    return [];
  }
}
