export default {
  routes: [
    {
      method: 'POST',
      path: '/leads/verify',
      handler: 'lead.verifyLead',
      config: { auth: false },
    },
  ],
};
