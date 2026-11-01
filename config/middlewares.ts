import type { Core } from '@strapi/strapi';

const config: Core.Config.Middlewares = [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  {
    name: 'strapi::cors',
    config: {
      origin: [
        'http://localhost:5173',
        'http://localhost:5174',
        'https://askariconsultant.com',
        'https://www.askariconsultant.com',
      ],
    },
  },
  'strapi::poweredBy',
  'strapi::query',
  {
    name: 'strapi::body',
    // Needed so the WhatsApp webhook controller (src/api/whatsapp-webhook)
    // can verify Meta's X-Hub-Signature-256 header, which is computed over
    // the exact raw request bytes — the parsed/re-serialized JSON body
    // would not byte-match and verification would always fail.
    config: {
      includeUnparsed: true,
    },
  },
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];

export default config;
