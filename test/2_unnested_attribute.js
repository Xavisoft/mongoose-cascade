const { assert } = require("chai");
const { ON_DELETE } = require("../constants");
const { default: mongoose } = require("mongoose");
const { createModelName } = require("./utils");
const { cascade } = require("..");
const { buildReferenceMap } = require("../utils");
const DeleteRestrictedError = require("../DeleteRestrictedError");



function makeTest(onDelete) {
   test(onDelete, async () => {

      // create models
      const referredModelName = createModelName();
      const ReferredModel = mongoose.model(referredModelName, new mongoose.Schema({}));

      const ReferringModel = mongoose.model(createModelName(), new mongoose.Schema({
         attribute: {
            type: mongoose.SchemaTypes.ObjectId,
            ref: referredModelName,
            onDelete,
         }
      }));

      await mongoose.connection.syncIndexes();
      buildReferenceMap(true);

      // create documents
      const referredDoc = await ReferredModel.create({});
      await ReferringModel.create([
         { attribute: referredDoc._id },
         { attribute: referredDoc._id },
      ]);

      // delete
      try {
         await cascade(ReferredModel, { _id: referredDoc._id });
      } catch (err) {
         if (onDelete === ON_DELETE.RESTRICT) {
            assert.isTrue(err instanceof DeleteRestrictedError);
            return;
         }
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

               docs.forEach(doc => {
                  assert.isNull(doc.attribute);
               });

               break;

            }

         default:
            throw Error(`Unknown onDelete value: ${onDelete}`);
      }
      

   });
}


suite("Unnested attribute", function () {
   
   Object
      .values(ON_DELETE)
      .forEach(onDelete => {
         makeTest(onDelete);
      });
   
});