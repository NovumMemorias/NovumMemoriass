const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const fs = require('fs');

const app = express();
app.set('trust proxy', 1);
console.log("Trust proxy is set to:", app.get('trust proxy'));

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          'https://apis.google.com',
          'https://accounts.google.com',
          "'unsafe-inline'"
        ],
        imgSrc: ["'self'", 'data:', 'https://*.googleusercontent.com', 'https://lh3.googleusercontent.com'],
        mediaSrc: ["'self'", 'https://*.googleusercontent.com'],
        frameSrc: [
          "'self'",
          'https://accounts.google.com',
          'https://content.googleapis.com',
          'https://content-photoslibrary.googleapis.com'
        ],
        connectSrc: [
          "'self'",
          'https://*.googleapis.com',
          'https://*.google.com'
        ]
      }
    },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }
  })
);

app.use(cors());
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

app.use(express.static(path.join(__dirname), {
  setHeaders: (res) => {
    res.set('Cache-Control', 'public, max-age=86400');
  }
}));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Endpoint para servir videos con Range Requests (para archivos locales)
app.get('/video/:name', (req, res) => {
  const videoPath = path.join(__dirname, req.params.name);
  fs.stat(videoPath, (err, stats) => {
    if (err) {
      console.error(err);
      return res.sendStatus(404);
    }
    
    const range = req.headers.range;
    if (!range) {
      res.writeHead(200, {
        'Content-Length': stats.size,
        'Content-Type': 'video/mp4'
      });
      fs.createReadStream(videoPath).pipe(res);
    } else {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
      const chunkSize = (end - start) + 1;
      const file = fs.createReadStream(videoPath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'video/mp4'
      });
      file.pipe(res);
    }
  });
});

// Integración con Socket.IO
const http = require('http');
const server = http.createServer(app);
const socketIo = require('socket.io');
const io = socketIo(server);

io.on('connection', (socket) => {
  console.log('Cliente conectado');
  socket.on('updatePhotos', () => {
    console.log('Actualización de fotos recibida, notificando a clientes...');
    io.emit('refreshPhotos');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
