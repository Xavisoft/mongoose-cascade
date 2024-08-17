const mongoose = require("mongoose");
const { createModelName, emptyDB } = require("./utils");
const { cascade } = require("..");
const { assert } = require("chai");
const { ON_DELETE } = require("../constants");


suite("Session", function() {

   this.beforeAll(emptyDB);

   test("With and without external session", async () => {

      // create models
      const referredModelName = createModelName();
      const ReferredModel = mongoose.model(referredModelName, new mongoose.Schema({}));

      const referringModelName = createModelName();
      const ReferringModel = mongoose.model(referringModelName, new mongoose.Schema({
         attribute: {
            type: mongoose.SchemaTypes.ObjectId,
            ref: referredModelName,
            onDelete: ON_DELETE.CASCADE,
            required: true,
         }
      }));

      await mongoose.connection.syncIndexes();

      // with session
      {
         // create docs
         const referredDoc = await ReferredModel.create({});

         await ReferringModel.create([
            { attribute: referredDoc._id },
            { attribute: referredDoc._id },
         ]);

         // delete
         const session = await mongoose.startSession();
         session.startTransaction();

         await cascade(ReferredModel, { _id: referredDoc._id }, { session });
         await session.commitTransaction();
         await session.endSession();

         // check db
         const shouldBeNull = await ReferredModel.findById(referredDoc._id);
         assert.isNull(shouldBeNull);

         const shouldBeZero = await ReferringModel.countDocuments();
         assert.equal(shouldBeZero, 0);

      }

      // without session
      {
         // create docs
         const referredDoc = await ReferredModel.create({});

         await ReferringModel.create([
            { attribute: referredDoc._id },
            { attribute: referredDoc._id },
         ]);

         // delete
         await cascade(ReferredModel, { _id: referredDoc._id });

         // check db
         const shouldBeNull = await ReferredModel.findById(referredDoc._id);
         assert.isNull(shouldBeNull);

         const shouldBeZero = await ReferringModel.countDocuments();
         assert.equal(shouldBeZero, 0);

      }


      
   });
});