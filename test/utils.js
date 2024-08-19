const casual = require('casual');
const { default: mongoose } = require('mongoose');
const { buildReferenceMap } = require('../utils');
const { ON_DELETE } = require('../constants');
const { assert } = require('chai');
const DeleteRestrictedError = require('../DeleteRestrictedError');
const { cascade } = require('..');


/**
 * @callback isNullSetCallback
 * @param {import('mongoose').Document} doc
 * @returns {boolean}
 */

/**
 * @callback createReferringDocPayloadCallback
 * @param {import('mongoose').Types.ObjectId} referredDocId
 * @returns {object}
 */

/**
 * @callback createReferringSchemaObjectCallback
 * @param {object} opts
 * @param {string} opts.onDelete
 * @param {string} opts.referredModelName
 * @returns {object}
 */

/**
 * 
 * @param {object} opts
 * @param {createReferringDocPayloadCallback} opts.createReferringDocPayload 
 * @param {isNullSetCallback} opts.isNullSet
 * @param {createReferringSchemaObjectCallback} opts.createReferringSchemaObject
 */
function makeTests(opts) {

   Object.values(ON_DELETE).forEach(onDelete => {
      test(onDelete, async () => {

         await emptyDB();

         // create models
         const referredModelName = createModelName();
         const ReferredModel = mongoose.model(referredModelName, new mongoose.Schema({}));

         const { createReferringSchemaObject } = opts;
         const referringSchemaObject = createReferringSchemaObject({ onDelete, referredModelName });
         const ReferringModel = mongoose.model(createModelName(), new mongoose.Schema(referringSchemaObject));

         await ReferredModel.init();
         await ReferringModel.init();
         buildReferenceMap(true);

         // create documents
         const referredDoc = await ReferredModel.create({});
         const { createReferringDocPayload } = opts;
         const referringDocPayload = createReferringDocPayload(referredDoc._id);

         await ReferringModel.create([
            referringDocPayload,
            referringDocPayload,
         ]);

         // delete
         try {
            await cascade(ReferredModel, { _id: referredDoc._id });
         } catch (err) {
            if (onDelete === ON_DELETE.RESTRICT) {
               assert.isTrue(err instanceof DeleteRestrictedError);
               return;
            }

            throw err;

         }
         
         // check DB
         const shouldBeNull = await ReferredModel.findById(referredDoc._id);
         assert.isNull(shouldBeNull);

         switch (onDelete) {
            case ON_DELETE.CASCADE:
               { 
                  const shouldBeZero = await ReferringModel.countDocuments();
                  assert.equal(shouldBeZero, 0);
                  break;
               }

            case ON_DELETE.SET_NULL:
               { 
                  const docs = await ReferringModel.find({});
                  const { isNullSet } = opts;

                  docs.forEach(doc => {
                     assert.isTrue(isNullSet(doc));
                  });

                  break;

               }

            default:
               throw Error(`Unknown onDelete value: ${onDelete}`);
         }
         

      });
   });
}

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
   
   // wait for connection
   let db = mongoose.connection.db;

   while (!db) {
      await delay(100);
      db = mongoose.connection.db;
   }

   // delete database
   await db.dropDatabase();

   // remove models to avoil resyncing
   for (const key in mongoose.models) {
      delete mongoose.models[key];
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
   makeTests,
}