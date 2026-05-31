const { ApolloServer } = require('@apollo/server');
const { startStandaloneServer } = require('@apollo/server/standalone');
const cors = require('cors');
const typeDefs = require('./schema/typeDefs');
const resolvers = require('./schema/resolvers');
const { driver } = require('./config/neo4j');
require('dotenv').config();

const server = new ApolloServer({
  typeDefs,
  resolvers,
});

const startServer = async () => {
  try {
    await driver.verifyConnectivity();
    console.log('✅ Connected to Neo4j successfully');

    const { url } = await startStandaloneServer(server, {
      listen: { port: process.env.PORT || 4000 },
      context: async ({ req }) => ({ req }),
    });

    console.log(`🚀 Server ready at: ${url}`);
    console.log(`📊 Graphql Playground available at: ${url}`);
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
