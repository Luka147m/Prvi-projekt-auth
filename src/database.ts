import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

let pool: Pool;

if (process.env.DATABASE_URL) {
    // production
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        },
    });
} else {
    // local
    pool = new Pool({
        user: process.env.DB_USER,   
        host: process.env.DB_HOST,   
        database: process.env.DB_NAME,   
        password: process.env.DB_PASSWORD,   
        port: 5432,
        ssl: {
            rejectUnauthorized: false
        },
    });
}

export default pool;
