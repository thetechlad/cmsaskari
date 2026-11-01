export default {
  routes: [
    {
      method: 'GET',
      path: '/whatsapp-webhook',
      handler: 'whatsapp-webhook.verify',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/whatsapp-webhook',
      handler: 'whatsapp-webhook.receive',
      config: { auth: false },
    },
  ],
};
