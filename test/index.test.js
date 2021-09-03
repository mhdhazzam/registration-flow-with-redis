const redis = require('redis');

// Add redis stream commands
redis.add_command('xadd');
redis.add_command('xreadgroup');
redis.add_command('xread');
redis.add_command('xrevrange');

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

// Every 5 seconds send a registration-request to test the registration flow
setInterval(() => {
  // Generate random fake email
  const email = `test${Math.random()*1000}@test.com`;
  console.log('Sending registration-request with email: ', email)
  redisClient.xadd(incomingStreamName, '*', 'email', email, 'username', 'service_user', 'password', '1234', (err, id) => {
    if (err) {
      console.log(err);
    }
    console.log('message id, ',id)
    // Check if the message is in the incoming messages group 
    redisClient.xreadgroup('GROUP', streamGroupName, serviceIdentifier, 'STREAMS', incomingStreamName, '0', (err, str) => {
      if (err) {
        console.log('Error: ', err);
      }
      if (str[0][0] === incomingStreamName && str[0][1][0][0] !== id) {
        console.log('[Test Failed]: The message doesn\'t exist in the incoming messages group');
        console.log('message id: ', id);
        process.exit(1);
      }
      console.log('[Test Passed]: Message exists in the incoming messages group');
      
      // Check if the service creates user records after consuming the incoming messages
      setTimeout(() => redisClient.hmget(`user:${email}`,'email', 'isActive', (err, replay) => {
        if (err) {
          console.log('Error: ', err);
          process.exit(1);
        }
        const [userEmail, isActive] = replay;
        if (email !== userEmail || isActive !== 'false') {
          console.log('[Test Failed]: The service doesn\'t create user record');
          process.exit(1);
        }
        console.log('[Test Passed]: Service creates user records');
        console.log('email: ', userEmail);
        console.log('status: ', isActive)

        // Check if the service creates outgoing events by getting the last registration-result message
        redisClient.xrevrange(outgoingStreamName, '+', '-', 'COUNT', 1, (err, res) => {
          if (err) {
            console.log('Error: ', err);
            process.exit(1);
          }
          const reqId = res[0][1][1];
          if (id !== reqId) {
            console.log('[Test Failed]: The service doesn\'t product outgoing messages');
            process.exit(1);
          }
          console.log('[Test Passed]: Service creates outgoing messages');
          console.log('data: ', res[0][1][3])
          console.log('-----------------------')
        })
      }), 2800);
    });
  });
}, 5000);