/**
 * dropOldIndexes.js
 * 
 * RUN ONCE: node src/scripts/dropOldIndexes.js
 * 
 * Ye script purane wrong indexes drop karta hai aur
 * Mongoose ko nayi correct indexes banane deta hai.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || process.env.DATABASE_URL;

async function dropOldIndexes() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected.\n');

    const db = mongoose.connection.db;
    const collection = db.collection('candidates');

    // Saare existing indexes dekho
    const indexes = await collection.indexes();
    console.log('Existing indexes:');
    indexes.forEach(idx => console.log(' -', idx.name, JSON.stringify(idx.key)));
    console.log('');

    // Drop karne wale indexes — ye wrong/old hain
    const toDrop = [
      'adminId_1_passportNumber_1',   // old compound — NOT sparse, causes null duplicates
      'adminId_1_controlNumber_1',    // old compound — NOT sparse
      'passportNumber_1',             // simple non-compound sparse — galat tha
      'controlNumber_1',              // simple non-compound sparse — galat tha
    ];

    for (const idxName of toDrop) {
      const exists = indexes.find(i => i.name === idxName);
      if (exists) {
        await collection.dropIndex(idxName);
        console.log(`✓ Dropped: ${idxName}`);
      } else {
        console.log(`- Skipped (not found): ${idxName}`);
      }
    }

    console.log('\nDone! Ab server restart karo — Mongoose naye correct indexes banayega.');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

dropOldIndexes();