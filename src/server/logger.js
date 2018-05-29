import winston from 'winston';
const level = process.env.LOG_LEVEL || 'debug';

export default new winston.Logger({
  transports: [
    new winston.transports.Console({
      level: level,
      prettyPring: true,
      colorize: true,
      timestamp: function () {
        return (new Date()).toISOString();
      }
    })
  ]
});
