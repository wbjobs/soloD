const { getSession } = require('../config/neo4j');
const neo4j = require('neo4j-driver');

const resolvers = {
  Query: {
    users: async () => {
      const session = getSession();
      try {
        const result = await session.run('MATCH (u:User) RETURN u');
        return result.records.map(record => record.get('u').properties);
      } finally {
        await session.close();
      }
    },

    user: async (_, { id }) => {
      const session = getSession();
      try {
        const result = await session.run(
          'MATCH (u:User) WHERE id(u) = $id RETURN u',
          { id: neo4j.int(id) }
        );
        if (result.records.length === 0) return null;
        return result.records[0].get('u').properties;
      } finally {
        await session.close();
      }
    },

    shortestPath: async (_, { fromId, toId }) => {
      const session = getSession();
      try {
        const result = await session.run(
          `MATCH (from:User), (to:User)
           WHERE id(from) = $fromId AND id(to) = $toId
           MATCH path = shortestPath((from)-[:FRIEND_WITH*]-(to))
           RETURN nodes(path) AS nodes, length(path) AS length`,
          { fromId: neo4j.int(fromId), toId: neo4j.int(toId) }
        );

        if (result.records.length === 0) {
          return { nodes: [], length: -1 };
        }

        const record = result.records[0];
        const nodes = record.get('nodes').map(node => node.properties);
        const length = record.get('length');

        return { nodes, length };
      } finally {
        await session.close();
      }
    },

    mutualFriends: async (_, { userId1, userId2 }) => {
      const session = getSession();
      try {
        const result = await session.run(
          `MATCH (u1:User)-[:FRIEND_WITH]-(friend)-[:FRIEND_WITH]-(u2:User)
           WHERE id(u1) = $userId1 AND id(u2) = $userId2
           RETURN DISTINCT friend`,
          { userId1: neo4j.int(userId1), userId2: neo4j.int(userId2) }
        );

        return result.records.map(record => record.get('friend').properties);
      } finally {
        await session.close();
      }
    },

    keyInfluencers: async (_, { limit = 10 }) => {
      const session = getSession();
      try {
        const result = await session.run(
          `MATCH (u:User)
           OPTIONAL MATCH (u)-[:FRIEND_WITH]-(friend)
           WITH u, count(friend) AS degree
           ORDER BY degree DESC
           LIMIT $limit
           RETURN u, degree`,
          { limit: neo4j.int(limit) }
        );

        return result.records.map(record => ({
          user: record.get('u').properties,
          degree: record.get('degree'),
          betweenness: 0,
          closeness: 0,
          eigenvector: 0
        }));
      } finally {
        await session.close();
      }
    },

    getSubGraph: async (_, { centerId, depth = 2 }) => {
      const session = getSession();
      try {
        const nodesResult = await session.run(
          `MATCH (center:User) WHERE id(center) = $centerId
           MATCH path = (center)-[:FRIEND_WITH*1..$depth]-(connected:User)
           WITH DISTINCT connected AS u
           RETURN u
           UNION
           MATCH (center:User) WHERE id(center) = $centerId
           RETURN center AS u`,
          { centerId: neo4j.int(centerId), depth: neo4j.int(depth) }
        );

        const nodes = nodesResult.records.map(record => record.get('u').properties);
        const nodeIds = nodes.map(n => n.id);

        const linksResult = await session.run(
          `MATCH (u1:User)-[f:FRIEND_WITH]-(u2:User)
           WHERE id(u1) IN $nodeIds AND id(u2) IN $nodeIds AND id(u1) < id(u2)
           RETURN f, u1, u2`,
          { nodeIds: nodeIds.map(id => neo4j.int(id)) }
        );

        const links = linksResult.records.map(record => ({
          id: record.get('f').identity.toString(),
          from: record.get('u1').properties,
          to: record.get('u2').properties,
          since: record.get('f').properties.since
        }));

        return { nodes, links };
      } finally {
        await session.close();
      }
    }
  },

  Mutation: {
    createUser: async (_, { name, email, avatar }) => {
      const session = getSession();
      try {
        const result = await session.run(
          'CREATE (u:User {name: $name, email: $email, avatar: $avatar}) RETURN u',
          { name, email, avatar: avatar || '' }
        );
        const user = result.records[0].get('u');
        return { ...user.properties, id: user.identity.toString() };
      } finally {
        await session.close();
      }
    },

    createFriendship: async (_, { fromId, toId, since }) => {
      const session = getSession();
      try {
        const result = await session.run(
          `MATCH (from:User), (to:User)
           WHERE id(from) = $fromId AND id(to) = $toId
           CREATE (from)-[f:FRIEND_WITH {since: $since}]->(to)
           RETURN f, from, to`,
          { fromId: neo4j.int(fromId), toId: neo4j.int(toId), since: since || new Date().toISOString() }
        );
        const record = result.records[0];
        return {
          id: record.get('f').identity.toString(),
          from: record.get('from').properties,
          to: record.get('to').properties,
          since: record.get('f').properties.since
        };
      } finally {
        await session.close();
      }
    },

    generateSampleData: async (_, { userCount, friendshipCount }) => {
      const session = getSession();
      try {
        const names = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry', 'Ivy', 'Jack',
                       'Kate', 'Leo', 'Mia', 'Noah', 'Olivia', 'Paul', 'Quinn', 'Rachel', 'Sam', 'Tina'];
        
        for (let i = 0; i < userCount; i++) {
          const name = names[i % names.length] + (i >= names.length ? Math.floor(i / names.length) : '');
          await session.run(
            'CREATE (:User {name: $name, email: $email, avatar: $avatar})',
            {
              name,
              email: `${name.toLowerCase()}@example.com`,
              avatar: `https://i.pravatar.cc/150?img=${(i % 70) + 1}`
            }
          );
        }

        for (let i = 0; i < friendshipCount; i++) {
          const from = Math.floor(Math.random() * userCount);
          let to = Math.floor(Math.random() * userCount);
          while (to === from) {
            to = Math.floor(Math.random() * userCount);
          }
          
          await session.run(
            `MATCH (u1:User), (u2:User)
             WITH u1, u2 SKIP $from LIMIT 1
             WITH u1, u2 SKIP $to LIMIT 1
             MERGE (u1)-[:FRIEND_WITH {since: $since}]->(u2)`,
            {
              from: neo4j.int(from),
              to: neo4j.int(to),
              since: new Date().toISOString()
            }
          );
        }

        return true;
      } finally {
        await session.close();
      }
    },

    clearAllData: async () => {
      const session = getSession();
      try {
        await session.run('MATCH (n) DETACH DELETE n');
        return true;
      } finally {
        await session.close();
      }
    }
  }
};

module.exports = resolvers;
