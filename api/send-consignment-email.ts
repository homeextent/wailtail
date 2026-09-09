/**
 * Vercel Serverless Function: /api/send-consignment-email
 * Proxies new consignment applications and private vehicle inquiries
 * to the platform admin inbox.
 */

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

