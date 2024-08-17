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

   const collections = await db.collections();
   
   for (const collection of collections) {
      await collection.drop();
   }

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