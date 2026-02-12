// Talent & vendor application handler — Vercel Serverless Function
// Inserts to Supabase via PostgREST. Zero npm deps.
// Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const ALLOWED_ORIGINS = [
  'https://thirty3labs.com',
  'https://www.thirty3labs.com',
];

const VALID_TYPES = ['talent', 'vendor'];

const TALENT_DISCIPLINES = [
  'Photography', 'Videography', 'Directing', 'Graphic Design', 'Motion Design',
  'Web Development', 'App Development', 'Production Management', 'Event Management',
  'AV Engineering', 'Sound Design', 'Lighting Design', 'Fabrication', 'Styling', 'Other',
];

const VENDOR_TYPES = [
  'Fabrication & Build', 'Print & Signage', 'AV & Equipment Rental',
  'Catering & F&B', 'Venue', 'Furniture & Decor Rental',
  'Staffing', 'Transportation & Logistics', 'Other',
];

function stripHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, '').trim();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidUrl(url) {
  if (!url) return true;
  try { new URL(url); return true; } catch { return false; }
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const isLocal = origin.startsWith('http://localhost');
  const allowed = ALLOWED_ORIGINS.includes(origin) || isLocal;
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body) return res.status(400).json({ error: 'Missing request body' });

    // Honeypot — if bot filled the hidden field, silently accept
    if (body.website_url) {
      return res.status(200).json({ ok: true });
    }

    const errors = [];
    const type = stripHtml(body.type);
    const name = stripHtml(body.name);
    const email = stripHtml(body.email);
    const bio = stripHtml(body.bio);

    if (!VALID_TYPES.includes(type)) errors.push('Invalid application type');
    if (!name || name.length < 2) errors.push('Name is required (min 2 characters)');
    if (!email || !isValidEmail(email)) errors.push('Valid email is required');
    if (!bio || bio.length < 50) errors.push('Bio must be at least 50 characters');

    if (type === 'talent') {
      const discipline = stripHtml(body.primary_discipline);
      if (!discipline || !TALENT_DISCIPLINES.includes(discipline)) {
        errors.push('Primary discipline is required');
      }
    }
    if (type === 'vendor') {
      const vendorType = stripHtml(body.vendor_type);
      if (!vendorType || !VENDOR_TYPES.includes(vendorType)) {
        errors.push('Vendor type is required');
      }
    }

    if (body.website && !isValidUrl(body.website)) errors.push('Invalid website URL');
    if (body.portfolio_url && !isValidUrl(body.portfolio_url)) errors.push('Invalid portfolio URL');
    if (body.linkedin_url && !isValidUrl(body.linkedin_url)) errors.push('Invalid LinkedIn URL');

    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const row = {
      type,
      name,
      email,
      phone: stripHtml(body.phone) || null,
      location: stripHtml(body.location) || null,
      company: stripHtml(body.company) || null,
      website: stripHtml(body.website) || null,
      portfolio_url: stripHtml(body.portfolio_url) || null,
      linkedin_url: stripHtml(body.linkedin_url) || null,
      bio,
      referral_source: stripHtml(body.referral_source) || null,
      ip_address: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || null,
      user_agent: req.headers['user-agent'] || null,
    };

    if (type === 'talent') {
      row.primary_discipline = stripHtml(body.primary_discipline);
      row.disciplines = Array.isArray(body.disciplines)
        ? body.disciplines.map(stripHtml).filter(Boolean)
        : null;
      row.years_experience = Number(body.years_experience) || null;
    }

    if (type === 'vendor') {
      row.vendor_type = stripHtml(body.vendor_type);
      row.services_offered = Array.isArray(body.services_offered)
        ? body.services_offered.map(stripHtml).filter(Boolean)
        : null;
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/applications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(row),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Supabase insert error:', response.status, text);
      return res.status(500).json({ error: 'Failed to save application' });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Application handler error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
