const http = require('http');
const redis = require('redis');

const redisClient = redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379
});




const port = process.env.PORT || 3000;
const host = process.env.HOST || 'localhost';

const requestListener = async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  try {
    switch (req.url) {
      case "/register":
        if (req.method === 'POST') {
          const buffers = [];
          for await (const chunk of req) {
            buffers.push(chunk);
          }
          const dataString = Buffer.concat(buffers).toString();
          const { email, username, password } = JSON.parse(dataString);
          if (!email) {
            res.writeHead(400);
            res.end(JSON.stringify({ message: "email is required!" }));
            return;
          }
          if (!username) {
            res.writeHead(400);
            res.end(JSON.stringify({ message: "username is required!" }));
            return;
          }
          if (!password) {
            res.writeHead(400);
            res.end(JSON.stringify({ message: "password is required!" }));
            return;
          }
          res.writeHead(204);
          res.end();
          return;
        }
        console.log(' iam outt')
        res.writeHead(404);
        res.end(JSON.stringify({ error: "Resource not found" }));
        break;
      default:
        res.writeHead(404);
        res.end(JSON.stringify({ error: "Resource not found" }));
    }
  } catch (error) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: "Unhandled error" }));
  }
};

const server = http.createServer(requestListener);
server.listen(port, host, () => {
  console.log(`Server is running on http://${host}:${port}`);
});