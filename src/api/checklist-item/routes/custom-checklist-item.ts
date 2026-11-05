export default {
  routes: [
    {
      method: 'PUT',
      path: '/checklist-items/:id/replace',
      handler: 'checklist-item.replace',
    },
    {
      method: 'POST',
      path: '/checklist-items/:id/request-help',
      handler: 'checklist-item.requestHelp',
    },
  ],
};
