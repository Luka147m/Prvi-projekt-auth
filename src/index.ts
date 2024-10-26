import pool from './database';
import express, { Request, Response } from 'express';
import path from 'path';
import https from 'https';
import fs from 'fs';
import { auth, requiresAuth } from 'express-openid-connect';
// import session from 'express-session';
import { expressjwt, GetVerificationKey } from 'express-jwt';
import jwksRsa from 'jwks-rsa';
// import axios from 'axios';
import QRCode from 'qrcode';

const app = express();

// const sessionSecret = process.env.SESSION_SECRET || 'cookiemonsterateallthecookies';
const externalUrl = process.env.EXTERNAL_URL || null;
const port = externalUrl && process.env.PORT ? parseInt(process.env.PORT) : 8000;
const baseUrl = process.env.NODE_ENV === 'production'
  ? 'https://prvi-projekt-auth-web.onrender.com'
  : `https://localhost:${port}`;

declare module 'express-session' {
  interface SessionData {
    accessToken: string;
  }
}

const config = {
  authRequired: false,
  idpLogout: true,
  secret: process.env.SECRET,
  baseURL: baseUrl,
  clientID: process.env.CLIENT_ID,
  issuerBaseURL: process.env.AUTH0_DOMAIN,
  clientSecret: process.env.CLIENT_SECRET,
  authorizationParams: {
    response_type: 'code',
  },
};

const checkJwt = expressjwt({
  secret: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`
  }) as GetVerificationKey,
  audience: process.env.AUTH0_AUDIENCE,
  issuer: process.env.AUTH0_DOMAIN + "/",
  algorithms: ['RS256']
});


// if (process.env.NODE_ENV === 'development') {
//   app.use(session({
//     secret: sessionSecret,
//     resave: false,
//     saveUninitialized: true,
//     cookie: {
//       secure: true,
//       httpOnly: true,
//       maxAge: 60 * 60 * 1000
//     }
//   }));
// }

app.use(auth(config));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../dist/public')));
app.set('views', path.join(__dirname, '../dist/views'));
app.set("view engine", "pug");

app.use((req: Request, res: Response, next) => {
  res.locals.externalUrl = externalUrl || 'http://localhost:8000';
  next();
});


app.get('/', async (req: Request, res: Response) => {
  const user = JSON.stringify(req.oidc.user);
  // if (process.env.NODE_ENV === 'development') {
  //   if (req.oidc.isAuthenticated()) {
  //     try {
  //       const accessToken = await getAccessToken();
  //       // console.log('Access Token:', accessToken);
  //       req.session.accessToken = accessToken;
  //     } catch (error) {
  //       // console.error('Error retrieving access token:', error);
  //     }
  //   }
  // }
  res.render('index', { user });
})

// async function getAccessToken(): Promise<string> {
//   var options = {
//     method: 'POST',
//     url: `${process.env.AUTH0_DOMAIN}/oauth/token`,
//     headers: { 'content-type': 'application/x-www-form-urlencoded' },
//     data: new URLSearchParams({
//       grant_type: 'client_credentials',
//       client_id: `${process.env.M2M_CLIENT_ID}`,
//       client_secret: `${process.env.M2M_CLIENT_SECRET}`,
//       audience: `${process.env.AUTH0_AUDIENCE}`
//     })
//   };

//   try {
//     const response = await axios.request(options);
//     // console.log(response.data);
//     return response.data.access_token;
//   } catch (error) {
//     // console.error('Error retrieving access token:', error);
//     throw new Error('Failed to retrieve access token');
//   }
// }

app.get("/login", (req: Request, res: Response) => {
  res.oidc.login({
    returnTo: '/',
    authorizationParams: { screen_hint: "signup" },
  });
});

app.get("/logout", (req: Request, res: Response) => {
  req.session.destroy(err => {
    if (err) {
      return console.error('Failed to destroy session:', err);
    }
    res.oidc.logout({
      returnTo: '/'
    });
  });
});

app.get('/generateTicket', async (req: Request, res: Response) => {
  const user = JSON.stringify(req.oidc.user);
  res.render("generateTicket", {
    baseUrl: baseUrl,
    user: user,
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

app.post('/generateTicket', checkJwt, async (req: Request, res: Response): Promise<Response> => {
  const { vatin, firstName, lastName } = Object.fromEntries(
    Object.entries(req.body).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
  ) as unknown as TicketParams;

  if (!vatin || !firstName || !lastName) {
    return res.status(400).json({ error: 'Nedostaje neka od vrijednosti u tijelu zahtjeva: vatin, firstName, lastName' });
  }

  const vatinPattern = /^\d{11}$/;
  const alphaPattern = /^[A-Za-zčćžšđČĆŽŠĐ]+$/u;

  if (!vatinPattern.test(vatin)) {
    return res.status(400).json({ error: 'VATIN mora biti broj od 11 znamenaka.' });
  }

  if (!alphaPattern.test(firstName)) {
    return res.status(400).json({ error: 'Ime mora sadržavati samo slova.' });
  }

  if (!alphaPattern.test(lastName)) {
    return res.status(400).json({ error: 'Prezime mora sadržavati samo slova.' });
  }

  try {
    const ticketId = await generateTicket({ vatin, firstName, lastName });
    const qrCodeData = await QRCode.toDataURL(`${baseUrl}/ticket/${ticketId}`);
    // console.log(ticketId)
    return res.status(201).json({ message: 'Ulaznica uspješno generirana', ticketId: ticketId, ticketQRcodeUrl: `${baseUrl}/ticket/${ticketId}`, qrCode: qrCodeData });
  } catch (error) {
    // console.error('Failed to generate ticket:', error);

    const errorMessage = (error as Error).message || 'Ulaznica nije uspješno generirana';
    return res.status(500).json({ error: errorMessage });
  }
});

app.use((err: any, req: any, res: any, next: any) => {
  if (err.name === 'UnauthorizedError') {
    // console.error('JWT validation error:', err);
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Invalid or missing token'
    });
  }
  console.error('err:', err);
  return res.status(500).json({
    success: false,
    message: 'Internal Server Error'
  });
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

app.get('/ticket/:id', requiresAuth(), async (req: Request, res: Response) => {
  const ticketId = req.params.id;
  const user = JSON.stringify(req.oidc.user);

  try {
    const result = await pool.query(
      'SELECT vatin, first_name, last_name, created_at FROM tickets WHERE id = $1',
      [ticketId]
    );

    if (result.rows.length === 0) {
      return res.status(404).send('Ulaznica nije pronađena');
    }

    const ticket = result.rows[0];

    res.render('ticket', {
      ticketId: ticketId,
      vatin: ticket.vatin,
      firstName: ticket.first_name,
      lastName: ticket.last_name,
      timestamp: ticket.created_at,
      baseUrl: baseUrl,
      user: user
    });
  } catch (error) {
    console.error('Error retrieving ticket:', error);
    res.status(500).send('Server Error');
  }
});

if (externalUrl) {
  const hostname = '0.0.0.0';
  app.listen(port, hostname, () => {
    console.log(`Server running locally at http://${hostname}:${port}/`);
    console.log(`Also available from outside via ${externalUrl}`);
  });
} else {
  https.createServer({
    key: fs.readFileSync('server.key'),
    cert: fs.readFileSync('server.cert')
  }, app)
    .listen(port, function () {
      console.log(`Server running locally at https://localhost:${port}/`);
    });
}
