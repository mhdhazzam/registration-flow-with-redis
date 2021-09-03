const redis = require('redis');
const bcrypt = require('bcrypt');

// Add redis stream commands
redis.add_command('xadd');
redis.add_command('xreadgroup');
redis.add_command('xgroup');
redis.addCommand('xack');

// Create redis client
const redisClient = redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379
});

redisClient.on('connect', () => console.log('Connected Successfully'));

redisClient.on('error', (err) => console.log('Redis Client Error', err));


const incomingStreamName = 'registration-request';
const streamGroupName = 'registration-flow';
const outgoingStreamName = 'registration-result';

const serviceIdentifier = 's-0';

// Create the stream group and create the stream if is not exist before
redisClient.xgroup('CREATE', incomingStreamName, streamGroupName, '$', 'MKSTREAM', (err, res) => {
  if (err && err.message !== 'BUSYGROUP Consumer Group name already exists') {
    console.log(`couldn't create ${streamGroupName} group`);
    console.log('Error: ', err);
    process.exit(1);
  }
});

// Create a function to read from the group 
const redisStreamGroup = ({ streamName, id, streamGroupName, serviceIdentifier }) => {
  // listen to the stream group until a new message arrives, then consume it
  redisClient.xreadgroup('GROUP', streamGroupName, serviceIdentifier, 'BLOCK', 0, 'STREAMS', streamName, id, (err, str) => {
    if (err) {
      return console.error('Error reading from stream:', err);
    }
    if (str[0][0] === streamName) {
      str[0][1].forEach(message => {
        const messageId = message[0];
        const [, email, , username, , password] = message[1];
        // Send an exception message to the exceptions stream
        if (!email) {
          redisClient.xadd('exceptions', '*', 'reqId', messageId, 'message', 'email is required!');
        }
        if (!username) {
          redisClient.xadd('exceptions', '*', 'reqId', messageId, 'message', 'username is required!');
        }
        if (!password) {
          redisClient.xadd('exceptions', '*', 'reqId', messageId, 'message', 'password is required!');
        }
        // If the data is correct, create the user record
        if (email && username && password) {
          redisClient.HMSET(`user:${email}`, {
            username,
            email,
            password: bcrypt.hashSync(password, 7),
            isActive: false,
            createdAt: (new Date()).getTime()
          }, (e) => {
            if (e) {
              console.log('Error: ', e);
              return;
            }
            console.log('messageId ', messageId)
            // Send a message about the newly created user
            redisClient.xadd(outgoingStreamName, '*', 'reqId', messageId, 'data', `user:${email}`, (err, res) => {
              if (err) {
                console.log('Error: ', err);
                return;
              }
              console.log('outgoing message id: ', res)
            });
          });
        }
        // Acknowledge the message
        redisClient.xack(streamName, streamGroupName, messageId, (err) => {
          if (err) {
            console.log(err);
          }
          console.log('Ack message: ', messageId)
        });
      });
    }
    // listen the group messages again after finished from the previous message
    setTimeout(() => redisStreamGroup({ streamName, id: '>', streamGroupName, serviceIdentifier }), 0)
  });
}

// Invoke the service ^_^
redisStreamGroup({ streamName: incomingStreamName, id: '>', streamGroupName, serviceIdentifier });