const casual = require('casual');
const { default: mongoose } = require('mongoose');

/**
 * 
 * @param {string} word 
 * @returns 
 */
function capitalize(word='') {
   return (word.charAt(0)?.toLocaleUpperCase() || '') + word.substring(1).toLocaleLowerCase();
}

function createModelName() {
   return [
      capitalize(casual.word),
      capitalize(casual.word),
      capitalize(casual.word),
      capitalize(casual.word),
      capitalize(casual.word),
   ].join('');
}

async function emptyDB() {
   
   let db = mongoose.connection.db;

   while (!db) {
      await delay(100);
      db = mongoose.connection.db;
   }

   const promises = (await db.collections()).map(collection => {
      return collection.drop()
   });

   return await Promise.all(promises);
}

function delay(millis) {
   return new Promise((resolve) => {
      setTimeout(resolve, millis);
   })
}


module.exports = {
   capitalize,
   createModelName,
   delay,
   emptyDB,
}