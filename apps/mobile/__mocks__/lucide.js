const React = require('react');
const Icon = ({ size, color, ...rest }) => React.createElement('Icon', { size, color, ...rest });
module.exports = new Proxy(
  {},
  {
    get: () => Icon,
  },
);
