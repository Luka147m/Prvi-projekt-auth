import pool from './database';
import express, { Request, Response } from 'express';
import path from 'path';

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'src/client')));
app.set("view engine", "ejs");

const externalUrl = process.env.EXTERNAL_URL || null;

app.use((req, res, next) => {
  res.locals.externalUrl = externalUrl || 'http://localhost:8000';
  next();
});


app.get('/', async (req: Request, res: Response) => {
  res.render("src/index")
})

app.get('/getdata', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM test_users LIMIT 1;');
    const message = result.rows[0]?.name || 'No data found';
    res.json({ message });
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({ message: 'Error retrieving data' });
  }
});


const port = externalUrl && process.env.PORT ? parseInt(process.env.PORT) : 8000;

if (externalUrl) {
  const hostname = '0.0.0.0';
  app.listen(port, hostname, () => {
    console.log(`Server running locally at http://${hostname}:${port}/`);
    console.log(`Also available from outside via ${externalUrl}`);
  });
} else {
  app.listen(port, () => {
    console.log(`Server running locally at http://localhost:${port}/`);
  });
}

  

