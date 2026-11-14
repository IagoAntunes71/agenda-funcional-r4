import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
    throw new Error('A variável DATABASE_URL não está definida no .env.local');
}

export const sql = neon(process.env.DATABASE_URL);