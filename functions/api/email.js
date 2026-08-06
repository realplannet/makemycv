/**
 * POST /api/email
 * Body: { email, fileId }
 * Sends the Word (.docx) download link to user's email via Resend.
 * Links point at /api/download (streams from D1 directly) instead of an
 * object-storage signed URL — see lib/db.js.
 */
import { Resend } from 'resend';
import { getSession, d1 } from '../../lib/db.js';
import { json, readJson } from '../../lib/http.js';

const SITE_URL = 'https://makemycv.realplannet.com';

export async function onRequestPost({ request, env }) {
  const { email, fileId } = await readJson(request);

  if (!email || !email.includes('@')) {
    return json({ error: 'Valid email required' }, 400);
  }
  if (!fileId) {
    return json({ error: 'fileId required' }, 400);
  }

  try {
    const session = await getSession(fileId, env);
    if (!session) return json({ error: 'Files not found or expired' }, 404);

    const age = Date.now() - new Date(session.created_at).getTime();
    if (age > 24 * 60 * 60 * 1000) {
      return json({ error: 'Files expired. Links are valid for 24 hours only.' }, 410);
    }

    const docxUrl = `${SITE_URL}/api/download?fileId=${fileId}&type=docx`;
    const name = session.name?.replace(/_/g, ' ') || 'Your CV';

    const resend = new Resend(env.RESEND_API_KEY);

    await resend.emails.send({
      from: `MakeMyCV <noreply@${env.EMAIL_DOMAIN || 'realplannet.com'}>`,
      to: email,
      subject: `Your CV is ready — ${name}`,
      html: buildEmailHTML(name, docxUrl),
    });

    // Save email to session record
    await d1('update cv_sessions set email = ? where file_id = ?', [email, fileId], env);

    return json({ success: true });
  } catch (err) {
    console.error('Email error:', err);
    return json({ error: 'Failed to send email. Please download directly.' }, 500);
  }
}

function buildEmailHTML(name, docxUrl) {
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
            <p style="margin:0 0 28px;font-size:15px;color:#888;line-height:1.6;">Your professionally crafted CV has been generated. Download it below — link is valid for <strong style="color:#e8e4dc;">24 hours</strong>.</p>

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
                  <a href="https://makemycv.realplannet.com" style="display:inline-block;background:#c9a84c;color:#0a0a0a;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600;text-decoration:none;">Get LinkedIn Copy →</a>
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
              <a href="https://makemycv.realplannet.com/privacy" style="color:#555;">Privacy Policy</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
