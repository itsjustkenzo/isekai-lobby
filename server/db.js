import 'dotenv/config';
import dns from 'node:dns';
import { MongoClient } from 'mongodb';

// Local resolver (127.0.0.1) refuses SRV lookups needed by mongodb+srv:// URIs
dns.setServers(['8.8.8.8', '8.8.4.4']);

let client;
export async function connectDatabase() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const database = client.db(process.env.MONGODB_DATABASE || 'isekai-lobby');
  await database.command({ ping: 1 });
  const users = database.collection('users');
  await users.createIndex({ username: 1 }, { unique: true });
  const sessions = database.collection('sessions');
  await sessions.createIndex({ tokenHash: 1 }, { unique: true });
  await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  const itemDeletionGuards = database.collection('itemDeletionGuards');
  await itemDeletionGuards.createIndex({ userId: 1 }, { unique: true });
  const playerInventories = database.collection('playerInventories');
  await playerInventories.createIndex({ playerId: 1, worldId: 1 }, { unique: true });
  const generatedMapDrafts = database.collection('generatedMapDrafts');
  // Keep existing prototypes while allowing multiple maps per creator.
  try { await generatedMapDrafts.dropIndex('userId_1'); } catch (error) { if (error.code !== 27 && error.code !== 26) throw error; }
  await generatedMapDrafts.createIndex({ userId: 1, updatedAt: -1 });
  const worlds = database.collection('worlds');
  const terrainCollections = database.collection('terrainCollections');
  await terrainCollections.createIndex({ userId: 1, updatedAt: -1 });
  await worlds.createIndex({ userId: 1 }, { unique: true });
  // Player-designed houses, numbered by slot (0–9) per player; the world stores the slot digit.
  const houses = database.collection('houses');
  await houses.createIndex({ userId: 1, slot: 1 }, { unique: true });
  // Placeable assets: AI-generated ones are public (searchable by everyone), uploads are private.
  // Each player's "My assets" is the assetLibrary id list on their user document.
  const assets = database.collection('assets');
  await assets.createIndex({ public: 1, keywords: 1, createdAt: -1 });
  await assets.createIndex({ createdBy: 1 });
  // Creators' NPC characters: a pixel sprite made from an upload, a name, a description and a prompt.
  const npcs = database.collection('npcs');
  await npcs.createIndex({ userId: 1, createdAt: 1 });
  return { database, terrainCollections, generatedMapDrafts, itemDeletionGuards, playerInventories, games: database.collection(process.env.MONGODB_COLLECTION || 'game'), users, sessions, worlds, houses, assets, npcs };
}

export async function closeDatabase() {
  await client?.close();
}

export async function withDatabaseTransaction(work) {
  const session = client.startSession();
  try { return await session.withTransaction(() => work(session)); }
  finally { await session.endSession(); }
}
