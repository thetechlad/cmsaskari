export default {
  routes: [
    {
      method: 'PUT',
      path: '/students/me/profile',
      handler: 'student.updateMyProfile',
    },
  ],
};
