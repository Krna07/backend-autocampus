const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';

exports.generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
};

exports.verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};

exports.authenticate = async (req, res, next) => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      console.log('Authentication failed: No token provided');
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'NO_TOKEN'
      });
    }

    const decoded = exports.verifyToken(token);
    if (!decoded) {
      console.log('Authentication failed: Invalid token');
      return res.status(401).json({ 
        error: 'Invalid token',
        code: 'INVALID_TOKEN',
        message: 'Your session has expired. Please login again.'
      });
    }

    const user = await User.findById(decoded.userId).select('-passwordHash');
    if (!user) {
      console.log(`Authentication failed: User not found for userId ${decoded.userId} - Token may be from old database`);
      return res.status(401).json({ 
        error: 'User not found',
        code: 'USER_NOT_FOUND',
        message: 'Your account no longer exists. This may happen after database reset. Please clear your browser storage and login again.'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ 
      error: 'Authentication error',
      code: 'AUTH_ERROR'
    });
  }
};

exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      console.log('Authorization failed: No user in request');
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      console.log(`Authorization failed: User role '${req.user.role}' not in allowed roles [${roles.join(', ')}]`);
      return res.status(403).json({ 
        error: 'Access denied',
        message: `User role '${req.user.role}' is not authorized. Required roles: ${roles.join(', ')}`
      });
    }
    next();
  };
};

