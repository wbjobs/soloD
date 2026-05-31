const typeDefs = `#graphql
  type User {
    id: ID!
    name: String!
    email: String!
    avatar: String
  }

  type Friendship {
    id: ID!
    from: User!
    to: User!
    since: String
  }

  type PathNode {
    user: User!
    depth: Int!
  }

  type ShortestPath {
    nodes: [User!]!
    length: Int!
  }

  type InfluenceScore {
    user: User!
    degree: Int!
    betweenness: Float
    closeness: Float
    eigenvector: Float
  }

  type Query {
    users: [User!]!
    user(id: ID!): User
    shortestPath(fromId: ID!, toId: ID!): ShortestPath
    mutualFriends(userId1: ID!, userId2: ID!): [User!]!
    keyInfluencers(limit: Int): [InfluenceScore!]!
    getSubGraph(centerId: ID!, depth: Int): SubGraph!
  }

  type SubGraph {
    nodes: [User!]!
    links: [Friendship!]!
  }

  type Mutation {
    createUser(name: String!, email: String!, avatar: String): User!
    createFriendship(fromId: ID!, toId: ID!, since: String): Friendship!
    generateSampleData(userCount: Int!, friendshipCount: Int!): Boolean!
    clearAllData: Boolean!
  }
`;

module.exports = typeDefs;
