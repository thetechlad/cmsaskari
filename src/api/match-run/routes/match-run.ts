import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::match-run.match-run', {
  only: ['find', 'findOne'],
});
