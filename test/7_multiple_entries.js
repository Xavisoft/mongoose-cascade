const { default: mongoose, Schema } = require("mongoose");
const { emptyDB, createModelName } = require("./utils");
const { ON_DELETE } = require("../constants");
const casual = require("casual");
const { Cascade } = require("..");
const { assert } = require("chai");
const DeleteRestrictedError = require("../DeleteRestrictedError");


function pickRandom(arr=[], count=1) {
   const picked = [];
   for (let i = 0; i < count; i++) {

      if (arr.length == 0)
         break;

      // choose randomly
      const index = casual.integer(0, arr.length - 1);
      const choice = arr[index];
      picked.push(choice);

      // remove chosen from the choice list
      arr = arr.filter(item => item != choice);

   }

   return picked;
}


function makeEdgeCaseTest(onDelete, isFlat=true) {
   test(`{ onDelete: ${onDelete}} multiple entries (${isFlat ? 'flat' : 'objects'})`, async () => {

      // empty DB
      await emptyDB();

      // create models
      const referredModelName = createModelName();
      const ReferredModel = mongoose.model(referredModelName, new Schema({}));

      const attributeName = 'attribute';
      const childAttributeName = 'child';

      const refDefinition = {
         type: mongoose.SchemaTypes.ObjectId,
         ref: referredModelName,
         onDelete,
      };

      const schemaObj = {
         [attributeName]: isFlat ?
            [ refDefinition ]: [ { [childAttributeName]: refDefinition } ]
      }

      const ReferringModel = mongoose.model(createModelName(), new Schema(schemaObj));

      await ReferredModel.init();
      await ReferringModel.init();

      // create docs
      const referredDocsCount = casual.integer(7, 10);
      const referredDocs = await ReferredModel.create(Array(referredDocsCount).fill({}));

      const idsToBeDeleted = pickRandom(referredDocs, casual.integer(2, 5)).map(item => item._id);
      const referredDocIds = referredDocs.map(doc => doc._id);
      const referringDocPayload = {
         [attributeName]: isFlat ?
            referredDocIds : referredDocIds.map(_id => ({ [childAttributeName]: _id }))
      }

      let referringDocs = await ReferringModel.create([ referringDocPayload, referringDocPayload ]);

      // delete
      const cascade = new Cascade();
      cascade.init();

      try {
         await cascade.delete(ReferredModel, { _id: { $in: idsToBeDeleted }});
      } catch (err) {
         if (ON_DELETE.RESTRICT) {
            // should raise the following type of error
            assert.isTrue(err instanceof DeleteRestrictedError);

            // nothing should have been deleted
            const referredDocsFinalCount = await ReferredModel.countDocuments();
            assert.equal(referredDocsFinalCount, referredDocsCount);

            const referringDocsFinalCount = await ReferringModel.countDocuments();
            assert.equal(referringDocsFinalCount, referringDocs.length);

            return;
         }

         throw err;

      }

      // check db
      /// targeted referredDocs should be deleted
      const shouldBeEmpty = await ReferredModel.find({ _id: { $in: idsToBeDeleted }});
      assert.isEmpty(shouldBeEmpty);

      /// references should be affected
      referringDocs = await ReferringModel.find({});

      switch (onDelete) {
         case ON_DELETE.SET_NULL:

            for (const doc of referringDocs) {
               // no entry has been removed
               assert.equal(doc[attributeName].length, referredDocIds.length);

               // all references to deleted docs has been set to null
               const nullEntries = doc[attributeName].filter(item => {
                  if (isFlat)
                     return item === null;
                  return item[childAttributeName] === null;
               });

               assert.equal(nullEntries.length, idsToBeDeleted.length);
      
               for (const ref in doc[attributeName]) {
                  assert.isFalse(idsToBeDeleted.includes(isFlat ? ref : ref[attributeName]));
               }
            }

            break;

         case ON_DELETE.PULL:

            for (const doc of referringDocs) {
               // references to deleted docs has been removed
               assert.equal(doc[attributeName].length, referredDocIds.length - idsToBeDeleted.length);
      
               for (const ref in doc[attributeName]) {
                  assert.isFalse(idsToBeDeleted.includes(isFlat ? ref : ref[attributeName]));
               }
            }

            break;

         case ON_DELETE.CASCADE:
            // all referring docs have been deleted
            assert.isEmpty(referringDocs);
            break;
      
         default:
            throw new Error(`Unknown onDelete value: ${onDelete}`);
      }

   });
}


suite("Multiple docs, multiple entries", function() {

   Object
      .values(ON_DELETE)
      .forEach(onDelete => {
         makeEdgeCaseTest(onDelete, true); // reference array is flat, i.e. it's an array of ref ObjectIds 
         makeEdgeCaseTest(onDelete, false); // array is an array of objects containing attributes that a refs
      });

})