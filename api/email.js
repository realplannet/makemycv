/**
 * POST /api/email
 * Body: { email, fileId }
 * Sends PDF + DOCX download links to user's email via Resend
 */

const { getSession, getSignedUrl } = require('../lib/supabase');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, fileId } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }
  if (!fileId) {
    return res.status(400).json({ error: 'fileId required' });
  }

  try {
    // Get session from Supabase
    const session = await getSession(fileId);
    if (!session) return res.status(404).json({ error: 'Files not found or expired' });

    // Check 24hr expiry
    const age = Date.now() - new Date(session.created_at).getTime();
    if (age > 24 * 60 * 60 * 1000) {
      return res.status(410).json({ error: 'Files expired. Links are valid for 24 hours only.' });
    }

    // Generate signed URLs
    const [pdfUrl, docxUrl] = await Promise.all([
      getSignedUrl(session.pdf_path),
      getSignedUrl(session.docx_path),
    ]);

    const name = session.name?.replace(/_/g, ' ') || 'Your CV';

    // Send via Resend
    const { Resend } = require('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);

    await resend.emails.send({
      from: `MakeMyCV <noreply@${process.env.EMAIL_DOMAIN || 'realplannet.com'}>`,
      to: email,
      subject: `Your CV is ready — ${name}`,
      html: buildEmailHTML(name, pdfUrl, docxUrl),
    });

    // Save email to session record
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    await supabase.from('cv_sessions').update({ email }).eq('file_id', fileId);

    res.json({ success: true });
  } catch (err) {
    console.error('Email error:', err);
    res.status(500).json({ error: 'Failed to send email. Please download directly.' });
  }
};

function buildEmailHTML(name, pdfUrl, docxUrl) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#050508;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#050508;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0d0d12;border-radius:12px;border:1px solid rgba(201,168,76,0.2);overflow:hidden;max-width:560px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:#0a0a10;padding:28px 36px;border-bottom:1px solid rgba(255,255,255,0.06);">
            <p style="margin:0;font-size:18px;font-weight:600;color:#c9a84c;letter-spacing:0.05em;">MakeMyCV</p>
            <p style="margin:2px 0 0;font-size:11px;color:#555;text-transform:uppercase;letter-spacing:0.1em;">by Real Plannet</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px;">
            <p style="margin:0 0 8px;font-size:22px;font-weight:300;color:#fff;">Your CV is ready, ${name.split('_')[0]}!</p>
            <p style="margin:0 0 28px;font-size:15px;color:#888;line-height:1.6;">Your professionally crafted CV has been generated. Download both files below — links are valid for <strong style="color:#e8e4dc;">24 hours</strong>.</p>

            <!-- PDF Button -->
            <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:12px;">
              <tr>
                <td align="center" style="background:#e05a5a;border-radius:8px;">
                  <a href="${pdfUrl}" style="display:block;padding:14px 24px;color:#fff;text-decoration:none;font-size:16px;font-weight:600;">
                    ⬇ Download PDF
                  </a>
                </td>
              </tr>
            </table>

            <!-- Word Button -->
            <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px;">
              <tr>
                <td align="center" style="background:#2b5eb7;border-radius:8px;">
                  <a href="${docxUrl}" style="display:block;padding:14px 24px;color:#fff;text-decoration:none;font-size:16px;font-weight:600;">
                    ⬇ Download Word (.docx)
                  </a>
                </td>
              </tr>
            </table>

            <hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:0 0 24px;">

            <!-- Upsell -->
            <table cellpadding="0" cellspacing="0" width="100%" style="background:rgba(201,168,76,0.06);border:1px solid rgba(201,168,76,0.2);border-radius:8px;margin-bottom:24px;">
              <tr>
                <td style="padding:20px;">
                  <p style="margin:0 0 4px;font-size:13px;color:#c9a84c;text-transform:uppercase;letter-spacing:0.1em;">Add-on · ₹49</p>
                  <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#fff;">LinkedIn Headline + Summary</p>
                  <p style="margin:0 0 14px;font-size:13px;color:#888;line-height:1.6;">AI-crafted LinkedIn profile copy that gets recruiters to click.</p>
                  <a href="https://makemycv-phi.vercel.app" style="display:inline-block;background:#c9a84c;color:#0a0a0a;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600;text-decoration:none;">Get LinkedIn Copy →</a>
                </td>
              </tr>
            </table>

            <p style="margin:0;font-size:13px;color:#444;line-height:1.6;">Need help? Reply to this email or write to <a href="mailto:hello@realplannet.com" style="color:#c9a84c;">hello@realplannet.com</a></p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#0a0a10;padding:20px 36px;border-top:1px solid rgba(255,255,255,0.06);">
            <p style="margin:0;font-size:12px;color:#444;line-height:1.6;">
              © 2026 Real Plannet · Udyam Registered MSME · Bangalore, India<br>
              <a href="https://realplannet.com" style="color:#555;">realplannet.com</a> ·
              <a href="https://makemycv-phi.vercel.app/privacy" style="color:#555;">Privacy Policy</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
