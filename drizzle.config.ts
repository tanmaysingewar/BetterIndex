import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

import {config} from 'dotenv';

config({path: '.env.local'});
console.log('Database URL:', process.env.DATABASE_URL);


export default defineConfig({
    out: './drizzle',
    schema: './database/schema/**/*.ts',
    dialect: 'postgresql',
    dbCredentials: {
        url: process.env.DATABASE_URL!,
    },
});
