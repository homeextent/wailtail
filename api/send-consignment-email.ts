/**
 * Vercel Serverless Function: /api/send-consignment-email
 * Proxies new consignment applications, consignment receipts,
 * bidder welcome emails, and private vehicle inquiries.
 */

export type ConsignmentEmailType = 'consignment' | 'inquiry' | 'consignment_receipt' | 'welcome_bidder';

export interface ConsignmentEmailPayload {
  type?: ConsignmentEmailType;
  // Consignment & Consignment Receipt fields
  year?: string | number;
  make?: string;
  model?: string;
  generation?: string;
  vin?: string;
  mileage?: string;
  transmission?: string;
  reserveExpectation?: string;
  locationCity?: string;
  locationProvince?: string;
  locationCountry?: string;
  location?: string;
  sellerName?: string;
  sellerEmail?: string;
  sellerPhone?: string;
  notes?: string;
  registeredUserId?: string;
  isRegisteredUser?: boolean;
  registeredUserRole?: string;
  applicationId?: string;
  appId?: string;
  id?: string;
  // Inquiry fields
  name?: string;
  email?: string;
  phone?: string;
  topic?: string;
  message?: string;
  vehicleTitle?: string;
  auctionTitle?: string;
  // Welcome Bidder fields
  displayName?: string;
  userEmail?: string;
}

function sendJson(res: any, status: number, data: any) {
  if (res.setHeader) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(status).json(data);
  }

  res.statusCode = status;
  res.end(JSON.stringify(data));
}

async function parseRequestBody(req: any): Promise<any> {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  // Handle stream if body is not parsed by runtime
  return new Promise((resolve) => {
    let bodyData = '';
    req.on('data', (chunk: any) => {
      bodyData += chunk;
    });
    req.on('end', () => {
      try {
        resolve(bodyData ? JSON.parse(bodyData) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

async function sendEmailNotification({
  to,
  subject,
  html
}: {
  to: string;
  subject: string;
  html: string;
}) {
  const from = process.env.RESEND_FROM_EMAIL || 'Wailtail Curation <consignments@wailtail.com>';

  // Dispatch via Resend (SDK if available or direct Resend HTTP API)
  if (process.env.RESEND_API_KEY) {
    try {
      // @ts-ignore
      const { Resend } = await import('resend').catch(() => ({ Resend: null }));
      if (Resend) {
        const resend = new Resend(process.env.RESEND_API_KEY);
        if (resend?.emails?.send) {
          const resendData = await resend.emails.send({
            from,
            to: [to],
            subject,
            html
          });
          return { success: true, provider: 'resend-sdk', data: resendData };
        }
      }
    } catch (sdkErr) {
      console.warn('[send-email] Resend SDK error, falling back to HTTP API:', sdkErr);
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html
      })
    });

    if (!resendRes.ok) {
      const errorText = await resendRes.text();
      console.warn('[send-email] Resend HTTP delivery returned non-ok:', errorText);
    }
    return { success: resendRes.ok, provider: 'resend-http' };
  } else if (process.env.SENDGRID_API_KEY) {
    // Dispatch via SendGrid if API key is present
    const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: process.env.SENDGRID_FROM_EMAIL || 'consignments@wailtail.com', name: 'Wailtail Curation' },
        subject,
        content: [{ type: 'text/html', value: html }]
      })
    });

    if (!sgRes.ok) {
      const errorText = await sgRes.text();
      console.warn('[send-email] SendGrid delivery returned non-ok:', errorText);
    }
    return { success: sgRes.ok, provider: 'sendgrid' };
  } else {
    // Development or unconfigured mail provider: record mock delivery
    console.log(`[send-email] Simulated email dispatch to ${to} for "${subject}"`);
    return { success: true, provider: 'simulated' };
  }
}

export default async function handler(req: any, res: any) {
  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    if (res.setHeader) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    if (typeof res.status === 'function') {
      return res.status(200).end();
    }
    res.statusCode = 200;
    return res.end();
  }

  if (req.method && req.method !== 'POST') {
    return sendJson(res, 405, { success: false, error: 'Method not allowed. Use POST.' });
  }

  try {
    const payload = await parseRequestBody(req);
    const type = payload?.type || 'consignment';

    const adminEmail =
      process.env.ADMIN_NOTIFICATION_EMAIL ||
      process.env.ADMIN_EMAIL ||
      process.env.WAILTAIL_ADMIN_EMAIL ||
      'contact@wailtail.com';

    // Handle Private Vehicle Inquiries
    if (type === 'inquiry') {
      const {
        name,
        email,
        phone,
        topic,
        message,
        vehicleTitle,
        auctionTitle
      } = payload || {};

      if (!email || !message) {
        return sendJson(res, 400, {
          success: false,
          error: 'Missing required inquiry parameters: email and message are required.'
        });
      }

      const inquiryName = name || 'Registered Member';
      const inquiryEmail = email;
      const inquiryPhone = phone || 'Not provided';
      const inquiryTopic = topic || 'General Vehicle Question';
      const targetVehicleTitle = vehicleTitle || auctionTitle || 'Wailtail Auction Lot';
      const inquiryMessage = message || '';

      const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>New Private Inquiry Received — Wailtail Auctions</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f4f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #181f25; }
    .container { max-width: 620px; margin: 24px auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; }
    .header { background-color: #121619; padding: 24px; text-align: center; border-bottom: 3px solid #b91c1c; }
    .brand { font-size: 24px; font-weight: 900; letter-spacing: -0.5px; color: #ffffff; text-transform: uppercase; margin: 0; }
    .sub { font-size: 11px; font-weight: 700; letter-spacing: 2px; color: #94a3b8; text-transform: uppercase; margin-top: 4px; }
    .body { padding: 32px 28px; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 16px; background-color: #fef3c7; color: #92400e; }
    .h1 { font-size: 20px; font-weight: 800; color: #0f172a; margin: 0 0 16px 0; }
    .inquiry-table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
    .inquiry-table th, .inquiry-table td { padding: 10px 14px; text-align: left; border-bottom: 1px solid #e2e8f0; }
    .inquiry-table tr:last-child th, .inquiry-table tr:last-child td { border-bottom: none; }
    .inquiry-table th { width: 35%; color: #64748b; font-weight: 600; background-color: #f1f5f9; }
    .inquiry-table td { color: #0f172a; font-weight: 700; }
    .footer { background-color: #f8fafc; padding: 20px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="brand">WAILTAIL</div>
      <div class="sub">New Private Inquiry Received — Wailtail Auctions</div>
    </div>
    <div class="body">
      <div class="badge">PRIVATE BUYER INQUIRY</div>
      <h1 class="h1">New Private Inquiry Received — Wailtail Auctions</h1>
      <p style="font-size: 14px; color: #475569; margin-top: 0;">
        A prospective buyer has submitted a private inquiry regarding an active vehicle listing on Wailtail.
      </p>

      <table class="inquiry-table">
        <tbody>
          <tr>
            <th>Inquirer Name</th>
            <td>${inquiryName}</td>
          </tr>
          <tr>
            <th>Email</th>
            <td><a href="mailto:${inquiryEmail}">${inquiryEmail}</a></td>
          </tr>
          <tr>
            <th>Phone</th>
            <td>${inquiryPhone}</td>
          </tr>
          <tr>
            <th>Inquiry Topic</th>
            <td>${inquiryTopic}</td>
          </tr>
          <tr>
            <th>Target Vehicle Title</th>
            <td>${targetVehicleTitle}</td>
          </tr>
          <tr>
            <th>Inquiry Message</th>
            <td style="font-weight: 400; line-height: 1.5; white-space: pre-wrap;">${inquiryMessage}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="footer">
      <p>Wailtail Auction Platform • Private Buyer Inquiries</p>
      <p>Submitted at: ${new Date().toUTCString()}</p>
    </div>
  </div>
</body>
</html>
      `.trim();

      const subject = `[Private Inquiry] ${inquiryTopic} — ${targetVehicleTitle} (${inquiryName})`;
      await sendEmailNotification({
        to: adminEmail,
        subject,
        html: htmlContent
      });

      return sendJson(res, 200, {
        success: true,
        message: 'Inquiry email notification processed successfully.',
        recipient: adminEmail,
        vehicleTitle: targetVehicleTitle
      });
    }

    // Handle Seller Consignment Receipt Email (type === 'consignment_receipt')
    if (type === 'consignment_receipt') {
      const {
        year,
        make,
        model,
        generation,
        vin,
        mileage,
        transmission,
        reserveExpectation,
        locationCity,
        locationProvince,
        locationCountry,
        location,
        sellerName,
        sellerEmail,
        email,
        sellerPhone,
        notes
      } = payload || {};

      const recipientEmail = (sellerEmail || email || '').trim();
      if (!recipientEmail) {
        return sendJson(res, 400, {
          success: false,
          error: 'Missing required parameter: sellerEmail is required for consignment receipt.'
        });
      }

      const vehicleTitle = [year, make, model].filter(Boolean).join(' ').trim() || 'Your Vehicle';
      const vehicleWithGen = [year, make, model, generation ? `(${generation})` : ''].filter(Boolean).join(' ').trim();
      const subject = `[Wailtail] Consignment Application Received — ${vehicleTitle}`;
      const formattedLoc =
        location ||
        [locationCity, locationProvince, locationCountry].filter(Boolean).join(', ') ||
        'Not specified';

      const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #020617; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc; }
    .container { max-width: 600px; margin: 32px auto; background: #0f172a; border-radius: 16px; overflow: hidden; border: 1px solid #1e293b; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
    .header { background-color: #020617; padding: 32px 24px; text-align: center; border-bottom: 2px solid #10b981; }
    .brand { font-size: 26px; font-weight: 900; letter-spacing: -0.5px; color: #ffffff; text-transform: uppercase; margin: 0; }
    .sub { font-size: 11px; font-weight: 700; letter-spacing: 2px; color: #10b981; text-transform: uppercase; margin-top: 6px; }
    .body { padding: 36px 28px; }
    .badge { display: inline-block; padding: 5px 12px; border-radius: 9999px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 18px; background-color: #064e3b; color: #34d399; border: 1px solid #059669; }
    .badge-gold { background-color: #451a03; color: #fbbf24; border: 1px solid #d97706; }
    .h1 { font-size: 22px; font-weight: 800; color: #f8fafc; margin: 0 0 16px 0; line-height: 1.3; }
    .p { font-size: 14px; line-height: 1.6; color: #94a3b8; margin: 0 0 20px 0; }
    .highlight-card { background-color: #020617; border: 1px solid #1e293b; border-radius: 12px; padding: 20px; margin: 24px 0; }
    .section-title { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: #fbbf24; margin-bottom: 14px; }
    .spec-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .spec-table tr { border-bottom: 1px solid #1e293b; }
    .spec-table tr:last-child { border-bottom: none; }
    .spec-table td { padding: 9px 0; }
    .spec-label { color: #64748b; font-weight: 600; width: 40%; }
    .spec-val { color: #f1f5f9; font-weight: 700; text-align: right; }
    .timeline-box { background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(2, 6, 23, 0.4) 100%); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 12px; padding: 18px; margin: 24px 0; }
    .timeline-title { font-size: 13px; font-weight: 800; color: #34d399; margin: 0 0 6px 0; text-transform: uppercase; letter-spacing: 0.5px; }
    .timeline-desc { font-size: 13px; color: #cbd5e1; margin: 0; line-height: 1.5; }
    .value-props { display: table; width: 100%; margin: 24px 0; background-color: #020617; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; }
    .value-prop-item { display: table-cell; width: 50%; padding: 16px; text-align: center; border-right: 1px solid #1e293b; }
    .value-prop-item:last-child { border-right: none; }
    .value-prop-metric { font-size: 18px; font-weight: 900; color: #10b981; }
    .value-prop-metric-gold { color: #fbbf24; }
    .value-prop-label { font-size: 11px; color: #94a3b8; font-weight: 600; margin-top: 4px; text-transform: uppercase; }
    .footer { background-color: #020617; padding: 24px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #1e293b; }
    .footer p { margin: 4px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="brand">WAILTAIL</div>
      <div class="sub">Curated Vehicle Consignment Intake</div>
    </div>
    <div class="body">
      <div class="badge">APPLICATION CONFIRMED</div>
      <h1 class="h1">We Received Your Consignment Application</h1>
      <p class="p">
        Hello ${sellerName || 'there'}, thank you for submitting your <strong style="color: #ffffff;">${vehicleWithGen}</strong> to Wailtail Auctions. We have received your application and logged your vehicle specifications in our curation pipeline.
      </p>

      <div class="timeline-box">
        <div class="timeline-title">⏱ 24–48 Hour Curation Review</div>
        <p class="timeline-desc">
          Our auction curation specialists evaluate every submission for authenticity, provenance, and market presentation. You will receive an evaluation update via email at <strong>${recipientEmail}</strong> within <strong>24 to 48 hours</strong>.
        </p>
      </div>

      <div class="value-props">
        <div class="value-prop-item">
          <div class="value-prop-metric">0%</div>
          <div class="value-prop-label">Seller Commission</div>
        </div>
        <div class="value-prop-item">
          <div class="value-prop-metric value-prop-metric-gold">100% CAD</div>
          <div class="value-prop-label">Direct Settlement</div>
        </div>
      </div>

      <div class="highlight-card">
        <div class="section-title">Submitted Vehicle Particulars</div>
        <table class="spec-table">
          <tr>
            <td class="spec-label">Year / Make / Model</td>
            <td class="spec-val">${vehicleTitle}</td>
          </tr>
          ${generation ? `
          <tr>
            <td class="spec-label">Generation / Chassis</td>
            <td class="spec-val">${generation}</td>
          </tr>` : ''}
          <tr>
            <td class="spec-label">VIN / Chassis #</td>
            <td class="spec-val" style="font-family: monospace;">${vin || 'Under Review'}</td>
          </tr>
          <tr>
            <td class="spec-label">Mileage / Odometer</td>
            <td class="spec-val">${mileage || 'Not specified'}</td>
          </tr>
          <tr>
            <td class="spec-label">Transmission</td>
            <td class="spec-val">${transmission || 'Manual'}</td>
          </tr>
          <tr>
            <td class="spec-label">Location</td>
            <td class="spec-val">${formattedLoc}</td>
          </tr>
          <tr>
            <td class="spec-label">Reserve Expectation</td>
            <td class="spec-val" style="color: #fbbf24;">${reserveExpectation || 'No Reserve / Open'}</td>
          </tr>
        </table>
      </div>

      ${notes ? `
      <div class="highlight-card" style="margin-top: 0;">
        <div class="section-title">Vehicle Highlights & Notes</div>
        <div style="font-size: 13px; color: #94a3b8; line-height: 1.5; white-space: pre-wrap;">${notes}</div>
      </div>` : ''}

      <p class="p" style="margin-top: 24px; font-size: 13px;">
        If you have high-resolution photography, maintenance records, or questions while your application is under review, please reply directly to this email or reach us at <a href="mailto:consignments@wailtail.com" style="color: #34d399; text-decoration: none;">consignments@wailtail.com</a>.
      </p>
    </div>
    <div class="footer">
      <p><strong>Wailtail Auctions</strong> • Curated Single-Car Classic &amp; Enthusiast Auctions</p>
      <p>Canadian Settlements in CAD • 0% Seller Commission</p>
      <p style="margin-top: 8px;">Received on: ${new Date().toUTCString()}</p>
    </div>
  </div>
</body>
</html>
      `.trim();

      await sendEmailNotification({
        to: recipientEmail,
        subject,
        html: htmlContent
      });

      return sendJson(res, 200, {
        success: true,
        message: 'Consignment receipt email sent successfully.',
        recipient: recipientEmail,
        vehicleTitle
      });
    }

    // Handle New Bidder Welcome Email (type === 'welcome_bidder')
    if (type === 'welcome_bidder') {
      const {
        email,
        userEmail,
        sellerEmail,
        displayName,
        name
      } = payload || {};

      const recipientEmail = (email || userEmail || sellerEmail || '').trim();
      if (!recipientEmail) {
        return sendJson(res, 400, {
          success: false,
          error: 'Missing required parameter: email is required for welcome email.'
        });
      }

      const recipientName = displayName || name || recipientEmail.split('@')[0] || 'Member';
      const subject = 'Welcome to Wailtail Auctions — Registration Confirmed';

      const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #020617; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc; }
    .container { max-width: 600px; margin: 32px auto; background: #0f172a; border-radius: 16px; overflow: hidden; border: 1px solid #1e293b; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
    .header { background-color: #020617; padding: 32px 24px; text-align: center; border-bottom: 2px solid #10b981; }
    .brand { font-size: 26px; font-weight: 900; letter-spacing: -0.5px; color: #ffffff; text-transform: uppercase; margin: 0; }
    .sub { font-size: 11px; font-weight: 700; letter-spacing: 2px; color: #10b981; text-transform: uppercase; margin-top: 6px; }
    .body { padding: 36px 28px; }
    .badge { display: inline-block; padding: 5px 12px; border-radius: 9999px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 18px; background-color: #064e3b; color: #34d399; border: 1px solid #059669; }
    .h1 { font-size: 22px; font-weight: 800; color: #f8fafc; margin: 0 0 16px 0; line-height: 1.3; }
    .p { font-size: 14px; line-height: 1.6; color: #94a3b8; margin: 0 0 20px 0; }
    .highlight-card { background-color: #020617; border: 1px solid #1e293b; border-radius: 12px; padding: 20px; margin: 20px 0; }
    .feature-row { display: flex; align-items: flex-start; margin-bottom: 16px; }
    .feature-row:last-child { margin-bottom: 0; }
    .feature-icon { font-size: 18px; line-height: 1; margin-right: 12px; margin-top: 2px; flex-shrink: 0; }
    .feature-title { font-size: 14px; font-weight: 800; color: #f1f5f9; margin-bottom: 4px; }
    .feature-desc { font-size: 13px; color: #94a3b8; line-height: 1.5; margin: 0; }
    .cta-container { text-align: center; margin: 32px 0 20px 0; }
    .cta-btn { display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 800; letter-spacing: 0.5px; padding: 14px 28px; border-radius: 10px; box-shadow: 0 4px 14px 0 rgba(16, 185, 129, 0.4); text-transform: uppercase; }
    .value-props { display: table; width: 100%; margin: 24px 0; background-color: #020617; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; }
    .value-prop-item { display: table-cell; width: 50%; padding: 16px; text-align: center; border-right: 1px solid #1e293b; }
    .value-prop-item:last-child { border-right: none; }
    .value-prop-metric { font-size: 20px; font-weight: 900; color: #10b981; }
    .value-prop-metric-gold { color: #fbbf24; }
    .value-prop-label { font-size: 11px; color: #94a3b8; font-weight: 600; margin-top: 4px; text-transform: uppercase; }
    .footer { background-color: #020617; padding: 24px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #1e293b; }
    .footer p { margin: 4px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="brand">WAILTAIL</div>
      <div class="sub">Canadian Enthusiast Vehicle Auctions</div>
    </div>
    <div class="body">
      <div class="badge">REGISTRATION CONFIRMED</div>
      <h1 class="h1">Welcome to Wailtail, ${recipientName}!</h1>
      <p class="p">
        Your member registration is confirmed. You now have full access to Canada's dedicated live auction platform for classic, sports, and enthusiast automobiles.
      </p>

      <div class="value-props">
        <div class="value-prop-item">
          <div class="value-prop-metric">0%</div>
          <div class="value-prop-label">Buyer's Fee Advantage</div>
        </div>
        <div class="value-prop-item">
          <div class="value-prop-metric value-prop-metric-gold">100% CAD</div>
          <div class="value-prop-label">Canadian Settlements</div>
        </div>
      </div>

      <div class="highlight-card">
        <div class="feature-row">
          <div class="feature-icon">🛡️</div>
          <div>
            <div class="feature-title">0% Buyer Fee Advantage</div>
            <p class="feature-desc">Bid with confidence knowing what you bid is what you pay. Unlike legacy platforms charging 5%–10% buyer premiums, Wailtail has no buyer fees on active catalog lots.</p>
          </div>
        </div>
        <div class="feature-row" style="margin-top: 16px;">
          <div class="feature-icon">🍁</div>
          <div>
            <div class="feature-title">Transparent Canadian CAD Settlements</div>
            <p class="feature-desc">All bidding, reserve targets, and vehicle transfers are conducted cleanly in Canadian Dollars (CAD) with zero cross-border exchange penalties or conversion fees.</p>
          </div>
        </div>
        <div class="feature-row" style="margin-top: 16px;">
          <div class="feature-icon">⚡</div>
          <div>
            <div class="feature-title">Anti-Snipe Bid Clock & Direct Q&amp;A</div>
            <p class="feature-desc">Every active auction features 2-minute dynamic anti-sniping protection and direct public commentary to verify vehicle provenance with consignors.</p>
          </div>
        </div>
      </div>

      <div class="cta-container">
        <a href="https://www.wailtail.com" class="cta-btn">Browse Active Auction Lots</a>
      </div>

      <p class="p" style="text-align: center; font-size: 12px; color: #64748b; margin-top: 16px;">
        Have a vehicle you would like to consign? Consignors pay 0% listing commission. Visit our catalog to submit your vehicle for curation.
      </p>
    </div>
    <div class="footer">
      <p><strong>Wailtail Auctions</strong> • Single-Car Live Collector Auctions</p>
      <p>Direct Canadian Settlements • 0% Buyer Premium • Verified Bidders</p>
      <p style="margin-top: 8px;">Registered to: ${recipientEmail}</p>
    </div>
  </div>
</body>
</html>
      `.trim();

      await sendEmailNotification({
        to: recipientEmail,
        subject,
        html: htmlContent
      });

      return sendJson(res, 200, {
        success: true,
        message: 'Welcome bidder email processed successfully.',
        recipient: recipientEmail
      });
    }

    // Handle Consignment Applications (type === 'consignment')
    const {
      year,
      make,
      model,
      generation,
      vin,
      mileage,
      transmission,
      reserveExpectation,
      locationCity,
      locationProvince,
      locationCountry,
      location,
      sellerName,
      sellerEmail,
      sellerPhone,
      notes,
      registeredUserId,
      isRegisteredUser,
      registeredUserRole,
      applicationId
    } = payload || {};

    const appId = applicationId || payload?.appId || payload?.id || '';

    if (!sellerEmail || !make || !model) {
      return sendJson(res, 400, {
        success: false,
        error: 'Missing required consignment parameters: sellerEmail, make, model are required.'
      });
    }

    const vehicleTitle = [year, make, model, generation ? `(${generation})` : '']
      .filter(Boolean)
      .join(' ')
      .trim();

    const formattedLoc =
      location ||
      [locationCity, locationProvince, locationCountry].filter(Boolean).join(', ') ||
      'Unspecified';

    const userRoleBadge = isRegisteredUser
      ? `REGISTERED (${registeredUserRole || 'USER'})`
      : 'GUEST / UNREGISTERED';

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>New Vehicle Consignment Application</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f4f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #181f25; }
    .container { max-width: 620px; margin: 24px auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; }
    .header { background-color: #121619; padding: 24px; text-align: center; border-bottom: 3px solid #b91c1c; }
    .brand { font-size: 24px; font-weight: 900; letter-spacing: -0.5px; color: #ffffff; text-transform: uppercase; margin: 0; }
    .sub { font-size: 11px; font-weight: 700; letter-spacing: 2px; color: #94a3b8; text-transform: uppercase; margin-top: 4px; }
    .body { padding: 32px 28px; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 16px; }
    .badge-emerald { background-color: #d1fae5; color: #065f46; }
    .badge-amber { background-color: #fef3c7; color: #92400e; }
    .h1 { font-size: 20px; font-weight: 800; color: #0f172a; margin: 0 0 16px 0; }
    .section-title { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #b91c1c; margin: 20px 0 8px 0; }
    .card { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #edf2f7; font-size: 13px; }
    .row:last-child { border-bottom: none; }
    .label { color: #64748b; font-weight: 600; }
    .val { color: #0f172a; font-weight: 700; text-align: right; }
    .footer { background-color: #f8fafc; padding: 20px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="brand">WAILTAIL</div>
      <div class="sub">Curated Vehicle Consignment Intake</div>
    </div>
    <div class="body">
      <div class="badge ${isRegisteredUser ? 'badge-emerald' : 'badge-amber'}">${userRoleBadge}</div>
      <h1 class="h1">New Consignment Submission: ${vehicleTitle}</h1>
      <p style="font-size: 14px; color: #475569; margin-top: 0;">
        A consignor has submitted a new vehicle lot for curation and auction scheduling on Wailtail.
      </p>

      <div class="section-title">1. Vehicle Particulars & Taxonomy</div>
      <div class="card">
        <div class="row"><span class="label">Year:</span><span class="val">${year || 'N/A'}</span></div>
        <div class="row"><span class="label">Make:</span><span class="val">${make || 'N/A'}</span></div>
        <div class="row"><span class="label">Model:</span><span class="val">${model || 'N/A'}</span></div>
        <div class="row"><span class="label">Generation / Chassis:</span><span class="val">${generation || 'Standard / Unspecified'}</span></div>
        <div class="row"><span class="label">VIN:</span><span class="val" style="font-family: monospace;">${vin || 'Not provided'}</span></div>
        <div class="row"><span class="label">Mileage / Odometer:</span><span class="val">${mileage || 'Not provided'}</span></div>
        <div class="row"><span class="label">Transmission:</span><span class="val">${transmission || 'Manual'}</span></div>
        <div class="row"><span class="label">Reserve Expectation:</span><span class="val">${reserveExpectation || 'No Reserve / Open'}</span></div>
      </div>

      <div class="section-title">2. Location Details</div>
      <div class="card">
        <div class="row"><span class="label">City:</span><span class="val">${locationCity || 'N/A'}</span></div>
        <div class="row"><span class="label">Province / State:</span><span class="val">${locationProvince || 'N/A'}</span></div>
        <div class="row"><span class="label">Country:</span><span class="val">${locationCountry || 'Canada'}</span></div>
        <div class="row"><span class="label">Formatted Location:</span><span class="val">${formattedLoc}</span></div>
      </div>

      <div class="section-title">3. Consignor Details</div>
      <div class="card">
        <div class="row"><span class="label">Name:</span><span class="val">${sellerName || 'N/A'}</span></div>
        <div class="row"><span class="label">Email:</span><span class="val"><a href="mailto:${sellerEmail}">${sellerEmail}</a></span></div>
        <div class="row"><span class="label">Phone:</span><span class="val">${sellerPhone || 'Not provided'}</span></div>
        <div class="row"><span class="label">User UID:</span><span class="val" style="font-family: monospace;">${registeredUserId || 'Guest'}</span></div>
        <div class="row"><span class="label">Platform Role:</span><span class="val">${registeredUserRole || 'GUEST'}</span></div>
      </div>

      ${notes ? `
        <div class="section-title">4. Notes & Vehicle Highlights</div>
        <div class="card" style="font-size: 13px; line-height: 1.5; color: #334155; white-space: pre-wrap;">${notes}</div>
      ` : ''}

      <div class="section-title">Consignment Pipeline Actions</div>
      <div style="margin: 24px 0 12px 0; text-align: center;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto; width: 100%;">
          <tr>
            <td align="center" style="padding: 6px 0;">
              <a href="https://www.wailtail.com/admin?tab=consignments&id=${appId}&action=approve" 
                 style="display: inline-block; background-color: #059669; color: #ffffff; padding: 12px 20px; border-radius: 8px; font-weight: 700; font-size: 13px; text-decoration: none; margin: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                ✔ Review &amp; Approve Submission
              </a>
              <a href="https://www.wailtail.com/admin?tab=consignments&id=${appId}&action=reject" 
                 style="display: inline-block; background-color: #ffffff; color: #dc2626; border: 1.5px solid #dc2626; padding: 10px 18px; border-radius: 8px; font-weight: 700; font-size: 13px; text-decoration: none; margin: 4px;">
                ✖ Reject Consignment
              </a>
            </td>
          </tr>
        </table>
        <p style="font-size: 11px; color: #64748b; margin: 8px 0 0 0;">
          Direct 1-click triage links to canonical admin portal.
        </p>
      </div>
    </div>
    <div class="footer">
      <p>Wailtail Auction Platform • Single-Car Live Auctions</p>
      <p>Application ID: ${appId || 'N/A'} • Submitted at: ${new Date().toUTCString()}</p>
    </div>
  </div>
</body>
</html>
    `.trim();

    const subject = `[Consignment Intake] ${vehicleTitle} - ${sellerName}`;
    await sendEmailNotification({
      to: adminEmail,
      subject,
      html: htmlContent
    });

    return sendJson(res, 200, {
      success: true,
      message: 'Consignment notification processed successfully.',
      recipient: adminEmail,
      vehicleTitle
    });
  } catch (err: any) {
    console.error('[send-consignment-email] Error handling email notification:', err);
    return sendJson(res, 500, {
      success: false,
      error: err?.message || 'Failed to process email notification.'
    });
  }
}

