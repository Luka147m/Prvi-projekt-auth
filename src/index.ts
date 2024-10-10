import pool from './database';
import express, { Request, Response } from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// Route to fetch data from database
app.get('/getdata', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM test_users LIMIT 1;');
    console.log(result)
    const message = result.rows[0]?.name || 'No data found';
    res.json({ message });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error retrieving data' });
  }
});

// Serve frontend
app.use(express.static('src/client'));

// Start the server
const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

