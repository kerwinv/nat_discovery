const discovery = require('../build/src/index').default;

console.log(discovery);

discovery()
  .then(type => {
    console.log(type);
  })
  .catch(e => {
    console.error(e);
  });
