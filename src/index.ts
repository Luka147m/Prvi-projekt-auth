import pool from './database';
import express, { Request, Response } from 'express';

const app = express();
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
const externalUrl = process.env.RENDER_EXTERNAL_URL;
const port = externalUrl && process.env.PORT ? parseInt(process.env.PORT) : 8000;

if (externalUrl) {   
    const hostname = '0.0.0.0';
    app.listen(port, hostname, () => {
      console.log(`Server locally running at http://${hostname}:${port}/ and 
      from outside on ${externalUrl}`);   
    }); 
} 
  
