module.exports = {
  register({ strapi }) {
    const extensionService = strapi.plugin('graphql').service('extension');

    strapi.db.lifecycles.subscribe({
      models: ['api::article.article'],
      
      beforeFindMany(event) {
        const isAdminPanel = event.params && event.params._isAdminRequest;
        
        if (!isAdminPanel) {
          if (!event.params.filters) {
            event.params.filters = {};
          }
          
          const hasStatusFilter = event.params.filters.status !== undefined;
          
          if (!hasStatusFilter) {
            event.params.filters.status = 'published';
          }
        }
      },
      
      beforeFindOne(event) {
        const isAdminPanel = event.params && event.params._isAdminRequest;
        
        if (!isAdminPanel) {
          if (!event.params.filters) {
            event.params.filters = {};
          }
          
          const hasStatusFilter = event.params.filters.status !== undefined;
          
          if (!hasStatusFilter) {
            event.params.filters.status = 'published';
          }
        }
      },
    });

    extensionService.use({
      typeDefs: `
        type ArticleResponseCollection {
          data: [ArticleEntity]
          meta: ResponseCollectionMeta
        }

        extend type Query {
          popularArticles(limit: Int): ArticleResponseCollection
        }

        extend type Mutation {
          archiveArticle(id: ID!): ArticleEntity
        }
      `,
      resolvers: {
        Query: {
          popularArticles: {
            resolve: async (parent, args, context) => {
              const { limit = 10 } = args;
              const validLimit = Math.max(1, Math.min(parseInt(limit) || 10, 100));
              
              const results = await strapi.entityService.findMany('api::article.article', {
                sort: { likes: 'desc' },
                limit: validLimit,
                populate: {
                  author: {
                    populate: '*',
                  },
                },
              });
              
              return {
                data: results,
                meta: {
                  pagination: {
                    page: 1,
                    pageSize: validLimit,
                    pageCount: 1,
                    total: results.length,
                  },
                },
              };
            },
          },
        },
        Mutation: {
          archiveArticle: {
            resolve: async (parent, args, context) => {
              const { id } = args;
              
              const article = await strapi.entityService.findOne('api::article.article', id, {
                filters: {},
              });
              if (!article) {
                throw new Error('Article not found');
              }
              
              if (article.status === 'archived') {
                return article;
              }
              
              const updatedArticle = await strapi.entityService.update('api::article.article', id, {
                data: {
                  status: 'archived',
                },
                populate: {
                  author: {
                    populate: '*',
                  },
                },
              });
              
              return updatedArticle;
            },
          },
        },
      },
      resolversConfig: {
        'Query.popularArticles': {
          auth: false,
        },
        'Mutation.archiveArticle': {
          auth: {
            scope: ['api::article.article.update'],
          },
        },
      },
    });
  },

  bootstrap() {},
};
