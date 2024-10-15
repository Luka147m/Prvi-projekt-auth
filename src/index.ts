import pool from './database';
import express, { Request, Response } from 'express';
import path from 'path';

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../dist/public')));
app.set('views', path.join(__dirname, '../dist/views'));
app.set("view engine", "pug");

const externalUrl = process.env.EXTERNAL_URL || null;

app.use((req: Request, res: Response, next) => {
  res.locals.externalUrl = externalUrl || 'http://localhost:8000';
  next();
});


app.get('/', async (req: Request, res: Response) => {
  res.render("index")
})

app.get('/generateTicket', async (req: Request, res: Response) => {
  
  const baseUrl = process.env.NODE_ENV === 'production' 
  ? 'https://prvi-projekt-auth-web.onrender.com' 
  : `http://localhost:${port}`;

  res.render("generateTicket", {
    baseUrl: baseUrl
  })
})

interface TicketParams {
  vatin: string;
  firstName: string;
  lastName: string;
}

async function generateTicket({ vatin, firstName, lastName }: TicketParams): Promise<string> {
  const client = await pool.connect();
  let ticketId: string;
  try {
    await client.query('BEGIN'); 
    const result = await client.query('SELECT p.ticket_count FROM people AS p WHERE p.vatin = $1', [vatin]);
    const ticketCount = result.rows.length !== 0 ? result.rows[0].ticket_count : 0;
    
    if (ticketCount >= 3) {
      throw new Error('Za jedan OIB se smije generirati do (uključivo) 3 ulaznice.');
    }
    
    await client.query(
      'INSERT INTO people (vatin, ticket_count) VALUES ($1, $2) ON CONFLICT (vatin) DO UPDATE SET ticket_count = people.ticket_count + 1',
      [vatin, ticketCount + 1]
    );

    const ticketInsertResult = await client.query(
      'INSERT INTO tickets (vatin, first_name, last_name) VALUES ($1, $2, $3) RETURNING id',
      [vatin, firstName, lastName]
    );

    ticketId = ticketInsertResult.rows[0].id;
    
    await client.query('INSERT INTO tickets (vatin, first_name, last_name) VALUES ($1, $2, $3)', [vatin, firstName, lastName]);

    await client.query('COMMIT');
    // console.log('Ticket generated successfully with ID:', ticketId);
    return ticketId;
  } catch (error) {
    await client.query('ROLLBACK');
    // console.error('Error generating ticket:', error);
    throw error;
  } finally {
    client.release();
  }
}

app.post('/generateTicket', async (req: Request, res: Response): Promise<Response> => {
  const { vatin, firstName, lastName }: TicketParams = req.body;

  if (!vatin || !firstName || !lastName) {
    return res.status(400).json({ error: 'Missing required fields: vatin, firstName, lastName' });
  }

  try {
    const ticketId = await generateTicket({ vatin, firstName, lastName });
    // console.log(ticketId)
    return res.status(201).json({ message: 'Ticket generated successfully', ticketId: ticketId });
  } catch (error) {
    // console.error('Failed to generate ticket:', error);
    
    const errorMessage = (error as Error).message || 'Failed to generate ticket';
    return res.status(500).json({ error: errorMessage });
  }
});


app.get('/ticketCount', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT COUNT(*) AS count FROM tickets');
    res.json(result.rows[0]);
  } catch (error) {
    // console.error(error);
    res.status(500).send('Server Error');
  }
});

app.get('/ticket/:id', async (req: Request, res: Response) => {
  const ticketId = req.params.id;

  try {
    const result = await pool.query(
      'SELECT vatin, first_name, last_name FROM tickets WHERE id = $1',
      [ticketId]
    );

    if (result.rows.length === 0) {
      return res.status(404).send('Ticket not found');
    }

    const ticket = result.rows[0];

    const baseUrl = process.env.NODE_ENV === 'production' 
      ? 'https://prvi-projekt-auth-web.onrender.com' 
      : `http://localhost:${port}/`;

    res.render('ticket', {
      ticketId: ticketId,
      vatin: ticket.vatin,
      firstName: ticket.first_name,
      lastName: ticket.last_name,
      baseUrl: baseUrl
    });
  } catch (error) {
    console.error('Error retrieving ticket:', error);
    res.status(500).send('Server Error');
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

  

