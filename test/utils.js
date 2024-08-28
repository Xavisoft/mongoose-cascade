const casual = require('casual');
const { default: mongoose } = require('mongoose');
const { ON_DELETE } = require('../constants');
const { assert } = require('chai');
const DeleteRestrictedError = require('../DeleteRestrictedError');
const { Cascade } = require('..');


/**
 * @callback isDocModifiedAsExpectedCallback
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
 * @param {isDocModifiedAsExpectedCallback} opts.isNullSet
 * @param {isDocModifiedAsExpectedCallback} opts.isReferencePulled
 * @param {createReferringSchemaObjectCallback} opts.createReferringSchemaObject
 */
function makeTests(opts) {

   Object.values(ON_DELETE).forEach(onDelete => {

      // do not test for onDelete: PULL if the call back to verify
      // if the PULL operation is not provided
      if (onDelete === ON_DELETE.PULL) {
         if (!opts.isReferencePulled)
            return;
      }

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

         // create documents
         const referredDoc = await ReferredModel.create({});
         const { createReferringDocPayload } = opts;
         const referringDocPayload = createReferringDocPayload(referredDoc._id);

         const referringDocs = await ReferringModel.create([
            referringDocPayload,
            referringDocPayload,
         ]);

         // delete
         const cascade = new Cascade();
         cascade.init();

         try {
            await cascade.delete(ReferredModel, { _id: referredDoc._id });
         } catch (err) {
            if (onDelete === ON_DELETE.RESTRICT) {
               // should raise this specific error
               assert.isTrue(err instanceof DeleteRestrictedError);

               // nothing should be deleted
               const iAmNotDeleted = await ReferredModel.findById(referredDoc._id);
               assert.isNotNull(iAmNotDeleted);

               const referringDocsCount = await ReferringModel.countDocuments();
               assert.equal(referringDocsCount, referringDocs.length);

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
                  // all the referring docs must have been deleted
                  const shouldBeZero = await ReferringModel.countDocuments();
                  assert.equal(shouldBeZero, 0);
                  break;
               }

            case ON_DELETE.SET_NULL:
               { 
                  // all refs must have been set to null
                  const docs = await ReferringModel.find({});
                  const { isNullSet } = opts;

                  docs.forEach(doc => {
                     assert.isTrue(isNullSet(doc));
                  });

                  break;

               }

            case ON_DELETE.PULL:
               {
                  // all refs should be removed from their respective arrays
                  const docs = await ReferringModel.find({});
                  const { isReferencePulled } = opts;

                  docs.forEach(doc => {
                     assert.isTrue(isReferencePulled(doc));
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