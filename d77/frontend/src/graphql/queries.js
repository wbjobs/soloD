import { gql } from '@apollo/client';

export const GET_USERS = gql`
  query GetUsers {
    users {
      id
      name
      email
      avatar
    }
  }
`;

export const GET_SHORTEST_PATH = gql`
  query GetShortestPath($fromId: ID!, $toId: ID!) {
    shortestPath(fromId: $fromId, toId: $toId) {
      nodes {
        id
        name
        avatar
      }
      length
    }
  }
`;

export const GET_MUTUAL_FRIENDS = gql`
  query GetMutualFriends($userId1: ID!, $userId2: ID!) {
    mutualFriends(userId1: $userId1, userId2: $userId2) {
      id
      name
      avatar
      email
    }
  }
`;

export const GET_KEY_INFLUENCERS = gql`
  query GetKeyInfluencers($limit: Int) {
    keyInfluencers(limit: $limit) {
      user {
        id
        name
        avatar
      }
      degree
    }
  }
`;

export const GET_SUBGRAPH = gql`
  query GetSubGraph($centerId: ID!, $depth: Int) {
    getSubGraph(centerId: $centerId, depth: $depth) {
      nodes {
        id
        name
        avatar
      }
      links {
        id
        from {
          id
          name
        }
        to {
          id
          name
        }
      }
    }
  }
`;

export const GENERATE_SAMPLE_DATA = gql`
  mutation GenerateSampleData($userCount: Int!, $friendshipCount: Int!) {
    generateSampleData(userCount: $userCount, friendshipCount: $friendshipCount)
  }
`;

export const CLEAR_ALL_DATA = gql`
  mutation ClearAllData {
    clearAllData
  }
`;
