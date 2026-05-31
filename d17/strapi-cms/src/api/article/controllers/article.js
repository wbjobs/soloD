const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::article.article', ({ strapi }) => ({
  async find(ctx) {
    const { query } = ctx;
    
    if (!query.filters) {
      query.filters = {};
    }
    
    const hasStatusFilter = query.filters.status !== undefined;
    
    if (!hasStatusFilter) {
      query.filters.status = 'published';
    }
    
    return await super.find(ctx);
  },
  
  async findOne(ctx) {
    const { id } = ctx.params;
    const { query } = ctx;
    
    if (!query.filters) {
      query.filters = {};
    }
    
    const hasStatusFilter = query.filters.status !== undefined;
    
    if (!hasStatusFilter) {
      query.filters.status = 'published';
    }
    
    return await super.findOne(ctx);
  },
}));
