export default {
  routes: [
    {
      method: 'POST',
      path: '/applications/mine',
      handler: 'application.createMine',
    },
    {
      method: 'PUT',
      path: '/applications/:id/move',
      handler: 'application.moveMine',
    },
  ],
};
