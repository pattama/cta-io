'use strict';

module.exports = function(max) {
  const data = [];
  const to = isNaN(max) ? 50 : max;
  for (let i = 0; i < to; i++) {
    data.push(i);
  }
  return data;
};