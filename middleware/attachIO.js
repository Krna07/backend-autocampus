// This middleware will be used in routes that need Socket.IO
// It's attached in server.js after io is initialized

module.exports = (io) => {
  return (req, res, next) => {
    req.io = io;
    next();
  };
};

